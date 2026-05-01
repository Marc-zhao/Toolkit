// /api/ai.js - Vercel Serverless Function (CommonJS格式)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, max_tokens = 2000 } = req.body;

    // 把所有消息合并成单条英文prompt（避免MiniMax内容过滤）
    let systemMsg = '';
    let userMsg = '';
    for (const m of (messages || [])) {
      if (m.role === 'system') systemMsg = m.content;
      else if (m.role === 'user') userMsg = m.content;
    }

    const prompt = buildPrompt(systemMsg, userMsg);

    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-cp-4HqqfXmiPJ4VkN2K645mENVnjLVE96EM-qQN-soNwi2lR-Bl3BMEf7AKd-yIgSuSzSJ3z2vspKLW08qo-Lt8Tr3-4huwexpQ0NV-PkVZykf5oBWzrrF3XCY',
      },
      body: JSON.stringify({
        model: 'MiniMax-Text-01',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: max_tokens,
        temperature: 0.7,
        stream: false,
      }),
    });

    const data = await response.json();

    const finishReason = data.choices && data.choices[0] ? data.choices[0].finish_reason : '';
    const content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';

    console.log('finish_reason:', finishReason, '| output_sensitive:', data.output_sensitive, '| content_len:', content.length);

    // 内容被过滤时重试（去掉所有中文）
    if (!content || data.output_sensitive === true) {
      console.log('Retrying with simpler prompt...');
      const simplePrompt = `Generate English vocabulary exercises as a JSON array. Data: ${userMsg.replace(/[\u4e00-\u9fa5]/g, '')}. Return ONLY a JSON array starting with [.`;
      const retry = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sk-cp-4HqqfXmiPJ4VkN2K645mENVnjLVE96EM-qQN-soNwi2lR-Bl3BMEf7AKd-yIgSuSzSJ3z2vspKLW08qo-Lt8Tr3-4huwexpQ0NV-PkVZykf5oBWzrrF3XCY',
        },
        body: JSON.stringify({
          model: 'MiniMax-Text-01',
          messages: [{ role: 'user', content: simplePrompt }],
          max_tokens: max_tokens,
          temperature: 0.5,
          stream: false,
        }),
      });
      const retryData = await retry.json();
      return res.status(200).json(retryData);
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('api/ai error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

function buildPrompt(systemMsg, userMsg) {
  // 检测任务类型，构建不触发MiniMax内容过滤的英文prompt
  const combined = (systemMsg + ' ' + userMsg);

  if (combined.includes('fill') || combined.includes('填空') || combined.includes('sentence')) {
    // 提取词汇列表
    const wordMatch = userMsg.match(/(?:词汇|单词|words?)[：:]\s*([^\n]+)/i);
    const wordData = wordMatch ? wordMatch[1] : userMsg;
    const countMatch = userMsg.match(/(\d+)\s*道/);
    const count = countMatch ? countMatch[1] : '5';
    const diffMatch = userMsg.match(/(\d)\s*[)）]/);
    const diff = diffMatch ? diffMatch[1] : '1';

    return `Generate ${count} English fill-in-the-blank exercises. Return ONLY a JSON array.

Words: ${wordData}

Each JSON object needs these fields:
- word: the English vocabulary word
- meaning: Chinese meaning of the word
- sentence: English sentence using ____ as the blank
- translation: Chinese translation of the sentence (write the Chinese meaning at the blank position, NOT the English word)
- answer: the correct English word for the blank
- options: array of exactly 4 English word choices (must include the answer)
- steps: array of 3 Chinese hint strings
- grammar_point: brief Chinese grammar explanation
- difficulty: integer ${diff}

Respond with ONLY the JSON array. Example format:
[{"word":"run","meaning":"跑步","sentence":"I ____ every morning.","translation":"我每天早上跑步。","answer":"run","options":["run","walk","swim","fly"],"steps":["看句子结构","分析时态","选择动词"],"grammar_point":"一般现在时","difficulty":${diff}}]`;
  }

  if (combined.includes('review') || combined.includes('错题') || combined.includes('practice')) {
    const wordMatch = userMsg.match(/(?:Word list|词汇|错题)[：:]\s*([^\n]+)/i);
    const wordData = wordMatch ? wordMatch[1] : userMsg;
    const countMatch = userMsg.match(/(\d+)\s*(?:道|exercises?)/i);
    const count = countMatch ? countMatch[1] : '10';

    return `Create ${count} English vocabulary review fill-in-the-blank questions. Return ONLY a JSON array.

Vocabulary to review: ${wordData}

Each object: {"word":"...","meaning":"Chinese meaning","sentence":"English with ____","translation":"Chinese translation","answer":"correct word","options":["word1","word2","word3","word4"],"steps":["hint1","hint2","hint3"],"grammar_point":"Chinese note"}

ONLY output the JSON array, nothing else.`;
  }

  if (combined.includes('summary') || combined.includes('总结') || combined.includes('tags')) {
    const errMatch = userMsg.match(/(?:错题|errors?)[：:]\s*([^\n]+)/i);
    const errData = errMatch ? errMatch[1] : userMsg;

    return `Analyze these English vocabulary errors and return a JSON object.
Errors: ${errData}
Return ONLY: {"summary":"one sentence in Chinese","suggestion":"study advice in Chinese","tags":["grammar point 1","grammar point 2"]}`;
  }

  // 默认
  return `Complete this task and return ONLY valid JSON, no markdown:\n${userMsg}`;
}
