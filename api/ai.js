const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || process.env.Zhipu;
const ZHIPU_CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
// These are public Supabase client credentials. The Zhipu key remains server-only.
const SUPABASE_URL = 'https://dosseusntiuzmldpwpow.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__BwexSIOwKIJfBVnQyqgJA_mg_jxMMc';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ZHIPU_API_KEY) return forwardToCanonical(req, res, '/api/ai');

  try {
    const { messages, max_tokens = 2000, temperature = 0.7, purpose = 'content_generation' } = req.body || {};
    const safeMessages = normalizeMessages(messages);
    if (!safeMessages.length) return res.status(400).json({ error: 'Missing messages' });
    if (safeMessages.length > 12 || safeMessages.reduce((n, m) => n + m.content.length, 0) > 24000) {
      return res.status(413).json({ error: 'Request is too large' });
    }

    const outputLimit = Math.min(Math.max(Number(max_tokens) || 2000, 400), 4000);
    const promptChars = safeMessages.reduce((n, message) => n + message.content.length, 0);
    const estimatedTokens = Math.ceil(promptChars / 1.5) + outputLimit;
    const quota = await reserveBudget(req, estimatedTokens, purpose);
    if (!quota.ok) return res.status(quota.status).json({ error: quota.error });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let data;
    try {
      const response = await fetch(ZHIPU_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ZHIPU_API_KEY,
        },
        body: JSON.stringify({
          model: 'glm-4-air',
          messages: safeMessages,
          max_tokens: outputLimit,
          temperature,
          stream: false,
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        console.error('[zhipu-ai] HTTP', response.status, text.slice(0, 300));
        if (response.status === 429 && (text.includes('1113') || text.includes('余额不足'))) {
          return res.status(429).json({ error: '智谱 AI 账户额度不足，请联系管理员补充额度' });
        }
        return res.status(response.status).json({ error: text.slice(0, 200) });
      }
      data = JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }

    const content = data.choices?.[0]?.message?.content || '';
    const cleaned = cleanJsonContent(content);
    if (cleaned !== content) data.choices[0].message.content = cleaned;

    return res.status(200).json(data);
  } catch (err) {
    const message = err.name === 'AbortError' ? 'AI 生成超过 30 秒，请重试；已有题库不会被删除' : err.message;
    console.error('[zhipu-ai] Error:', message);
    return res.status(500).json({ error: message });
  }
};

async function forwardToCanonical(req, res, path) {
  const host = String(req.headers.host || req.headers['x-forwarded-host'] || '').toLowerCase();
  if (host === 'vocaquest.cn' || host === 'www.vocaquest.cn') {
    return res.status(503).json({ error: 'AI service is not configured' });
  }
  try {
    const response = await fetch(`https://vocaquest.cn${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || '',
        'X-VocaQuest-Proxy': 'backup-deployment',
      },
      body: JSON.stringify(req.body || {}),
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    console.error('[zhipu-ai] Canonical proxy failed:', error.message);
    return res.status(502).json({ error: 'AI service is temporarily unavailable' });
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(m => m && typeof m.content === 'string' && m.content.trim())
    .map(m => ({
      role: m.role === 'system' ? 'system' : (m.role === 'assistant' ? 'assistant' : 'user'),
      content: m.content.trim(),
    }));
}

async function reserveBudget(req, estimatedTokens, purpose) {
  const authorization = req.headers.authorization || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return { ok: false, status: 401, error: 'Please sign in before using AI' };
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reserve_ai_budget`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': authorization,
      },
      body: JSON.stringify({
        p_estimated_tokens: estimatedTokens,
        p_kind: normalizePurpose(purpose),
      }),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' };
    }
    if (!response.ok) {
      console.error('[ai-quota] HTTP', response.status, (await response.text()).slice(0, 200));
      return { ok: false, status: 503, error: 'AI quota service is temporarily unavailable' };
    }
    const result = await response.json();
    if (result?.allowed) return { ok: true, budget: result };
    return { ok: false, status: 429, error: budgetError(result?.reason) };
  } catch (error) {
    console.error('[ai-quota] Error:', error.message);
    return { ok: false, status: 503, error: 'AI quota service is temporarily unavailable' };
  }
}

function normalizePurpose(value) {
  const normalized = String(value || 'content_generation').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return normalized || 'content_generation';
}

function budgetError(reason) {
  if (reason === 'hourly_limit') return '本小时 AI 生成次数已用完，请稍后再试';
  if (reason === 'daily_limit') return '今日 AI 生成额度已用完，明天会自动恢复';
  if (reason === 'global_budget') return '今日全站 AI 预算已达上限，普通学习功能仍可继续使用';
  return 'AI 预算服务暂时不可用，请稍后再试';
}

function cleanJsonContent(raw) {
  if (!raw) return raw;
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  if (isJson(cleaned)) return cleaned;

  const jsonStart = cleaned.indexOf('[');
  const jsonEnd = cleaned.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    const extracted = cleaned.substring(jsonStart, jsonEnd + 1);
    if (isJson(extracted)) return extracted;
  }

  const repaired = repairJsonArray(cleaned);
  return repaired || cleaned;
}

function isJson(value) {
  try {
    JSON.parse(value);
    return true;
  } catch (e) {
    return false;
  }
}

function repairJsonArray(raw) {
  const start = raw.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let lastComplete = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    if (raw[i] === '}') {
      depth--;
      if (depth === 0) lastComplete = i + 1;
    }
  }
  if (lastComplete === -1) return null;
  const fixed = raw.substring(start, lastComplete).replace(/,\s*$/, '') + ']';
  return isJson(fixed) ? fixed : null;
}
