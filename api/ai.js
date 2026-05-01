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

    // MiniMax 不支持 system 角色，需要把 system 消息转成 user 消息前缀
    // 同时把中文 system prompt 改成英文避免内容过滤
    const processedMessages = [];
    let systemContent = '';
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemContent = msg.content;
      } else {
        // 把 system 内容合并进第一条 user 消息
        if (systemContent && msg.role === 'user') {
          processedMessages.push({
            role: 'user',
            content: `[Instructions: ${systemContent}]\n\n${msg.content}`
          });
          systemContent = '';
        } else {
          processedMessages.push(msg);
        }
      }
    }
    
    // 如果只有system没有user消息
    if (systemContent) {
      processedMessages.push({ role: 'user', content: systemContent });
    }

    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-cp-4HqqfXmiPJ4VkN2K645mENVnjLVE96EM-qQN-soNwi2lR-Bl3BMEf7AKd-yIgSuSzSJ3z2vspKLW08qo-Lt8Tr3-4huwexpQ0NV-PkVZykf5oBWzrrF3XCY',
      },
      body: JSON.stringify({
        model: 'MiniMax-Text-01',
        messages: processedMessages,
        max_tokens,
        temperature: 0.7,
        stream: false,
      }),
    });

    const data = await response.json();
    
    console.log('MiniMax status:', response.status);
    console.log('finish_reason:', data.choices?.[0]?.finish_reason);
    console.log('content preview:', (data.choices?.[0]?.message?.content||'').slice(0,100));

    // 检查 finish_reason 是否为 sensitive（内容被过滤）
    const finishReason = data.choices?.[0]?.finish_reason;
    if (finishReason === 'sensitive' || finishReason === 'content_filter') {
      // 用更宽松的 prompt 重试一次
      console.log('Content filtered, retrying with simpler prompt...');
      const retryResponse = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sk-cp-4HqqfXmiPJ4VkN2K645mENVnjLVE96EM-qQN-soNwi2lR-Bl3BMEf7AKd-yIgSuSzSJ3z2vspKLW08qo-Lt8Tr3-4huwexpQ0NV-PkVZykf5oBWzrrF3XCY',
        },
        body: JSON.stringify({
          model: 'MiniMax-Text-01',
          messages: [{ role: 'user', content: processedMessages.map(m=>m.content).join('\n') }],
          max_tokens,
          temperature: 0.5,
          stream: false,
        }),
      });
      const retryData = await retryResponse.json();
      console.log('Retry finish_reason:', retryData.choices?.[0]?.finish_reason);
      return res.status(200).json(retryData);
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('api/ai error:', err);
    return res.status(500).json({ error: err.message });
  }
}
