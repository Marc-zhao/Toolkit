// /api/ai.js - Vercel Serverless Function

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, max_tokens = 2000 } = req.body;

    // MiniMax 的 prompt 工程：
    // 1. 把所有消息合并成一条 user 消息（避免 system 角色触发过滤）
    // 2. 完全用英文（中文内容触发 output_sensitive）
    // 3. 把中文内容放在数据里而不是 prompt 指令里
    
    // 提取 system 和 user 内容
    let systemMsg = '';
    let userMsg = '';
    for (const m of messages) {
      if (m.role === 'system') systemMsg = m.content;
      else if (m.role === 'user') userMsg = m.content;
    }

    // 构建单条英文 prompt
    // 把中文数据原样保留（数据本身不触发过滤），只把指令改成英文
    const combinedPrompt = buildEnglishPrompt(systemMsg, userMsg);

    const body = {
      model: 'MiniMax-Text-01',
      messages: [{ role: 'user', content: combinedPrompt }],
      max_tokens,
      temperature: 0.7,
      stream: false,
    };

    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-cp-4HqqfXmiPJ4VkN2K645mENVnjLVE96EM-qQN-soNwi2lR-Bl3BMEf7AKd-yIgSuSzSJ3z2vspKLW08qo-Lt8Tr3-4huwexpQ0NV-PkVZykf5oBWzrrF3XCY',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // 日志
    const finishReason = data.choices?.[0]?.finish_reason;
    const content = data.choices?.[0]?.message?.content || '';
    console.log('finish_reason:', finishReason);
    console.log('output_sensitive:', data.output_sensitive);
    console.log('base_resp:', JSON.stringify(data.base_resp));
    console.log('content length:', content.length);

    // 如果内容被过滤，返回详细错误给前端
    if (!content || data.output_sensitive) {
      return res.status(200).json({
        error: 'content_filtered',
        output_sensitive: data.output_sensitive,
        finish_reason: finishReason,
        base_resp: data.base_resp,
        // 返回一个假 choices 结构让前端能识别错误
        choices: [{ message: { content: '' }, finish_reason: finishReason || 'sensitive' }]
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('api/ai error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function buildEnglishPrompt(systemMsg, userMsg) {
  // 把中文的 system/user prompt 转成不触发过滤的形式
  // 关键：指令用英文，数据（单词、中文释义）保留原样放在数据区
  
  // 检测任务类型
  if (userMsg.includes('填空题') || userMsg.includes('fill') || userMsg.includes('sentence')) {
    // 句子填空题生成
    // 提取词汇数据（保留中文，放在数据区不触发过滤）
    const wordData = userMsg.match(/词汇[:：]([^\n]+)/)?.[1] || 
                     userMsg.match(/单词[:：]([^\n]+)/)?.[1] ||
                     userMsg.match(/words?[:：]([^\n]+)/i)?.[1] || '';
    const count = userMsg.match(/生成(\d+)道/)?.[1] || 
                  userMsg.match(/(\d+)\s*道/)?.[1] || '5';
    
    return `Generate ${count} English fill-in-the-blank exercises. Return ONLY a JSON array, no other text.

Vocabulary data: ${wordData || userMsg}

Each array item must have these exact fields:
- "word": the English word
- "meaning": Chinese meaning  
- "sentence": English sentence with ____ as blank
- "translation": Chinese translation (replace the blank word with its Chinese meaning, do not write the English word)
- "answer": the correct word for the blank
- "options": array of 4 English words (include the answer)
- "steps": array of 3 hint strings in Chinese
- "grammar_point": brief grammar note in Chinese
- "difficulty": number 1-3

Output format: [{"word":"...","meaning":"...","sentence":"...","translation":"...","answer":"...","options":["...","...","...","..."],"steps":["...","...","..."],"grammar_point":"...","difficulty":1},...]

Start your response with [ and end with ]`;
  }
  
  if (userMsg.includes('错题') || userMsg.includes('review') || userMsg.includes('练习')) {
    // Boss/推题生成
    const wordData = userMsg.match(/词汇[:：]([^\n]+)/)?.[1] ||
                     userMsg.match(/错题[:：]([^\n]+)/)?.[1] ||
                     userMsg.match(/words?[:：]([^\n]+)/i)?.[1] || userMsg;
    const count = userMsg.match(/生成(\d+)道/)?.[1] ||
                  userMsg.match(/(\d+)\s*道/)?.[1] || '10';

    return `Create ${count} English vocabulary review exercises as a JSON array. Return ONLY the JSON array.

Word list: ${wordData}

Each item needs:
- "word": English word
- "meaning": Chinese translation
- "sentence": English sentence with ____ blank  
- "translation": Chinese sentence (use Chinese meaning instead of the English word)
- "answer": correct word
- "options": 4 English choices array
- "steps": 3 Chinese hint strings
- "grammar_point": Chinese grammar note

Return ONLY: [{"word":"...","meaning":"...","sentence":"...","translation":"...","answer":"...","options":[...],"steps":[...],"grammar_point":"..."},...]`;
  }

  if (userMsg.includes('summary') || userMsg.includes('总结') || userMsg.includes('suggestion')) {
    // AI总结错题
    return `Analyze these English vocabulary errors and return a JSON object. Return ONLY the JSON.

Data: ${userMsg}

Return format: {"summary":"one sentence summary in Chinese","suggestion":"1-2 sentences study advice in Chinese","tags":["grammar point 1","grammar point 2"]}`;
  }

  // 默认：直接传递但把中文指令部分替换为英文
  return `Complete this English education task and return ONLY JSON output, no markdown, no explanation:\n\n${userMsg}`;
}
