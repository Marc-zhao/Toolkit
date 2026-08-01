const crypto = require('node:crypto');

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || process.env.Zhipu;
const ZHIPU_CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const ZHIPU_IMAGE_URL = 'https://open.bigmodel.cn/api/paas/v4/images/generations';
const ZHIPU_IMAGE_MODEL = process.env.ZHIPU_IMAGE_MODEL || 'cogview-3-flash';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dosseusntiuzmldpwpow.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable__BwexSIOwKIJfBVnQyqgJA_mg_jxMMc';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ZHIPU_API_KEY) return res.status(503).json({ error: 'AI service is not configured' });

  const authorization = req.headers.authorization || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return res.status(401).json({ error: 'Please sign in before generating a story' });
  }

  let activePackId = '';
  let activeSignature = '';
  let activeFallbackStory = null;
  try {
    const packId = String(req.body?.packId || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,100}$/.test(packId)) {
      return res.status(400).json({ error: 'Invalid word pack' });
    }

    const pack = await getPack(packId, authorization);
    if (!pack) return res.status(404).json({ error: 'Word pack not found' });
    const words = normalizeWords(pack.words);
    if (words.length < 4) return res.status(400).json({ error: 'The word pack needs at least four valid words' });

    const signature = packSignature(pack.name, words);
    activePackId = pack.id;
    activeSignature = signature;
    if (
      pack.story_data?.status === 'partial'
      && pack.story_data?.signature === signature
      && pack.story_data?.story?.beats?.length === 12
    ) {
      activeFallbackStory = pack.story_data;
    }
    const claim = await callRpc('claim_vq_story_generation', {
      p_pack_id: pack.id,
      p_signature: signature,
      p_retry: req.body?.retry === true,
    }, authorization);

    if (claim?.cached && claim.story_data) {
      return res.status(200).json({ cached: true, storyData: claim.story_data });
    }
    if (!claim?.claimed) {
      const status = claim?.reason === 'generating' ? 409 : (claim?.reason === 'forbidden' ? 403 : 400);
      return res.status(status).json({
        error: claim?.reason === 'generating' ? '这个词包的专属世界正在生成，请稍后刷新' : '无法开始故事生成',
        reason: claim?.reason || 'unknown',
      });
    }

    const quota = await callRpc('reserve_ai_budget', {
      p_estimated_tokens: 14000,
      p_kind: 'pack_story_generation',
    }, authorization);
    if (!quota?.allowed) {
      await finishFailure(pack.id, signature, 'AI 生成额度不足', authorization, activeFallbackStory);
      return res.status(429).json({ error: budgetError(quota?.reason) });
    }

    const generated = activeFallbackStory
      ? {
          story: activeFallbackStory.story,
          heroes: activeFallbackStory.heroes,
          art: activeFallbackStory.art,
        }
      : await generateStory(pack, words, signature);
    const imageResult = await generateAndStoreArt(pack, generated, signature, authorization);
    const finalMapImage = imageResult.mapImage || generated.art.mapImage || '';
    const finalHeroImage = imageResult.heroImage || generated.art.heroImage || '';
    const artComplete = Boolean(finalMapImage && finalHeroImage);
    const storyData = {
      version: 3,
      status: artComplete ? 'ready' : 'partial',
      signature,
      generatedAt: new Date().toISOString(),
      generator: {
        textModel: 'glm-4-air',
        imageModel: ZHIPU_IMAGE_MODEL,
        artStatus: artComplete ? 'ready' : 'fallback',
      },
      story: generated.story,
      heroes: generated.heroes,
      art: {
        ...generated.art,
        mapImage: finalMapImage,
        heroImage: finalHeroImage,
        errors: imageResult.errors,
      },
    };

    const saved = await callRpc('finish_vq_story_generation', {
      p_pack_id: pack.id,
      p_signature: signature,
      p_story_data: storyData,
    }, authorization);
    if (!saved) throw new Error('Generated story could not be saved');
    return res.status(200).json({ cached: false, storyData });
  } catch (error) {
    console.error('[pack-story]', error.message);
    if (activePackId && activeSignature) {
      await finishFailure(activePackId, activeSignature, error.message, authorization, activeFallbackStory);
    }
    return res.status(error.status || 500).json({ error: error.publicMessage || '专属世界生成失败，请稍后重试' });
  }
};

async function getPack(packId, authorization) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/word_packs?id=eq.${encodeURIComponent(packId)}&select=id,name,words,story_data`,
    { headers: supabaseHeaders(authorization) }
  );
  if (response.status === 401 || response.status === 403) throw httpError(401, '登录已过期，请重新登录');
  if (!response.ok) throw new Error(`Word pack lookup failed: ${response.status}`);
  return (await response.json())[0] || null;
}

async function callRpc(name, body, authorization) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: supabaseHeaders(authorization),
    body: JSON.stringify(body),
  });
  if (response.status === 401 || response.status === 403) throw httpError(401, '登录已过期，请重新登录');
  if (!response.ok) throw new Error(`${name} failed: ${response.status} ${(await response.text()).slice(0, 160)}`);
  return response.json();
}

function supabaseHeaders(authorization) {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': authorization,
  };
}

function normalizeWords(words) {
  if (!Array.isArray(words)) return [];
  const seen = new Set();
  return words.flatMap(item => {
    const w = String(item?.w || '').trim();
    const m = String(item?.m || '').trim();
    if (!w || !m || seen.has(w.toLowerCase())) return [];
    seen.add(w.toLowerCase());
    return [{ w: w.slice(0, 80), m: m.slice(0, 120), pos: String(item?.pos || '').slice(0, 20) }];
  }).slice(0, 1000);
}

function packSignature(name, words) {
  const normalized = JSON.stringify({
    name: String(name || '').trim(),
    words: words.map(word => [word.w.toLowerCase(), word.m, word.pos]),
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function sampleWords(words, limit = 120) {
  if (words.length <= limit) return words;
  const result = [];
  for (let index = 0; index < limit; index++) {
    result.push(words[Math.floor(index * (words.length - 1) / (limit - 1))]);
  }
  return result;
}

async function generateStory(pack, words, signature) {
  const samples = sampleWords(words).map(word => `${word.w}=${word.m}${word.pos ? `(${word.pos})` : ''}`).join('；');
  const system = `你是资深青少年冒险游戏编剧和英语课程设计师。输出严格 JSON 对象，不要 Markdown。
故事必须原创、紧张、有悬念，适合 10-18 岁学生，不幼稚、不血腥。根据词包主题设计一个完整世界，绝不能复用固定模板。
必须返回：
{
 "story":{"id":"ai-${signature.slice(0, 12)}","title":"","short":"","premise":"","palette":["#深色","#中色","#亮色","#强调色"],"beats":[12项],"endings":{"a":"","b":""}},
 "heroes":[3项],
 "art":{"routeNames":["",""],"mapPrompt":"","heroPrompt":"","terrainTags":[6项]}
}
每个 beat 格式：
{"title":"","text":"","a":["支线标题","行动选择","通关结果"],"b":["支线标题","调查选择","通关结果"]}
第一章也必须有 a、b；title 和支线标题 4-14 个汉字，其余字段 12-45 个汉字。必须恰好输出 12 个 beat，保持连续因果、两条路线和真正不同的结局。
heroes 固定 id 为 aria、noah、sora，每项格式：
{"id":"aria","name":"中文名 · 职业","trait":"","detail":"","lineA":"","lineB":""}
三名角色必须属于这个世界，外观、能力和叙事视角明显不同。
标题、章节和人物不得出现“词汇、单词、英语、学习、语言密码”等教学标签；必须先从词义中提炼至少三个具体意象，再把它们变成真实的地点、势力、谜团和危险。
mapPrompt 与 heroPrompt 用中文详细描述同一套原创复古 RPG 2.5D 美术，地图要有至少 12 个地标和两条分支路线，图片内不得有文字。`;
  const user = `词包名称：${String(pack.name).slice(0, 100)}
词数：${words.length}
代表词汇：${samples}
请先判断这批词的主题、时代感和情绪，再生成与它高度相关、不可与其他词包互换的世界、人物和 12 章故事。`;

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const retryNote = attempt
      ? '\n上一次输出未通过结构校验。本次务必压缩文字并恰好返回 12 个完整 beat，不得省略任何数组项。'
      : '';
    const response = await fetchWithTimeout(ZHIPU_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-4-air',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user + retryNote }],
        max_tokens: 6500,
        temperature: attempt ? 0.72 : 0.84,
        stream: false,
        response_format: { type: 'json_object' },
      }),
    }, 60000);
    const text = await response.text();
    if (!response.ok) {
      lastError = new Error(`Zhipu story HTTP ${response.status}: ${text.slice(0, 180)}`);
      if (attempt === 0 && response.status === 429) {
        await delay(4500);
        continue;
      }
      throw lastError;
    }
    try {
      const content = JSON.parse(text).choices?.[0]?.message?.content || '';
      return validateGeneratedStory(parseJsonObject(content), signature);
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await delay(1500);
        continue;
      }
    }
  }
  throw lastError || new Error('AI returned an invalid story');
}

function parseJsonObject(raw) {
  const clean = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch (error) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw error;
  }
}

function validateGeneratedStory(value, signature) {
  const story = value?.story;
  if (!story || !Array.isArray(story.beats) || story.beats.length !== 12) {
    throw new Error('AI returned an incomplete 12-chapter story');
  }
  story.id = `ai-${signature.slice(0, 12)}`;
  story.title = cleanText(story.title, 100);
  story.short = cleanText(story.short, 30);
  story.premise = cleanText(story.premise, 280);
  story.palette = normalizePalette(story.palette);
  story.beats = story.beats.map((beat, index) => normalizeBeat(beat, index));
  story.endings = {
    a: cleanText(story.endings?.a, 300),
    b: cleanText(story.endings?.b, 300),
  };
  if (!story.title || !story.short || !story.premise || !story.endings.a || !story.endings.b) {
    throw new Error('AI story metadata is incomplete');
  }

  const heroIds = ['aria', 'noah', 'sora'];
  const heroes = heroIds.map((id, index) => {
    const source = (value.heroes || []).find(hero => hero?.id === id) || value.heroes?.[index] || {};
    return {
      id,
      name: cleanText(source.name, 50) || ['阿澜 · 先锋', '诺亚 · 学者', '索拉 · 游侠'][index],
      trait: cleanText(source.trait, 20) || ['勇气', '洞察', '共情'][index],
      detail: cleanText(source.detail, 180),
      lineA: cleanText(source.lineA, 180),
      lineB: cleanText(source.lineB, 180),
    };
  });
  const art = {
    routeNames: [cleanText(value.art?.routeNames?.[0], 30), cleanText(value.art?.routeNames?.[1], 30)],
    mapPrompt: cleanText(value.art?.mapPrompt, 1200),
    heroPrompt: cleanText(value.art?.heroPrompt, 1200),
    terrainTags: (value.art?.terrainTags || []).slice(0, 8).map(tag => cleanText(tag, 30)).filter(Boolean),
  };
  if (!art.mapPrompt || !art.heroPrompt) throw new Error('AI art direction is incomplete');
  return { story, heroes, art };
}

function normalizeBeat(beat, index) {
  const branch = (value, label) => {
    const list = Array.isArray(value) ? value : [];
    return [
      cleanText(list[0], 80) || `${label}路线 ${index + 1}`,
      cleanText(list[1], 180),
      cleanText(list[2], 220),
    ];
  };
  return {
    title: cleanText(beat?.title, 90) || `未知地标 ${index + 1}`,
    text: cleanText(beat?.text, 240),
    a: branch(beat?.a, '行动'),
    b: branch(beat?.b, '调查'),
  };
}

function normalizePalette(palette) {
  const fallback = ['#07152b', '#2558a7', '#69d5ff', '#ffd76a'];
  return fallback.map((color, index) => /^#[0-9a-f]{6}$/i.test(palette?.[index]) ? palette[index] : color);
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function generateAndStoreArt(pack, generated, signature, authorization) {
  const baseStyle = '原创复古RPG 2.5D，手绘像素融合，1990年代主机冒险游戏质感，清晰丰富，适合青少年，无文字、无标签、无UI、无边框、无logo、无水印。';
  const mapPrompt = `${baseStyle} 16:9俯视斜角完整世界地图。${generated.art.mapPrompt} 必须清楚画出两条可探索路线和至少12个地标，起点在左下，终点在右上。`;
  const heroPrompt = `${baseStyle} 3:2角色选择立绘。严格分成三个等宽区域，三位角色全身、同尺度、互不遮挡：${generated.heroes.map(hero => `${hero.name}，${hero.detail}`).join('；')}。${generated.art.heroPrompt}`;
  const tasks = [];
  try {
    tasks.push({ status: 'fulfilled', value: await generateImage(mapPrompt, '1440x720') });
  } catch (error) {
    tasks.push({ status: 'rejected', reason: error });
  }
  await delay(1800);
  try {
    tasks.push({ status: 'fulfilled', value: await generateImage(heroPrompt, '1344x768') });
  } catch (error) {
    tasks.push({ status: 'rejected', reason: error });
  }
  const errors = [];
  let mapImage = '';
  let heroImage = '';
  if (tasks[0].status === 'fulfilled') {
    try {
      mapImage = await uploadAsset(pack.id, signature, 'map', tasks[0].value, authorization);
    } catch (error) {
      errors.push(`map-upload:${error.message}`);
    }
  } else {
    errors.push(`map:${tasks[0].reason.message}`);
  }
  if (tasks[1].status === 'fulfilled') {
    try {
      heroImage = await uploadAsset(pack.id, signature, 'heroes', tasks[1].value, authorization);
    } catch (error) {
      errors.push(`heroes-upload:${error.message}`);
    }
  } else {
    errors.push(`heroes:${tasks[1].reason.message}`);
  }
  return { mapImage, heroImage, errors: errors.map(error => error.slice(0, 180)), complete: Boolean(mapImage && heroImage) };
}

async function generateImage(prompt, size) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetchWithTimeout(ZHIPU_IMAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
      },
      body: JSON.stringify({ model: ZHIPU_IMAGE_MODEL, prompt, size }),
    }, 50000);
    const text = await response.text();
    if (response.status === 429 && attempt === 0) {
      await delay(4500);
      continue;
    }
    if (!response.ok) throw new Error(`Zhipu image HTTP ${response.status}: ${text.slice(0, 120)}`);
    const url = JSON.parse(text).data?.[0]?.url;
    if (!/^https:\/\//i.test(url || '')) throw new Error('Image URL is missing');
    return url;
  }
  throw new Error('Image generation retry failed');
}

async function uploadAsset(packId, signature, kind, sourceUrl, authorization) {
  const source = await fetchWithTimeout(sourceUrl, {}, 20000);
  if (!source.ok) throw new Error(`Generated image download failed: ${source.status}`);
  const contentType = /^image\/(jpeg|png|webp)$/i.test(source.headers.get('content-type') || '')
    ? source.headers.get('content-type')
    : 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : (contentType.includes('webp') ? 'webp' : 'jpg');
  const safePackId = packId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const nonce = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const path = `${safePackId}/${signature.slice(0, 16)}-${kind}-${nonce}.${extension}`;
  const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/story-assets/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': authorization,
      'Content-Type': contentType,
    },
    body: Buffer.from(await source.arrayBuffer()),
  });
  if (!upload.ok) throw new Error(`Story asset upload failed: ${upload.status} ${(await upload.text()).slice(0, 100)}`);
  return `${SUPABASE_URL}/storage/v1/object/public/story-assets/${path}`;
}

async function finishFailure(packId, signature, message, authorization, fallbackStory = null) {
  const failureData = fallbackStory
    ? {
        ...fallbackStory,
        status: 'partial',
        signature,
        retryError: String(message).slice(0, 180),
        retryFailedAt: new Date().toISOString(),
      }
    : {
        version: 3,
        status: 'failed',
        signature,
        failedAt: new Date().toISOString(),
        error: String(message).slice(0, 180),
      };
  try {
    await callRpc('finish_vq_story_generation', {
      p_pack_id: packId,
      p_signature: signature,
      p_story_data: failureData,
    }, authorization);
  } catch (error) {
    console.error('[pack-story] Could not save failure:', error.message);
  }
}

function budgetError(reason) {
  if (reason === 'hourly_limit') return '本小时 AI 生成次数已用完，请稍后再试';
  if (reason === 'daily_limit') return '今日 AI 生成额度已用完，明天会自动恢复';
  if (reason === 'global_budget') return '今日全站 AI 预算已达上限';
  return 'AI 预算服务暂时不可用';
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpError(status, publicMessage) {
  const error = new Error(publicMessage);
  error.status = status;
  error.publicMessage = publicMessage;
  return error;
}
