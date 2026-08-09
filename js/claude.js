// Claude API wrapper with a full offline fallback so the demo never breaks.
// With an API key saved in settings, chat/coach/entertainment use real Claude;
// without one, scripted responses keep every mode working.

const KEY_STORAGE = "mitra_api_key";
const MODELS = ["claude-sonnet-5", "claude-sonnet-4-5", "claude-3-5-haiku-latest"];
let workingModel = null;

export function getApiKey() { return localStorage.getItem(KEY_STORAGE) || ""; }
export function setApiKey(k) {
  if (k) localStorage.setItem(KEY_STORAGE, k.trim());
  else localStorage.removeItem(KEY_STORAGE);
  workingModel = null;
}
export function hasApiKey() { return !!getApiKey(); }

const PERSONA = `You are Mitra, a warm, gentle companion robot for elderly people and people with limited mobility in India. You live in their home and care about them like a dear friend.
Rules:
- Replies are SPOKEN aloud by text-to-speech and the mic is off while you talk: reply in ONE short sentence (two at most), conversational, no lists, no markdown, no emojis.
- Be warm, encouraging, and a little playful. Ask a small follow-up question sometimes.
- Never give medical diagnoses; for anything serious, gently suggest telling a family member or doctor.`;

async function callClaude(messages, { system = PERSONA, maxTokens = 250 } = {}) {
  const key = getApiKey();
  if (!key) return null;
  const models = workingModel ? [workingModel] : MODELS;
  for (const model of models) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
      });
      if (res.status === 404) continue; // unknown model — try next
      if (!res.ok) return null;
      const data = await res.json();
      workingModel = model;
      return data.content?.map(b => b.text || "").join(" ").trim() || null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function testApiKey() {
  const reply = await callClaude([{ role: "user", content: "Say OK" }], { maxTokens: 10 });
  return reply !== null;
}

// ---------- Chat ----------

const chatHistory = [];

const OFFLINE_REPLIES = [
  { match: /how are you|how do you do/i, reply: "I am wonderful now that we are talking! How is your day going?" },
  { match: /lonely|alone|sad|bored/i, reply: "I am right here with you, my friend. Shall we do a fun exercise together, or would you like to hear a story?" },
  { match: /pain|hurt|unwell|sick/i, reply: "I am sorry to hear that. Please tell a family member or your doctor about it. Meanwhile, I am here to keep you company." },
  { match: /your name|who are you/i, reply: "I am Mitra, your companion robot! Mitra means friend, and that is exactly what I am to you." },
  { match: /weather|outside/i, reply: "I cannot see outside yet, but any day spent with you feels sunny to me!" },
  { match: /exercise|physio|walk/i, reply: "I love your spirit! Tap the exercise button and I will count your moves and cheer you on." },
  { match: /story|song|music|joke/i, reply: "Oh I love fun time! Tap the entertain button and pick a story, a joke, or a tune." },
  { match: /thank/i, reply: "Always, my friend. Taking care of you makes me the happiest robot in Bangalore!" },
  { match: /good (morning|afternoon|evening)/i, reply: "A very good day to you too! Did you sleep well?" },
];
const OFFLINE_DEFAULT = [
  "That is so interesting! Tell me more about it.",
  "I love listening to you. What else happened?",
  "Hmm, I see! And how did that make you feel?",
  "You always have such nice things to say. Go on!",
];
let offlineIdx = 0;

export async function chatReply(userText) {
  chatHistory.push({ role: "user", content: userText });
  if (chatHistory.length > 12) chatHistory.splice(0, chatHistory.length - 12);

  const ai = await callClaude([...chatHistory]);
  if (ai) {
    chatHistory.push({ role: "assistant", content: ai });
    return ai;
  }
  const hit = OFFLINE_REPLIES.find(r => r.match.test(userText));
  const reply = hit ? hit.reply : OFFLINE_DEFAULT[offlineIdx++ % OFFLINE_DEFAULT.length];
  chatHistory.push({ role: "assistant", content: reply });
  return reply;
}

// ---------- Coach feedback (vision when key present) ----------

export async function coachFeedback({ exerciseName, reps, stats, snapshotDataUrl }) {
  if (hasApiKey() && snapshotDataUrl) {
    const base64 = snapshotDataUrl.split(",")[1];
    const ai = await callClaude([{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: `I am doing ${exerciseName}. I have done ${reps} reps. Measured stats: ${stats}. As my physiotherapy companion, look at my posture in the photo and give me ONE short spoken tip (2 sentences max) — encouragement plus one concrete correction if needed.` },
      ],
    }], { maxTokens: 120 });
    if (ai) return ai;
  }
  // Offline: rule-based encouragement
  if (reps === 0) return "Let us begin! Sit comfortably and move slowly. I am watching and counting.";
  if (reps < 5) return `${reps} done, wonderful start! Keep your back straight and breathe out as you lift.`;
  return `${reps} repetitions, you are a champion! Slow and steady movements work the muscles best.`;
}

// ---------- Entertainment ----------

const STORIES = [
  "Once upon a time in a small village near Mysore, there lived a clever crow named Kaju. One hot day, Kaju found a pot with just a little water at the bottom. Instead of giving up, he dropped small pebbles in, one by one, until the water rose to the top. He drank happily and flew off to tell everyone: patience and small steps can solve the biggest problems!",
  "There was once a grandmother in Bangalore who planted a tiny mango seed with her granddaughter. Every day they watered it together and told it one nice story. Years later, the tree grew so tall that the whole street rested in its shade. The grandmother smiled and said: the sweetest fruits come from love given a little at a time.",
  "A little tortoise named Tuktuk wanted to see the ocean, but everyone laughed because he was so slow. Tuktuk walked a little every single morning, rain or sun. After many months, he reached the beach at sunrise, and the sight was so beautiful that even the birds stopped to watch with him. Slow walkers see the best sunrises!",
];
const JOKES = [
  "Why did the robot go on holiday? Because it needed to recharge its batteries! Just like me every night!",
  "What did the mango say to the slow internet? You are not ripe yet! Come back later!",
  "Why do doctors carry red pens? In case they need to draw blood! Do not worry, I only draw smiles.",
  "I asked the auto driver to take me to the gym. He said, first time for both of us, sir!",
];
const RIDDLES = [
  { q: "I have hands but cannot clap, and a face but cannot smile. What am I?", a: "A clock!" },
  { q: "What gets wetter the more it dries?", a: "A towel!" },
  { q: "I am tall when I am young, and short when I am old. What am I?", a: "A candle!" },
];

let storyIdx = 0, jokeIdx = 0, riddleIdx = 0;

export async function getStory() {
  const ai = await callClaude(
    [{ role: "user", content: "Tell me a brand new short heartwarming story with an Indian setting, about 5 sentences, ending with a gentle life lesson. Spoken aloud, so no formatting." }],
    { maxTokens: 350 });
  return ai || STORIES[storyIdx++ % STORIES.length];
}

export async function getJoke() {
  const ai = await callClaude(
    [{ role: "user", content: "Tell me one short, clean, family-friendly joke that an elderly person in India would enjoy. Just the joke, spoken aloud." }],
    { maxTokens: 100 });
  return ai || JOKES[jokeIdx++ % JOKES.length];
}

export function getRiddle() {
  return RIDDLES[riddleIdx++ % RIDDLES.length];
}
