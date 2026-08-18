export default async function handler(req, res) {
  // CORS for local development
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Server missing OPENAI_API_KEY in Environment Variables' });
  }

  const { messages, system, maxTokens } = req.body;
  
  const formattedMessages = [{ role: 'system', content: system }];
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      const content = [];
      for (const item of msg.content) {
        if (item.type === 'text') content.push({ type: 'text', text: item.text });
        if (item.type === 'image') content.push({ type: 'image_url', image_url: { url: `data:${item.source.media_type};base64,${item.source.data}` } });
      }
      formattedMessages.push({ role: msg.role, content });
    } else {
      formattedMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const MODELS = ['gpt-4o', 'gpt-4o-mini'];
  
  for (const model of MODELS) {
    try {
      const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: maxTokens || 250, messages: formattedMessages }),
      });
      
      if (apiRes.status === 404) continue;
      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ error: 'OpenAI Error' });
      }
      
      const data = await apiRes.json();
      return res.status(200).json({ reply: data.choices[0].message.content.trim() });
    } catch (err) {
      console.error(err);
    }
  }
  
  return res.status(500).json({ error: 'All models failed' });
}
