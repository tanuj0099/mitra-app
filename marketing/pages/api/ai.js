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

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Server missing GROQ_API_KEY in Environment Variables' });
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

  const MODELS = ['llama-3.2-11b-vision-preview', 'llama-3.1-8b-instant'];
  
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    
    let currentMessages = formattedMessages;
    if (model === 'llama-3.1-8b-instant') {
      currentMessages = formattedMessages.map(msg => {
        if (Array.isArray(msg.content)) {
          const textOnly = msg.content.filter(c => c.type === 'text').map(c => c.text).join(" ");
          return { ...msg, content: textOnly };
        }
        return msg;
      });
    }

    try {
      const apiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: maxTokens || 250, messages: currentMessages }),
      });
      
      if (!apiRes.ok) {
        console.error("Groq Error for", model, await apiRes.text());
        if (i === MODELS.length - 1) return res.status(apiRes.status).json({ error: 'Groq Error' });
        continue;
      }
      
      const data = await apiRes.json();
      return res.status(200).json({ reply: data.choices[0].message.content.trim() });
    } catch (err) {
      console.error(err);
      if (i === MODELS.length - 1) return res.status(500).json({ error: 'Network Error' });
    }
  }
  
  return res.status(500).json({ error: 'All models failed' });
}
