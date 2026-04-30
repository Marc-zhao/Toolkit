// /api/ai.js - Vercel Serverless Function
// 放在项目根目录的 api/ 文件夹里

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, max_tokens = 2000 } = req.body;

    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-cp-4HqqfXmiPJ4VkN2K645mENVnjLVE96EM-qQN-soNwi2lR-Bl3BMEf7AKd-yIgSuSzSJ3z2vspKLW08qo-Lt8Tr3-4huwexpQ0NV-PkVZykf5oBWzrrF3XCY',
      },
      body: JSON.stringify({
        model: 'MiniMax-Text-01',
        messages,
        max_tokens,
        temperature: 0.7,
        stream: false,
      }),
    });

    const data = await response.json();

    // 调试：把完整响应记录到Vercel日志
    console.log('MiniMax status:', response.status);
    console.log('MiniMax response keys:', Object.keys(data));
    if (data.choices) {
      console.log('choices[0]:', JSON.stringify(data.choices[0]).slice(0, 200));
    }

    if (!response.ok) {
      return res.status(200).json({
        error: `MiniMax API错误 ${response.status}`,
        detail: data
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('api/ai error:', err);
    return res.status(500).json({ error: err.message });
  }
}
