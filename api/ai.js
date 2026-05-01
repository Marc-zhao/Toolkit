// /api/ai.js - Vercel Serverless Function

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, max_tokens = 2000 } = req.body;

    // 提取user消息内容
    let userContent = '';
    for (const m of (messages || [])) {
      if (m.role === 'user') userContent = m.content;
    }

    // 把prompt里的中文指令词替换掉，只保留英文指令+数据
    // 这是触发input_sensitive的根本原因
    const safePrompt = userContent
      .replace(/你是英语教学.*?。/g, '')
      .replace(/只输出JSON数组.*?。/g, '')
      .replace(/不要任何markdown.*?。/g, '')
      .replace(/生成(\d+)道/g, 'Generate $1')
      .replace(/填空题/g, 'fill-in-the-blank exercises')
      .replace(/只输出JSON数组/g, 'Return ONLY a JSON array')
      .replace(/从\[开始.*?。/g, 'Start with [')
      .trim();

    const finalPrompt = `You are an English vocabulary teacher.
Task: ${safePrompt}
Rules: Return ONLY a valid JSON array. No explanation. No markdown. Start with [`;

    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-cp-4HqqfXmiPJ4VkN2K645mENVnjLVE96EM-qQN-soNwi2lR-Bl3BMEf7AKd-yIgSuSzSJ3z2vspKLW08qo-Lt8Tr3-4huwexpQ0NV-PkVZykf5oBWzrrF3XCY',
      },
      body: JSON.stringify({
        model: 'MiniMax-Text-01',
        messages: [{ role: 'user', content: finalPrompt }],
        max_tokens,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 记录详细信息
    console.log('input_sensitive:', data.input_sensitive);
    console.log('output_sensitive:', data.output_sensitive);
    console.log('finish_reason:', data.choices?.[0]?.finish_reason);
    console.log('content_length:', content.length);
    if (!content) {
      console.log('Full response:', JSON.stringify(data));
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
