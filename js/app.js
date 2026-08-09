// Mitra companion robot — main app: hands-free voice control, screens, chat,
// exercise coach, air piano, entertainment, settings.

import { RobotFace } from "./face.js";
import { initSpeech, unlockAudio, speak, stopSpeaking, listenOnce, hasRecognition, listVoices, setVoice } from "./speech.js";
import { chatReply, getStory, getJoke, getRiddle, getApiKey, setApiKey, testApiKey, hasApiKey } from "./claude.js";
import { Coach } from "./coach.js";
import { AirPiano } from "./piano.js";
import { VoiceLoop } from "./voice.js";

const $ = (id) => document.getElementById(id);

// ---------- Faces ----------
const faces = {
  boot: new RobotFace($("boot-face")),
  home: new RobotFace($("home-face")),
  chat: new RobotFace($("chat-face")),
  entertain: new RobotFace($("ent-face")),
};
let activeFace = faces.boot;
faces.boot.start();

// ---------- Screen navigation ----------
const screens = ["boot", "home", "chat", "coach", "entertain", "piano"];
let currentScreen = "boot";

const captions = { home: "home-caption", chat: "chat-caption", entertain: "ent-caption" };
function activeCaption() {
  const id = captions[currentScreen];
  return id ? $(id) : null;
}
function setCaption(text) {
  const el = activeCaption();
  if (el) el.textContent = text;
}

function show(name) {
  stopSpeaking();
  if (currentScreen === "coach" && name !== "coach") coach.stop();
  if (currentScreen === "piano" && name !== "piano") piano.stop();
  screens.forEach(s => $(`screen-${s}`).classList.toggle("active", s === name));
  currentScreen = name;
  Object.values(faces).forEach(f => f.stop());
  if (faces[name]) {
    activeFace = faces[name];
    activeFace.setState("idle");
    activeFace.start();
  }
}

document.querySelectorAll("[data-back]").forEach(btn =>
  btn.addEventListener("click", () => goHome())
);

async function goHome(sayLine) {
  show("home");
  if (sayLine) {
    setCaption(sayLine);
    await speak(sayLine);
  }
}

// ---------- Hands-free voice control ----------

const voiceLoop = new VoiceLoop(handleUtterance, (listening) => {
  $("voice-indicator").classList.toggle("hidden", !listening);
  if (listening && faces[currentScreen]) activeFace.setState("listening");
});

initSpeech((speaking) => {
  voiceLoop.setSpeaking(speaking);
  if (faces[currentScreen]) activeFace.setState(speaking ? "speaking" : "idle");
});

function showHeard(text) {
  const toast = $("voice-toast");
  toast.textContent = `🗣 "${text}"`;
  toast.classList.remove("hidden");
  clearTimeout(showHeard._t);
  showHeard._t = setTimeout(() => toast.classList.add("hidden"), 4000);
}

async function handleUtterance(raw) {
  const t = raw.toLowerCase();
  const has = (re) => re.test(t);
  showHeard(raw);

  // On the coach screen, only exercise commands — ignore chatter mid-workout
  if (currentScreen === "coach") {
    if (has(/switch|next|change|different exercise/)) { coach.switchExercise(); return; }
    if (has(/\b(end|stop|done|finish|finished|enough|home|back)\b/)) {
      await coach.endSession();
      await goHome("That was great! What next — more exercise, a story, some music, or just talk to me?");
      return;
    }
    if (has(/how am i|how did i|feedback|coach/)) { coach.askCoach(); return; }
    return;
  }

  if (currentScreen === "piano") {
    if (has(/\b(stop|back|home|enough|exit|done|finish)\b/)) {
      await goHome("What beautiful music! What shall we do next?");
    }
    return;
  }

  // Global intents
  if (has(/piano|keyboard|play.*fingers|fingers.*play/)) { await startPiano(); return; }
  if (has(/exercis|workout|work out|physio|stretch|fitness|training/)) { show("coach"); await startCoach(); return; }
  if (has(/stor(y|ies)|kahani/)) { show("entertain"); await doEnt("story"); return; }
  if (has(/joke|laugh|funny/)) { show("entertain"); await doEnt("joke"); return; }
  if (has(/riddle|puzzle/)) { show("entertain"); await doEnt("riddle"); return; }
  if (has(/tune|music|song|sing/)) { show("entertain"); await doEnt("tune"); return; }
  if (has(/go home|home screen|main menu|go back/)) { await goHome("I am here, my friend!"); return; }

  // Anything else is conversation
  await handleUserText(raw);
}

// ---------- Boot ----------
$("btn-wake").addEventListener("click", async () => {
  unlockAudio();
  if ("wakeLock" in navigator) {
    try { await navigator.wakeLock.request("screen"); } catch {}
  }
  show("home");
  faces.home.setState("happy");
  const greeting = hasRecognition
    ? "Hello my friend! I am Mitra. Just talk to me — say, let us exercise, or, tell me a story, or, play the piano. I am always listening!"
    : "Hello my friend! I am Mitra, your companion. Tap a button below and let us spend some time together!";
  setCaption(greeting);
  await speak(greeting);
  voiceLoop.start();
  setTimeout(() => { if (currentScreen === "home") setCaption(""); }, 4000);
});

// ---------- Home nav (touch remains as backup) ----------
document.querySelectorAll(".mode-btn").forEach(btn =>
  btn.addEventListener("click", async () => {
    const mode = btn.dataset.mode;
    show(mode);
    if (mode === "chat") startChat();
    if (mode === "coach") startCoach();
    if (mode === "entertain") speak("Fun time! Say story, joke, riddle, music, or piano!");
  })
);

// ---------- Chat ----------
async function startChat() {
  $("chat-caption").textContent = "";
  $("chat-user-line").textContent = "";
  await speak(hasRecognition ? "I am listening, my friend. Talk to me!" : "Type to me, my friend!");
  if (!hasRecognition) $("type-bar").classList.remove("hidden");
}

async function handleUserText(text) {
  if (!text || !text.trim()) return;
  if (currentScreen === "chat") $("chat-user-line").textContent = `You: ${text}`;
  setCaption("…");
  const reply = await chatReply(text.trim());
  setCaption(reply);
  await speak(reply);
}

$("btn-mic").addEventListener("click", async () => {
  stopSpeaking();
  const micBtn = $("btn-mic");
  const text = await listenOnce({
    onStateChange: (listening) => {
      micBtn.classList.toggle("listening", listening);
      if (faces[currentScreen]) activeFace.setState(listening ? "listening" : "idle");
    },
  });
  if (text) handleUserText(text);
  else if (!hasRecognition) {
    $("type-bar").classList.remove("hidden");
    $("chat-caption").textContent = "I could not hear you — type to me instead!";
  }
});

$("btn-type").addEventListener("click", () => {
  $("type-bar").classList.toggle("hidden");
  if (!$("type-bar").classList.contains("hidden")) $("type-input").focus();
});
$("type-send").addEventListener("click", () => {
  const v = $("type-input").value;
  $("type-input").value = "";
  handleUserText(v);
});
$("type-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("type-send").click();
});

// ---------- Coach ----------
const coach = new Coach({
  video: $("coach-video"),
  overlay: $("coach-overlay"),
  hud: {
    name: $("coach-exercise-name"),
    reps: $("coach-reps"),
    feedback: $("coach-feedback"),
    status: $("coach-status"),
    barFill: $("coach-bar-fill"),
  },
});

async function startCoach() {
  coach.resetSession();
  $("coach-reps").textContent = "0";
  try {
    await coach.start();
  } catch (err) {
    const detail = err && err.message ? ` (${err.message})` : "";
    $("coach-feedback").textContent = err.name === "NotAllowedError"
      ? "Camera blocked — allow camera access and use HTTPS."
      : `Could not start: check internet for the pose model${detail}`;
    speak("I could not open my camera eye. Please check camera permission and internet.");
  }
}

$("btn-switch-exercise").addEventListener("click", () => coach.switchExercise());
$("btn-ask-coach").addEventListener("click", () => coach.askCoach());
$("btn-end-session").addEventListener("click", async () => {
  await coach.endSession();
  goHome();
});

// ---------- Air Piano ----------
const piano = new AirPiano({ video: $("piano-video"), overlay: $("piano-overlay") });

async function startPiano() {
  show("piano");
  try {
    await speak("Piano time! Hold your hands up and dip your fingers into the keys. Say stop when you are done.");
    await piano.start();
  } catch (err) {
    speak("I could not open my camera eye for the piano. Please check camera permission.");
    goHome();
  }
}

// ---------- Entertainment ----------
async function doEnt(kind) {
  stopSpeaking();
  const cap = $("ent-caption");
  if (kind === "piano") { await startPiano(); return; }
  if (kind === "story") {
    cap.textContent = "Let me think of a nice story…";
    const story = await getStory();
    cap.textContent = story;
    await speak(story);
    activeFace.setState("happy");
  } else if (kind === "joke") {
    const joke = await getJoke();
    cap.textContent = joke;
    await speak(joke);
    activeFace.setState("happy");
  } else if (kind === "riddle") {
    const r = getRiddle();
    cap.textContent = r.q;
    await speak(`Here is a riddle! ${r.q}`);
    await new Promise(res => setTimeout(res, 6000));
    cap.textContent = `${r.q} — ${r.a}`;
    await speak(`The answer is: ${r.a}`);
    activeFace.setState("happy");
  } else if (kind === "tune") {
    cap.textContent = "🎶";
    await playTune();
  }
}

document.querySelectorAll(".ent-btn").forEach(btn =>
  btn.addEventListener("click", () => doEnt(btn.dataset.ent))
);

// Simple cheerful tune via WebAudio (no assets needed)
async function playTune() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const notes = [262, 294, 330, 349, 392, 440, 392, 330, 392, 523, 440, 392, 349, 330, 294, 262];
  let t = ctx.currentTime;
  activeFace.setState("happy");
  for (const f of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
    t += 0.22;
  }
  await new Promise(res => setTimeout(res, notes.length * 220 + 400));
  ctx.close();
}

// ---------- Settings ----------
const modal = $("settings-modal");
const statusEl = $("api-status");

function refreshApiStatus() {
  if (hasApiKey()) {
    statusEl.textContent = "API key saved — AI mode";
    statusEl.className = "api-status ok";
  } else {
    statusEl.textContent = "Offline mode — scripted responses";
    statusEl.className = "api-status";
  }
}

function refreshVoiceList() {
  const sel = $("voice-select");
  const voices = listVoices();
  sel.innerHTML = "";
  if (!voices.length) {
    sel.innerHTML = "<option>System default</option>";
    return;
  }
  for (const v of voices) {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    opt.selected = v.selected;
    sel.appendChild(opt);
  }
}

$("voice-select").addEventListener("change", (e) => {
  setVoice(e.target.value);
  speak("Hello my friend! Do you like this voice?");
});
$("btn-test-voice").addEventListener("click", () => {
  setVoice($("voice-select").value);
  speak("Hello my friend! I am Mitra. Do you like this voice?");
});

$("btn-settings").addEventListener("click", () => {
  $("api-key-input").value = getApiKey();
  refreshApiStatus();
  refreshVoiceList();
  modal.classList.remove("hidden");
});
$("btn-close-settings").addEventListener("click", () => modal.classList.add("hidden"));
$("btn-clear-key").addEventListener("click", () => {
  setApiKey("");
  $("api-key-input").value = "";
  refreshApiStatus();
});
$("btn-test-key").addEventListener("click", async () => {
  setApiKey($("api-key-input").value);
  if (!hasApiKey()) { refreshApiStatus(); return; }
  statusEl.textContent = "Testing key…";
  statusEl.className = "api-status";
  const ok = await testApiKey();
  if (ok) {
    statusEl.textContent = "Key works! Real AI enabled ✓";
    statusEl.className = "api-status ok";
  } else {
    statusEl.textContent = "Key failed — check the key and internet, staying in offline mode";
    statusEl.className = "api-status err";
  }
});

refreshApiStatus();
