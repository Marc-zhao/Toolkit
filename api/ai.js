const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const ZHIPU_CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://skvsssqfkzqudscrwiyt.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrdnNzc3Fma3pxdWRzY3J3aXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4OTY4MDgsImV4cCI6MjA5MTQ3MjgwOH0.lUi2lPlAOXSJRA3nuaIX6JpN_ecQNguI4bsQP3S62HM';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ZHIPU_API_KEY) return res.status(503).json({ error: 'AI service is not configured' });

  try {
    const { messages, max_tokens = 2000, temperature = 0.7 } = req.body || {};
    const safeMessages = normalizeMessages(messages);
    if (!safeMessages.length) return res.status(400).json({ error: 'Missing messages' });
    if (safeMessages.length > 12 || safeMessages.reduce((n, m) => n + m.content.length, 0) > 24000) {
      return res.status(413).json({ error: 'Request is too large' });
    }

    const quota = await consumeQuota(req, 40);
    if (!quota.ok) return res.status(quota.status).json({ error: quota.error });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7800);
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
          max_tokens: Math.min(Math.max(Number(max_tokens) || 2000, 1200), 4000),
          temperature,
          stream: false,
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        console.error('[zhipu-ai] HTTP', response.status, text.slice(0, 300));
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
    const message = err.name === 'AbortError' ? 'AI request timed out' : err.message;
    console.error('[zhipu-ai] Error:', message);
    return res.status(500).json({ error: message });
  }
};

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(m => m && typeof m.content === 'string' && m.content.trim())
    .map(m => ({
      role: m.role === 'system' ? 'system' : (m.role === 'assistant' ? 'assistant' : 'user'),
      content: m.content.trim(),
    }));
}

async function consumeQuota(req, limit) {
  const authorization = req.headers.authorization || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return { ok: false, status: 401, error: 'Please sign in before using AI' };
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': authorization,
      },
      body: JSON.stringify({ p_limit: limit }),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' };
    }
    if (!response.ok) {
      console.error('[ai-quota] HTTP', response.status, (await response.text()).slice(0, 200));
      return { ok: false, status: 503, error: 'AI quota service is temporarily unavailable' };
    }
    const allowed = await response.json();
    return allowed === true
      ? { ok: true }
      : { ok: false, status: 429, error: 'AI usage limit reached. Please try again next hour.' };
  } catch (error) {
    console.error('[ai-quota] Error:', error.message);
    return { ok: false, status: 503, error: 'AI quota service is temporarily unavailable' };
  }
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
