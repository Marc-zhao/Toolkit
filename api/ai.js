module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, max_tokens = 2000 } = req.body;

    let userContent = '';
    for (const m of (messages || [])) {
      if (m.role === 'user') userContent = m.content;
    }

    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-cp-4HqqfXmiPJ4VkN2K645mENVnjLVE96EM-qQN-soNwi2lR-Bl3BMEf7AKd-yIgSuSzSJ3z2vspKLW08qo-Lt8Tr3-4huwexpQ0NV-PkVZykf5oBWzrrF3XCY',
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.5',
        messages: [{ role: 'user', content: userContent }],
        max_tokens: Math.max(max_tokens, 4000), // 确保足够长度
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const finishReason = data.choices?.[0]?.finish_reason || '';

    console.log('finish_reason:', finishReason, '| content_len:', content.length);

    // JSON被截断时（finish_reason=length），尝试修复
    if (finishReason === 'length' && content.includes('[')) {
      console.log('JSON truncated, attempting repair...');
      const repaired = repairJSON(content);
      if (repaired) {
        // 返回修复后的内容
        data.choices[0].message.content = repaired;
        return res.status(200).json(data);
      }
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// 修复被截断的JSON数组
function repairJSON(raw) {
  try {
    // 先尝试直接解析
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    JSON.parse(cleaned);
    return cleaned; // 本来就是完整的
  } catch(e) {
    // 尝试找到最后一个完整的对象
    try {
      const start = raw.indexOf('[');
      if (start === -1) return null;
      let depth = 0;
      let lastComplete = start;
      for (let i = start; i < raw.length; i++) {
        if (raw[i] === '{') depth++;
        if (raw[i] === '}') {
          depth--;
          if (depth === 0) lastComplete = i + 1;
        }
      }
      // 截取到最后一个完整对象，加上结尾]
      const partial = raw.substring(start, lastComplete);
      // 去掉末尾的逗号
      const fixed = partial.replace(/,\s*$/, '') + ']';
      JSON.parse(fixed); // 验证
      console.log('JSON repaired successfully');
      return fixed;
    } catch(e2) {
      console.log('JSON repair failed:', e2.message);
      return null;
    }
  }
}
