module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, max_tokens = 2000 } = req.body;

    // 用正确的模型名（从MiniMax控制台截图确认）
    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-cp-4HqqfXmiPJ4VkN2K645mENVnjLVE96EM-qQN-soNwi2lR-Bl3BMEf7AKd-yIgSuSzSJ3z2vspKLW08qo-Lt8Tr3-4huwexpQ0NV-PkVZykf5oBWzrrF3XCY',
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.5',  // ✅ 正确模型名
        messages: messages,
        max_tokens: max_tokens,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    console.log('model:', 'MiniMax-M2.5');
    console.log('finish_reason:', data.choices?.[0]?.finish_reason);
    console.log('input_sensitive:', data.input_sensitive);
    console.log('output_sensitive:', data.output_sensitive);
    console.log('content_length:', (data.choices?.[0]?.message?.content || '').length);
    console.log('base_resp:', JSON.stringify(data.base_resp));

    return res.status(200).json(data);
  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
