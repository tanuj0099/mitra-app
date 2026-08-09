// Mitra companion robot — main app: screens, navigation, chat, entertainment, settings.

import { RobotFace } from "./face.js";
import { initSpeech, unlockAudio, speak, stopSpeaking, listenOnce, hasRecognition } from "./speech.js";
import { chatReply, getStory, getJoke, getRiddle, getApiKey, setApiKey, testApiKey, hasApiKey } from "./claude.js";
import { Coach } from "./coach.js";

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

initSpeech((speaking) => {
  activeFace.setState(speaking ? "speaking" : "idle");
});

// ---------- Screen navigation ----------
const screens = ["boot", "home", "chat", "coach", "entertain"];
let currentScreen = "boot";

function show(name) {
  stopSpeaking();
  if (currentScreen === "coach" && name !== "coach") coach.stop();
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
  btn.addEventListener("click", () => show("home"))
);

// ---------- Boot ----------
$("btn-wake").addEventListener("click", async () => {
  unlockAudio();
  if ("wakeLock" in navigator) {
    try { await navigator.wakeLock.request("screen"); } catch {}
  }
  show("home");
  faces.home.setState("happy");
  const greeting = "Hello my friend! I am Mitra, your companion. We can talk, exercise together, or have some fun. What would you like?";
  $("home-caption").textContent = greeting;
  await speak(greeting);
  setTimeout(() => { $("home-caption").textContent = ""; }, 2000);
});

// ---------- Home nav ----------
document.querySelectorAll(".mode-btn").forEach(btn =>
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    show(mode);
    if (mode === "chat") startChat();
    if (mode === "coach") startCoach();
    if (mode === "entertain") speak("Fun time! Pick a story, a joke, a riddle, or a tune!");
  })
);

// ---------- Chat ----------
async function startChat() {
  $("chat-caption").textContent = "";
  $("chat-user-line").textContent = "";
  await speak("I am listening, my friend. Tap the microphone and talk to me!");
  if (!hasRecognition) {
    $("type-bar").classList.remove("hidden");
    $("chat-caption").textContent = "Voice input not available — type to me instead!";
  }
}

async function handleUserText(text) {
  if (!text || !text.trim()) return;
  $("chat-user-line").textContent = `You: ${text}`;
  $("chat-caption").textContent = "…";
  activeFace.setState("idle");
  const reply = await chatReply(text.trim());
  $("chat-caption").textContent = reply;
  await speak(reply);
}

$("btn-mic").addEventListener("click", async () => {
  stopSpeaking();
  const micBtn = $("btn-mic");
  const text = await listenOnce({
    onStateChange: (listening) => {
      micBtn.classList.toggle("listening", listening);
      activeFace.setState(listening ? "listening" : "idle");
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
  hud: { name: $("coach-exercise-name"), reps: $("coach-reps"), feedback: $("coach-feedback") },
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
  show("home");
});

// ---------- Entertainment ----------
document.querySelectorAll(".ent-btn").forEach(btn =>
  btn.addEventListener("click", async () => {
    stopSpeaking();
    const kind = btn.dataset.ent;
    const cap = $("ent-caption");
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
  })
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

$("btn-settings").addEventListener("click", () => {
  $("api-key-input").value = getApiKey();
  refreshApiStatus();
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
