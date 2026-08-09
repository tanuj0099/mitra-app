// Mitra companion robot — main app: hands-free voice control, screens, chat,
// exercise coach, air piano, entertainment, settings.

import { RobotFace } from "./face.js";
import { initSpeech, unlockAudio, speak, stopSpeaking, listenOnce, hasRecognition, listVoices, setVoice, setSpeakProxy } from "./speech.js";
import { chatReply, getStory, getJoke, getRiddle, getApiKey, setApiKey, testApiKey, hasApiKey } from "./claude.js";
import { Coach } from "./coach.js";
import { AirMusic } from "./piano.js";
import { VoiceLoop } from "./voice.js";
import { initFaceSync, initStageSync } from "./sync.js";

const $ = (id) => document.getElementById(id);

// Roles: default = face/standalone (phone). ?stage=1 = big screen (laptop)
// that runs the camera modes on command from the face device.
const APP_V = 5; // bump on every deploy — both devices must match to pair

const params = new URLSearchParams(location.search);
const IS_STAGE = params.has("stage");
const ROOM = params.get("room") || "demo";
let sync = null;
let stageConnected = false;
let remoteMode = null; // face-side: which mode the stage is currently running

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
const screens = ["boot", "home", "chat", "coach", "entertain", "piano", "stage"];
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
  if (currentScreen === "piano" && name !== "piano") music.stop();
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
  if (IS_STAGE) { show("stage"); return; }
  show("home");
  if (sayLine) {
    setCaption(sayLine);
    await speak(sayLine);
  }
}

// ---------- Hands-free voice control ----------

const voiceLoop = new VoiceLoop(handleUtterance, (listening) => {
  $("mic-toggle").classList.toggle("listening", listening);
  if (listening && faces[currentScreen]) activeFace.setState("listening");
});

// Mic is a toggle: tap on = keeps listening until tapped off.
let micOn = false;
function setMic(on) {
  micOn = on && hasRecognition;
  $("mic-toggle").classList.toggle("mic-on", micOn);
  if (micOn) voiceLoop.start();
  else voiceLoop.stop();
}
$("mic-toggle").addEventListener("click", () => {
  if (!hasRecognition) { speak("Voice input is not available on this device, my friend. Use the buttons!"); return; }
  setMic(!micOn);
  if (micOn) speak("I am listening!");
  else stopSpeaking();
});

initSpeech((speaking) => {
  voiceLoop.setSpeaking(speaking);
  if (faces[currentScreen]) activeFace.setState(speaking ? "speaking" : "idle");
});

async function handleUtterance(raw) {
  const t = raw.toLowerCase();
  const has = (re) => re.test(t);

  // While a session streams to the big screen, the phone shows the face but
  // the coach/music still run locally — control them directly.
  if (remoteMode === "coach") {
    if (has(/switch|next|change|different exercise/)) { coach.switchExercise(); return; }
    if (has(/\b(end|stop|done|finish|finished|enough|home|back)\b/)) {
      await coach.endSession();
      stopRemote();
      await goHome("That was great! What next — more exercise, a story, some music, or just talk to me?");
      return;
    }
    if (has(/how am i|how did i|feedback|coach/)) { coach.askCoach(); return; }
    return;
  }
  if (remoteMode === "piano") {
    if (has(/\b(stop|back|home|enough|exit|done|finish)\b/)) {
      music.stop();
      stopRemote();
      await goHome("What beautiful music! What shall we do next?");
    }
    return;
  }

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
  if (has(/piano|keyboard|air music|play.*fingers|fingers.*play|make.*music/)) { await beginPiano(); return; }
  if (has(/exercis|workout|work out|physio|stretch|fitness|training/)) { await beginCoach(); return; }
  if (has(/stor(y|ies)|kahani/)) { show("entertain"); await doEnt("story"); return; }
  if (has(/joke|laugh|funny/)) { show("entertain"); await doEnt("joke"); return; }
  if (has(/riddle|puzzle/)) { show("entertain"); await doEnt("riddle"); return; }
  if (has(/tune|music|song|sing/)) { show("entertain"); await doEnt("tune"); return; }
  if (has(/go home|home screen|main menu|go back/)) { await goHome("I am here, my friend!"); return; }

  // Anything else is conversation
  await handleUserText(raw);
}

// ---------- Boot & device pairing ----------
if (IS_STAGE) $("btn-wake").textContent = "🖥 Start display screen";

function stageShowIdle() {
  $("stage-video").srcObject = null;
  $("stage-hud").classList.add("hidden");
  $("stage-idle").classList.remove("hidden");
}

function startSync() {
  if (IS_STAGE) {
    sync = initStageSync(ROOM, {
      onData: (d) => {
        if (!d || !d.ev) return;
        if (d.ev === "hello") {
          if (d.v !== APP_V) {
            $("stage-status").textContent = "⚠️ Version mismatch — hard refresh BOTH devices (Cmd+Shift+R / close and reopen the tab)";
          }
        } else if (d.ev === "mode") {
          if (d.mode === "home") stageShowIdle();
          else {
            $("stage-hud").classList.toggle("hidden", d.mode !== "coach");
            if (!$("stage-video").srcObject) $("stage-status").textContent = "🎥 Starting video from Mitra…";
          }
        } else if (d.ev === "hud") {
          $("stage-ex-name").textContent = d.name || "";
          $("stage-status-pill").textContent = d.status || "";
          $("stage-reps").textContent = d.reps || "0";
          $("stage-bar-fill").style.width = d.bar || "0%";
          $("stage-feedback").textContent = d.feedback || "";
        }
      },
      onStream: (s) => {
        $("stage-idle").classList.add("hidden");
        const v = $("stage-video");
        v.srcObject = s;
        v.play().catch(() => {});
      },
      onCallEnd: stageShowIdle,
      onStatus: (s) => {
        $("stage-status").textContent =
          s === "connected" ? "✅ Connected to Mitra — talk to the robot!"
          : s === "connecting" ? "Connecting to Mitra… (open the app on the phone too)"
          : s === "disconnected" ? "Lost Mitra — reconnecting…"
          : `Waiting for Mitra… (${s})`;
      },
    });
  } else {
    sync = initFaceSync(ROOM, {
      onStatus: (s) => {
        const was = stageConnected;
        stageConnected = s === "connected";
        if (stageConnected && !was) {
          sync.send({ ev: "hello", v: APP_V });
          if (currentScreen !== "boot") speak("Big screen connected!");
          // If a session is already running, (re)establish the stream
          if (remoteMode) resumeRemoteStream();
        }
      },
    });
  }
}
// Register for pairing immediately — no need to wake first
startSync();

$("btn-wake").addEventListener("click", async () => {
  if (IS_STAGE) {
    show("stage");
    return;
  }
  unlockAudio();
  if ("wakeLock" in navigator) {
    try { await navigator.wakeLock.request("screen"); } catch {}
  }
  show("home");
  faces.home.setState("happy");
  $("mic-toggle").classList.remove("hidden");
  const greeting = hasRecognition
    ? "Hello my friend! I am Mitra. Tap the microphone button at the bottom, and then just talk to me — say, let us exercise, or, tell me a story, or, play some music!"
    : "Hello my friend! I am Mitra, your companion. Tap a button below and let us spend some time together!";
  setCaption(greeting);
  await speak(greeting);
  setTimeout(() => { if (currentScreen === "home") setCaption(""); }, 4000);
});

// ---------- Home nav (touch remains as backup) ----------
document.querySelectorAll("[data-mode]").forEach(btn =>
  btn.addEventListener("click", async () => {
    const mode = btn.dataset.mode;
    if (mode === "coach") { beginCoach(); return; }
    show(mode);
    if (mode === "chat") startChat();
    if (mode === "entertain") speak("Fun time! Say story, joke, riddle, music, or air music!");
  })
);

// While streaming to the big screen, mirror the coach HUD there as JSON
let hudTimer = null;
function startHudRelay() {
  clearInterval(hudTimer);
  hudTimer = setInterval(() => {
    sync.send({
      ev: "hud",
      name: $("coach-exercise-name").textContent,
      status: $("coach-status").textContent,
      reps: $("coach-reps").textContent,
      bar: $("coach-bar-fill").style.width,
      feedback: $("coach-feedback").textContent,
    });
  }, 400);
}

function resumeRemoteStream() {
  const canvas = remoteMode === "coach" ? $("coach-overlay") : $("piano-overlay");
  sync.send({ ev: "mode", mode: remoteMode });
  sync.callStage(canvas.captureStream(24));
  if (remoteMode === "coach") startHudRelay();
}

function stopRemote() {
  clearInterval(hudTimer);
  hudTimer = null;
  sync.endCall();
  sync.send({ ev: "mode", mode: "home" });
  remoteMode = null;
}

// Start exercise — camera and tracking always run on THIS phone; if a big
// screen is paired, the composited canvas is streamed to it and the phone
// keeps showing the face.
async function beginCoach() {
  if (stageConnected) {
    remoteMode = "coach";
    activeFace.setState("happy");
    try {
      await coach.start();      // runs hidden behind the face screen
    } catch (err) {
      remoteMode = null;
      await speak("I could not open my camera eye. Please check camera permission.");
      return;
    }
    sync.send({ ev: "mode", mode: "coach" });
    sync.callStage($("coach-overlay").captureStream(24));
    startHudRelay();
    return;
  }
  show("coach");
  await startCoach();
}

async function beginPiano() {
  if (stageConnected) {
    remoteMode = "piano";
    activeFace.setState("happy");
    await speak("Music time! Wave your fingers in front of my camera and watch the big screen!");
    try {
      await music.start();      // runs hidden behind the face screen
    } catch (err) {
      remoteMode = null;
      await speak("I could not open my camera eye. Please check camera permission.");
      return;
    }
    sync.send({ ev: "mode", mode: "piano" });
    sync.callStage($("piano-overlay").captureStream(24));
    return;
  }
  await startPiano();
}

// ---------- Chat ----------
async function startChat() {
  await speak(hasRecognition ? "I am listening, my friend. Talk to me!" : "Type to me, my friend!");
  if (!hasRecognition) $("type-bar").classList.remove("hidden");
}

async function handleUserText(text) {
  if (!text || !text.trim()) return;
  const reply = await chatReply(text.trim());
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
  else if (!hasRecognition) $("type-bar").classList.remove("hidden");
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

// ---------- Air Music ----------
const music = new AirMusic({ video: $("piano-video"), overlay: $("piano-overlay") });

async function startPiano() {
  show("piano");
  try {
    await speak("Music time! Wave your fingers in the air. Higher hand plays higher notes. Say stop when you are done.");
    await music.start();
  } catch (err) {
    speak("I could not open my camera eye for the music. Please check camera permission.");
    goHome();
  }
}

// ---------- Entertainment ----------
async function doEnt(kind) {
  stopSpeaking();
  if (kind === "piano") { await beginPiano(); return; }
  if (kind === "story") {
    await speak("Let me think of a nice story for you.");
    const story = await getStory();
    await speak(story);
    activeFace.setState("happy");
  } else if (kind === "joke") {
    const joke = await getJoke();
    await speak(joke);
    activeFace.setState("happy");
  } else if (kind === "riddle") {
    const r = getRiddle();
    await speak(`Here is a riddle! ${r.q}`);
    await new Promise(res => setTimeout(res, 6000));
    await speak(`The answer is: ${r.a}`);
    activeFace.setState("happy");
  } else if (kind === "tune") {
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
