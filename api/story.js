const crypto = require('node:crypto');

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || process.env.Zhipu;
const ZHIPU_CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const ZHIPU_IMAGE_URL = 'https://open.bigmodel.cn/api/paas/v4/images/generations';
const ZHIPU_IMAGE_MODEL = process.env.ZHIPU_IMAGE_MODEL || 'cogview-3-flash';
const ZHIPU_WATERMARK_ENABLED = false;
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
  let activeVersionId = '';
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

    const signature = packSignature(words);
    const chapterCount = Math.max(1, Math.ceil(words.length / 10));
    const storyBeatCount = Math.min(chapterCount, 48);
    const createNew = req.body?.createNew === true;
    const retryVersionId = /^[a-f0-9-]{36}$/i.test(String(req.body?.retryVersionId || ''))
      ? String(req.body.retryVersionId)
      : null;
    const [otherStories, versionLibrary] = await Promise.all([
      getExistingStoryContext(pack.id, signature, authorization),
      getStoryVersionLibrary(pack.id, authorization),
    ]);
    const existingStories = [...versionLibrary, ...otherStories].slice(0, 16);
    activePackId = pack.id;
    activeSignature = signature;
    if (
      !createNew
      &&
      pack.story_data?.status === 'partial'
      && pack.story_data?.signature === signature
      && pack.story_data?.version >= 4
      && pack.story_data?.chapterCount === chapterCount
      && pack.story_data?.story?.beats?.length === storyBeatCount
    ) {
      activeFallbackStory = pack.story_data;
    }
    const claim = await callRpc('claim_vq_story_version', {
      p_pack_id: pack.id,
      p_signature: signature,
      p_create_new: createNew,
      p_retry_version_id: retryVersionId,
    }, authorization);

    if (claim?.cached && claim.story_data) {
      return res.status(200).json({ cached: true, storyData: claim.story_data, versionId: claim.versionId, versionNo: claim.versionNo, isActive: true });
    }
    if (!claim?.claimed) {
      const status = claim?.reason === 'generating' ? 409 : (claim?.reason === 'forbidden' ? 403 : 400);
      const message = claim?.reason === 'generating'
        ? '这个词包的世界正在生成，请稍后刷新'
        : (claim?.reason === 'limit_reached' ? '每个词包最多保存 5 个世界，请直接选用已有版本' : '无法开始故事生成');
      return res.status(status).json({
        error: message,
        reason: claim?.reason || 'unknown',
      });
    }
    activeVersionId = String(claim.versionId || '');
    if (!activeVersionId) throw new Error('Story version was not allocated');
    const versionNo = Number(claim.versionNo) || 1;
    const generationSeed = crypto.createHash('sha256').update(`${signature}:${versionNo}:${activeVersionId}`).digest('hex');
    if (retryVersionId && claim.story_data?.status === 'partial') activeFallbackStory = claim.story_data;

    const quota = await callRpc('reserve_ai_budget', {
      p_estimated_tokens: 14000,
      p_kind: createNew ? 'pack_story_alternative' : 'pack_story_generation',
    }, authorization);
    if (!quota?.allowed) {
      await finishFailure(pack.id, activeVersionId, signature, 'AI 生成额度不足', authorization, activeFallbackStory);
      return res.status(429).json({ error: budgetError(quota?.reason) });
    }

    const generated = activeFallbackStory
      ? {
          story: activeFallbackStory.story,
          heroes: activeFallbackStory.heroes,
          art: activeFallbackStory.art,
        }
      : await generateStory(pack, words, generationSeed, existingStories, storyBeatCount);
    const imageResult = await generateAndStoreArt(pack, generated, generationSeed, authorization);
    const finalMapImage = imageResult.mapImage || generated.art.mapImage || '';
    const finalHeroImage = imageResult.heroImage || generated.art.heroImage || '';
    const artComplete = Boolean(finalMapImage && finalHeroImage);
    const storyData = {
      version: 5,
      status: artComplete ? 'ready' : 'partial',
      signature,
      worldVersionId: activeVersionId,
      worldVersionNo: versionNo,
      chapterCount,
      maxWordsPerChapter: 10,
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

    const saved = await callRpc('finish_vq_story_version', {
      p_pack_id: pack.id,
      p_version_id: activeVersionId,
      p_story_data: storyData,
    }, authorization);
    if (!saved?.saved) throw new Error('Generated story could not be saved');
    return res.status(200).json({ cached: false, storyData: saved.storyData || storyData, versionId: activeVersionId, versionNo, isActive: Boolean(saved.isActive) });
  } catch (error) {
    console.error('[pack-story]', error.message);
    if (activePackId && activeSignature && activeVersionId) {
      await finishFailure(activePackId, activeVersionId, activeSignature, error.message, authorization, activeFallbackStory);
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

async function getExistingStoryContext(packId, signature, authorization) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/word_packs?id=neq.${encodeURIComponent(packId)}&select=id,name,story_data&order=updated_at.desc&limit=30`,
    { headers: supabaseHeaders(authorization) }
  );
  if (!response.ok) return [];
  const seen = new Set();
  return (await response.json()).flatMap(pack => {
    const data = pack?.story_data;
    const story = data?.story;
    const storySignature = String(data?.signature || '');
    if (!['ready', 'partial'].includes(data?.status) || !story || storySignature === signature || seen.has(storySignature)) {
      return [];
    }
    seen.add(storySignature);
    return [{
      title: cleanText(story.title, 100),
      premise: cleanText(story.premise, 280),
      chapters: (story.beats || []).slice(0, 12).map(beat => cleanText(beat?.title, 80)).filter(Boolean),
      branches: (story.beats || []).slice(0, 12).flatMap(beat => [
        cleanText(beat?.a?.[0], 80),
        cleanText(beat?.b?.[0], 80),
      ]).filter(Boolean),
    }];
  }).slice(0, 12);
}

async function getStoryVersionLibrary(packId, authorization) {
  try {
    const library = await callRpc('list_vq_story_versions', { p_pack_id: packId }, authorization);
    return (library?.versions || []).flatMap(version => storyContext(version?.storyData)).slice(0, 8);
  } catch (error) {
    console.warn('[pack-story] Version context unavailable:', error.message);
    return [];
  }
}

function storyContext(data) {
  const story = data?.story;
  if (!['ready', 'partial'].includes(data?.status) || !story) return [];
  return [{
    title: cleanText(story.title, 100),
    premise: cleanText(story.premise, 280),
    chapters: (story.beats || []).slice(0, 12).map(beat => cleanText(beat?.title, 80)).filter(Boolean),
    branches: (story.beats || []).slice(0, 12).flatMap(beat => [cleanText(beat?.a?.[0], 80), cleanText(beat?.b?.[0], 80)]).filter(Boolean),
  }];
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

function packSignature(words) {
  const normalized = JSON.stringify({
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

const STORY_WORLDS = [
  ['浮空城邦劫案', '故事发生在风暴层之上的浮空城邦群，主线是一场跨城追捕与空艇劫案，核心冲突来自城市资源与阶层选择。'],
  ['深海边境救援', '故事发生在不断下沉的深海殖民站，主线是限时救援和生态灾变调查，必须包含潜航器、裂谷与发光生物群。'],
  ['极地机械远征', '故事发生在会移动的极地机械大陆，主线是护送一台失控气候引擎，必须包含雪原列车、机械部族与磁暴。'],
  ['沙海商队阴谋', '故事发生在会迁徙的沙海城邦，主线围绕商队竞速、失踪水源和政治阴谋展开，不得出现神秘古物传送。'],
  ['轨道残骸抢修', '故事发生在环绕行星的废弃空间站群，主线是抢修坠落轨道并揭穿企业封锁，必须包含失重行动与舱段抉择。'],
  ['荧光雨林守护战', '故事发生在会与居民沟通的巨型荧光雨林，主线是阻止采掘舰队并平衡不同聚落诉求，危险来自环境而非魔王。'],
  ['地下铁路起义', '故事发生在无日之城的地下铁路网，主线是护送证人与揭露能源垄断，必须包含列车追逐、换轨选择和城市派系。'],
  ['风暴群岛信使战', '故事发生在被永久风暴分割的群岛，主线是限时递送能阻止战争的证据，必须包含海空航行与立场冲突。'],
  ['火山锻城失控案', '故事发生在火山内部的工业锻城，主线是调查自动工坊失控与工人失踪，必须包含熔岩升降机和城市停机倒计时。'],
  ['月面档案谍战', '故事发生在月面移动档案城，主线是保护一份会改变殖民历史的证词，必须包含低重力追踪、身份伪装与多方谈判。'],
  ['机芯微缩都市', '故事发生在巨型机器内部的微缩都市，主线是阻止整台机器停摆，必须包含齿轮交通、能源分区与公民选择。'],
  ['巡回庆典破坏案', '故事发生在沿河移动的巨型巡回庆典，主线是找出连续破坏事件的幕后者，必须包含表演团队、移动舞台与公众信任。'],
].map(([name, required]) => ({ name, required }));

function selectStoryWorld(signature, existingStories) {
  const usedText = existingStories.map(story => `${story.title} ${story.premise}`).join(' ');
  const start = parseInt(signature.slice(0, 8), 16) % STORY_WORLDS.length;
  for (let offset = 0; offset < STORY_WORLDS.length; offset++) {
    const candidate = STORY_WORLDS[(start + offset) % STORY_WORLDS.length];
    if (!usedText.includes(candidate.name.slice(0, 4))) return candidate;
  }
  return STORY_WORLDS[start];
}

function existingStoryPrompt(existingStories) {
  if (!existingStories.length) return '当前没有可对比的旧故事，但仍必须避免常见异世界闯关模板。';
  return existingStories.map((story, index) =>
    `${index + 1}.《${story.title}》：${story.premise}；章节：${story.chapters.join('、')}；支线：${story.branches.join('、')}`
  ).join('\n');
}

async function generateStory(pack, words, signature, existingStories = [], chapterCount = 12) {
  const samples = sampleWords(words).map(word => `${word.w}=${word.m}${word.pos ? `(${word.pos})` : ''}`).join('；');
  const world = selectStoryWorld(signature, existingStories);
  const system = `你是资深青少年冒险游戏编剧和英语课程设计师。输出严格 JSON 对象，不要 Markdown。
故事必须原创、紧张、有悬念，适合 10-18 岁学生，不幼稚、不血腥。根据词包主题设计一个完整世界，绝不能复用固定模板。
本次必须采用“${world.name}”类型：${world.required}
严禁使用这些通用套路：意外穿越或传送、神秘古物启动、守护者试炼、符号森林、记忆回廊、镜像迷宫、真相祭坛、完成考验后回到现实。
单词练习是游戏机制，不要把“单词、词义、语法、语言、符号谜题”写成世界观里的魔法或密码。
必须返回：
{
 "story":{"id":"ai-${signature.slice(0, 12)}","title":"","short":"","premise":"","palette":["#深色","#中色","#亮色","#强调色"],"beats":[${chapterCount}项],"endings":{"a":"","b":""}},
 "heroes":[3项],
 "art":{"routeNames":["",""],"mapPrompt":"","heroPrompt":"","terrainTags":[6项]}
}
每个 beat 格式：
{"title":"","text":"","a":["支线标题","行动选择","通关结果"],"b":["支线标题","调查选择","通关结果"]}
第一章也必须有 a、b；title 和支线标题 4-14 个汉字，其余字段 8-32 个汉字。必须恰好输出 ${chapterCount} 个 beat，保持连续因果、两条路线和真正不同的结局。
heroes 固定 id 为 aria、noah、sora，每项格式：
{"id":"aria","name":"中文名 · 职业","trait":"","detail":"","lineA":"","lineB":""}
三名角色必须属于这个世界，外观、能力和叙事视角明显不同。
标题、章节和人物不得出现“词汇、单词、英语、学习、语言密码”等教学标签；必须先从词义中提炼至少三个具体意象，再把它们变成真实的地点、势力、谜团和危险。
mapPrompt 与 heroPrompt 用中文详细描述同一套原创复古 RPG 2.5D 美术，地图要有两条分支路线和足够地标，图片内不得有文字、标签、logo或水印。
每章的 title、a[0]、b[0] 必须是具体事件或地点，禁止“行动路线 10、调查路线 10、第十关”这类占位名称。`;
  const user = `词包名称：${String(pack.name).slice(0, 100)}
词数：${words.length}
代表词汇：${samples}
请先判断这批词的主题、时代感和情绪，再生成与它高度相关、不可与其他词包互换的世界、人物和 ${chapterCount} 章故事。
以下是系统中已有故事。新故事不得复用它们的核心场景、开端、地点顺序、人物功能、关键抉择或结局结构：
${existingStoryPrompt(existingStories)}`;

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const retryNote = attempt
      ? `\n上一次输出未通过校验：${cleanText(lastError?.message, 160)}。本次必须修复该问题，恰好返回 ${chapterCount} 个完整 beat，不得省略任何数组项或使用占位词。`
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
        max_tokens: Math.min(12000, 2600 + chapterCount * 190),
        temperature: attempt ? 0.78 : 0.86,
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
      return validateGeneratedStory(parseJsonObject(content), signature, existingStories, chapterCount);
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

function validateGeneratedStory(value, signature, existingStories = [], chapterCount = 12) {
  const story = value?.story;
  if (!story || !Array.isArray(story.beats) || story.beats.length !== chapterCount) {
    throw new Error(`AI returned an incomplete ${chapterCount}-chapter story`);
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
  assertStoryDistinct(story, existingStories);

  const heroIds = ['aria', 'noah', 'sora'];
  const heroes = heroIds.map((id, index) => {
    const source = (value.heroes || []).find(hero => hero?.id === id) || value.heroes?.[index] || {};
    const hero = {
      id,
      name: cleanText(source.name, 50),
      trait: cleanText(source.trait, 20),
      detail: cleanText(source.detail, 180),
      lineA: cleanText(source.lineA, 180),
      lineB: cleanText(source.lineB, 180),
    };
    if (!hero.name || !hero.trait || !hero.detail || !hero.lineA || !hero.lineB) {
      throw new Error(`AI protagonist ${index + 1} is incomplete`);
    }
    return hero;
  });
  const art = {
    routeNames: [cleanText(value.art?.routeNames?.[0], 30), cleanText(value.art?.routeNames?.[1], 30)],
    mapPrompt: cleanText(value.art?.mapPrompt, 1200),
    heroPrompt: cleanText(value.art?.heroPrompt, 1200),
    terrainTags: (value.art?.terrainTags || []).slice(0, 8).map(tag => cleanText(tag, 30)).filter(Boolean),
  };
  if (!art.routeNames.every(Boolean) || !art.mapPrompt || !art.heroPrompt || art.terrainTags.length < 4) {
    throw new Error('AI art direction is incomplete');
  }
  return { story, heroes, art };
}

function normalizeBeat(beat, index) {
  const branch = (value, label) => {
    const list = Array.isArray(value) ? value : [];
    const normalized = [
      cleanText(list[0], 80),
      cleanText(list[1], 180),
      cleanText(list[2], 220),
    ];
    if (normalized.some(item => !item) || /^(行动|调查|选择|支线)?路线\s*\d+$/i.test(normalized[0])) {
      throw new Error(`AI chapter ${index + 1} ${label} branch is incomplete`);
    }
    return normalized;
  };
  const normalized = {
    title: cleanText(beat?.title, 90),
    text: cleanText(beat?.text, 240),
    a: branch(beat?.a, 'A'),
    b: branch(beat?.b, 'B'),
  };
  if (!normalized.title || !normalized.text || /^(未知地标|第?\d+关|章节)\s*\d*$/i.test(normalized.title)) {
    throw new Error(`AI chapter ${index + 1} is incomplete`);
  }
  return normalized;
}

function assertStoryDistinct(story, existingStories) {
  const teachingLabels = /(词汇|单词|英语|学习|语言密码|符号谜题)/;
  const outline = [story.title, story.premise, ...story.beats.flatMap(beat => [beat.title, beat.a[0], beat.b[0]])].join(' ');
  if (teachingLabels.test([story.title, story.short, ...story.beats.map(beat => beat.title)].join(' '))) {
    throw new Error('AI used teaching labels as story content');
  }
  const genericMotifs = ['意外穿越', '意外进入', '传送', '神秘古物', '守护者', '试炼', '符号森林', '记忆回廊', '镜像迷宫', '真相祭坛', '回到现实'];
  if (genericMotifs.filter(motif => outline.includes(motif)).length >= 2) {
    throw new Error('AI reused the generic portal-and-trial story template');
  }
  for (const existing of existingStories) {
    if (story.title === existing.title) throw new Error('AI repeated an existing story title');
    const existingText = [existing.title, existing.premise, ...existing.chapters, ...existing.branches].join(' ');
    const sharedMotifs = genericMotifs.filter(motif => outline.includes(motif) && existingText.includes(motif));
    if (sharedMotifs.length >= 2) throw new Error(`AI repeated an existing story structure: ${sharedMotifs.join(', ')}`);
    if (diceSimilarity(outline, existingText) > 0.42) {
      throw new Error(`AI story is too similar to existing story ${existing.title}`);
    }
  }
}

function diceSimilarity(left, right) {
  const grams = value => {
    const normalized = String(value || '').replace(/[\s，。、“”‘’：；！？,.:'"!?-]/g, '');
    const result = new Set();
    for (let index = 0; index < normalized.length - 1; index++) result.add(normalized.slice(index, index + 2));
    return result;
  };
  const a = grams(left);
  const b = grams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap++;
  return (2 * overlap) / (a.size + b.size);
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
      body: JSON.stringify({
        model: ZHIPU_IMAGE_MODEL,
        prompt,
        size,
        watermark_enabled: ZHIPU_WATERMARK_ENABLED,
      }),
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

async function finishFailure(packId, versionId, signature, message, authorization, fallbackStory = null) {
  const failureData = fallbackStory
    ? {
        ...fallbackStory,
        status: 'partial',
        signature,
        retryError: String(message).slice(0, 180),
        retryFailedAt: new Date().toISOString(),
      }
    : {
        version: 5,
        status: 'failed',
        signature,
        failedAt: new Date().toISOString(),
        error: String(message).slice(0, 180),
      };
  try {
    await callRpc('finish_vq_story_version', {
      p_pack_id: packId,
      p_version_id: versionId,
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
