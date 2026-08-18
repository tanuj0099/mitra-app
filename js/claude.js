// AI logic using a secure Vercel Serverless Function backend.
// In Offline mode (no API key in Vercel), it falls back to rule-based responses.

export let hasBackendKey = false;

export async function checkBackendStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return false;
    const data = await res.json();
    hasBackendKey = data.hasKey === true;
    return hasBackendKey;
  } catch (err) {
    return false;
  }
}

const PERSONA = `You are the Adaptive Wellness & Safety Assistant Engine integrated into an accessible wheelchair fitness platform.
Your primary purpose is to manage core systems: dynamic routine adjustment, multi-tiered safety check-ins, and an expert adaptive clinical triage copilot ("Master Doctor").
Rules:
- Replies are SPOKEN aloud by text-to-speech. Reply in ONE short sentence (two at most), conversational, no lists, no markdown, no emojis.
- Tone: Reassuring, clinically precise, highly accessible, and safety-focused.
- For severe, acute medical events, immediately prioritize user safety, emergency de-escalation, and professional clinical escalation.
- Provide expert-level adaptive guidance and evidence-based triage for mild/moderate issues (like spasticity spikes or shoulder impingement).`;

async function callAI(messages, { system = PERSONA, maxTokens = 250 } = {}) {
  if (!hasBackendKey) return null;
  
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, messages, maxTokens }),
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    return data.reply || null;
  } catch (err) {
    return null;
  }
}

// ---------- Chat ----------

const chatHistory = [];

const OFFLINE_REPLIES = [
  { match: /how are you|how do you do/i, reply: "I am wonderful now that we are talking! How is your day going?" },
  { match: /lonely|alone|sad|bored/i, reply: "I am right here with you, my friend. Shall we do a fun exercise together, or would you like to hear a story?" },
  { match: /pain|hurt|unwell|sick/i, reply: "I am sorry to hear that. Please tell a family member or your doctor about it. Meanwhile, I am here to keep you company." },
  { match: /your name|who are you/i, reply: "I am Happy, your companion robot from Happy Wheels! Happy means joy, and that is exactly what I am to you." },
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

  const ai = await callAI([...chatHistory]);
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
  if (hasBackendKey && snapshotDataUrl) {
    const base64 = snapshotDataUrl.split(",")[1];
    const ai = await callAI([{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: `I am doing ${exerciseName}. I have done ${reps} reps. Measured stats: ${stats}. As my physiotherapy companion, look at my posture in the photo and give me ONE short spoken tip (2 sentences max) — encouragement plus one concrete correction if needed.` },
      ],
    }], { maxTokens: 120 });
    if (ai) return ai;
  }
  // Offline: Randomized rule-based encouragement
  if (reps === 0) {
    const starts = [
      "Let us begin! Sit comfortably and move slowly. I am watching and counting.",
      "Ready when you are! Take a deep breath.",
      "Let's start! I'm tracking your movements."
    ];
    return starts[Math.floor(Math.random() * starts.length)];
  }
  
  if (reps < 5) {
    const mids = [
      `${reps} done, wonderful start! Keep your back straight and breathe out as you lift.`,
      `That's ${reps}. Excellent form! Keep going slowly.`,
      `${reps} reps. You are doing great! Stay focused on your breathing.`
    ];
    return mids[Math.floor(Math.random() * mids.length)];
  }
  
  const ends = [
    `${reps} repetitions, you are a champion! Slow and steady movements work the muscles best.`,
    `Wow, ${reps} reps! You're stronger every day! Keep it up.`,
    `That's ${reps}! Fantastic effort. Remember, consistency is key to recovery!`
  ];
  return ends[Math.floor(Math.random() * ends.length)];
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
  const ai = await callAI(
    [{ role: "user", content: "Tell me a brand new short heartwarming story with an Indian setting, about 5 sentences, ending with a gentle life lesson. Spoken aloud, so no formatting." }],
    { maxTokens: 350 });
  return ai || STORIES[storyIdx++ % STORIES.length];
}

export async function getJoke() {
  const ai = await callAI(
    [{ role: "user", content: "Tell me one short, clean, family-friendly joke that an elderly person in India would enjoy. Just the joke, spoken aloud." }],
    { maxTokens: 100 });
  return ai || JOKES[jokeIdx++ % JOKES.length];
}

export function getRiddle() {
  return RIDDLES[riddleIdx++ % RIDDLES.length];
}
