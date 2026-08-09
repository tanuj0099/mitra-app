// Mitra companion robot — main app: hands-free voice control, screens, chat,
// exercise coach, air piano, entertainment, settings.

import { RobotFace } from "./face.js";
import { initSpeech, unlockAudio, speak, stopSpeaking, listenOnce, hasRecognition, listVoices, setVoice, setSpeakProxy } from "./speech.js";
import { chatReply, getStory, getJoke, getRiddle, getApiKey, setApiKey, testApiKey, hasApiKey } from "./claude.js";
import { Coach } from "./coach.js";
import { AirMusic, NOTE_FREQS, synthNote } from "./piano.js";
import { VoiceLoop } from "./voice.js";
import { initFaceSync, initStageSync } from "./sync.js";
import { PersonTracker } from "./tracker.js";
import { RobotLink, hasBluetooth } from "./robot.js";

const $ = (id) => document.getElementById(id);

// Roles: default = face/standalone (phone). ?stage=1 = big screen (laptop)
// that runs the camera modes on command from the face device.
const APP_V = 12; // bump on every deploy — both devices must match to pair

const params = new URLSearchParams(location.search);
const IS_STAGE = params.has("stage");

// Pairing: every phone owns a unique 4-letter code (shown in ⚙️ settings);
// the laptop enters it once. A shared fixed id would collide with any other
// copy of the app running anywhere (teammates' phones, old tabs...).
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeCode() {
  let c = "";
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}
function getRoom() {
  const fromUrl = params.get("room");
  if (fromUrl) return fromUrl.toUpperCase();
  if (IS_STAGE) return (localStorage.getItem("mitra_stage_room") || "").toUpperCase() || null;
  let r = localStorage.getItem("mitra_room");
  if (!r) { r = makeCode(); localStorage.setItem("mitra_room", r); }
  return r;
}
let ROOM = getRoom();
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
  // keep sessions alive when they've migrated to the big screen (remoteMode)
  if (currentScreen === "coach" && name !== "coach" && remoteMode !== "coach") coach.stop();
  if (currentScreen === "piano" && name !== "piano" && remoteMode !== "piano") music.stop();
  if (currentScreen === "piano" && name !== "piano" && micPausedForMusic) {
    micPausedForMusic = false;
    setMic(true); // restore the mic paused for local Air Music
  }
  screens.forEach(s => $(`screen-${s}`).classList.toggle("active", s === name));
  currentScreen = name;
  Object.values(faces).forEach(f => f.stop());
  if (faces[name]) {
    activeFace = faces[name];
    activeFace.setState("idle");
    activeFace.start();
  }
  updateTracker();
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
let micPausedForMusic = false;
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

// ---------- DUO head tracking (phone side) ----------
// Presence mode runs quietly whenever the camera is free; "follow me" raises
// the tracking rate. Positions stream over sync to the stage, which forwards
// them to the ESP32 over Bluetooth. See firmware/README.md.
const tracker = new PersonTracker();
let woken = false;

function onTrack(u) {
  if (u.state === "FOUND" && faces[currentScreen] && currentScreen === "home") {
    activeFace.setState("happy");
    setTimeout(() => { if (currentScreen === "home") activeFace.setState("idle"); }, 1500);
  }
  if (sync) sync.send({ ev: "track", x: u.x, state: u.state });
}

function updateTracker() {
  const camBusy = currentScreen === "coach" || currentScreen === "piano" || remoteMode;
  const shouldRun = !IS_STAGE && woken && !camBusy;
  if (shouldRun && !tracker.running) tracker.start(onTrack).catch(() => {});
  else if (!shouldRun && tracker.running) tracker.stop();
}

async function handleUtterance(raw) {
  const t = raw.toLowerCase();
  const has = (re) => re.test(t);

  if (has(/follow me|look at me|watch me/)) {
    tracker.setRate(15);
    await speak("I am watching you!");
    return;
  }
  if (has(/stop (following|watching)/)) {
    tracker.setRate(6);
    await speak("Okay!");
    return;
  }

  // While a session streams to the big screen, the phone shows the face but
  // the coach/music still run locally — control them directly.
  if (remoteMode === "coach") {
    if (has(/switch|next|change|different exercise/)) { coach.switchExercise(); return; }
    if (has(/piano|air music|make.*music/)) { await beginPiano(); return; }
    if (has(/\b(end|stop|done|finish|finished|enough|home|back)\b/)) {
      await coach.endSession();
      stopRemote();
      await goHome("Well done! What next?");
      return;
    }
    if (has(/how am i|how did i|feedback|coach/)) { coach.askCoach(); return; }
    return;
  }
  if (remoteMode === "piano") {
    if (has(/exercis|workout|work out|physio|stretch/)) { await beginCoach(); return; }
    if (has(/\b(stop|back|home|enough|exit|done|finish)\b/)) {
      music.stop();
      stopRemote();
      await goHome("Lovely music! What next?");
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

// Robot BLE link (stage/laptop only — iPhone Safari has no Web Bluetooth)
const robot = IS_STAGE ? new RobotLink({
  onStatus: (s) => $("btn-robot").classList.toggle("connected", s === "connected"),
}) : null;

if (IS_STAGE) {
  $("btn-robot").addEventListener("click", async () => {
    if (!hasBluetooth) {
      $("stage-status").textContent = "⚠️ This browser has no Web Bluetooth — use Chrome on the laptop.";
      return;
    }
    if (robot.connected) { robot.disconnect(); return; }
    try {
      await robot.connect();
    } catch (e) {
      $("stage-status").textContent = "🤖 Robot connection cancelled or failed — is DUO-HEAD powered on?";
    }
  });
}

function stageShowIdle() {
  $("stage-video").srcObject = null;
  $("stage-hud").classList.add("hidden");
  $("stage-idle").classList.remove("hidden");
}

let helloTimer = null;
let stageAudio = null; // laptop-side synth for Air Music notes

function startSync() {
  if (IS_STAGE) {
    sync = initStageSync(ROOM, {
      onData: (d) => {
        if (!d || !d.ev) return;
        if (d.ev === "hello") {
          clearTimeout(helloTimer);
          $("stage-status").textContent = d.v === APP_V
            ? "✅ Connected to Mitra — talk to the robot!"
            : "⚠️ Version mismatch — hard refresh BOTH devices (Cmd+Shift+R / close and reopen the tab)";
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
        } else if (d.ev === "note") {
          if (stageAudio && stageAudio.state === "suspended") stageAudio.resume();
          if (stageAudio) synthNote(stageAudio, stageAudio.destination, NOTE_FREQS[d.idx] || 440, d.vol);
        } else if (d.ev === "track" && robot && robot.connected) {
          robot.send(d.state === "TRACKING" ? `X:${d.x.toFixed(2)}` : "LOST");
        }
      },
      onStream: (s) => {
        $("stage-idle").classList.add("hidden");
        const v = $("stage-video");
        v.srcObject = s;
        // Air Music sends its notes as an audio track — play them here.
        v.muted = false;
        v.volume = 1;
        v.play().catch(() => {
          v.muted = true;   // fall back to silent video if autoplay blocks audio
          v.play().catch(() => {});
        });
      },
      onCallEnd: stageShowIdle,
      onStatus: (s) => {
        if (s === "connected") {
          // Don't trust the link until the phone's version handshake arrives —
          // we may have reached a stale "ghost" session still holding the id.
          $("stage-status").textContent = "🔗 Linked — verifying it's really your Mitra…";
          clearTimeout(helloTimer);
          helloTimer = setTimeout(() => {
            $("stage-status").textContent =
              "⚠️ Reached a stale Mitra session — retrying automatically. Make sure the phone shows its code in ⚙️ settings and it matches.";
            setTimeout(() => { if (sync) sync.retryNow(); }, 4000);
          }, 3000);
          return;
        }
        clearTimeout(helloTimer);
        $("stage-status").textContent =
          s === "connecting" ? "Connecting to Mitra… (open the app on the phone too)"
          : s === "disconnected" ? "Lost Mitra — reconnecting…"
          : `Waiting for Mitra… (${s})`;
      },
    });
  } else {
    sync = initFaceSync(ROOM, {
      onStatus: (s) => {
        const was = stageConnected;
        stageConnected = s === "connected";
        $("stage-dot").classList.toggle("hidden", !stageConnected);
        if (stageConnected && !was) {
          sync.send({ ev: "hello", v: APP_V });
          if (remoteMode) {
            resumeRemoteStream();      // re-establish after a reconnect
          } else if (currentScreen === "coach" || currentScreen === "piano") {
            migrateToStage();          // move a running local session over
          } else if (currentScreen !== "boot") {
            speak("Big screen connected!");
          }
        } else if (!stageConnected && was && remoteMode) {
          migrateBackToPhone();        // laptop dropped mid-session
        }
      },
    });
  }
}
// The phone registers for pairing immediately; the stage asks for the
// phone's code in a centered modal, then joins on Enter.
if (!IS_STAGE) startSync();
else {
  $("btn-wake").classList.add("hidden");
  $("stage-code-modal").classList.remove("hidden");
  const inp = $("room-input");
  inp.value = ROOM || "";
  setTimeout(() => inp.focus(), 100);

  const joinStage = () => {
    const code = inp.value.trim().toUpperCase();
    if (code.length < 3) { inp.focus(); return; }
    ROOM = code;
    localStorage.setItem("mitra_stage_room", code);
    $("stage-code-modal").classList.add("hidden");
    // The click is our user gesture — create the audio engine for notes now.
    stageAudio = new (window.AudioContext || window.webkitAudioContext)();
    startSync();
    show("stage");
  };
  $("btn-stage-go").addEventListener("click", joinStage);
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") joinStage(); });
}

$("btn-wake").addEventListener("click", async () => {
  if (IS_STAGE) return;
  unlockAudio();
  if ("wakeLock" in navigator) {
    try { await navigator.wakeLock.request("screen"); } catch {}
  }
  woken = true;
  show("home");
  faces.home.setState("happy");
  $("mic-toggle").classList.remove("hidden");
  const greeting = hasRecognition
    ? "Hello my friend! Tap the mic button, then just talk to me."
    : "Hello my friend! Tap a button and let us begin.";
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
    if (mode === "entertain") speak("Pick one — story, joke, riddle, or music!");
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

// A local camera session was running when the big screen connected — hand the
// picture over: phone goes back to the face, laptop shows the session.
function migrateToStage() {
  remoteMode = currentScreen === "coach" ? "coach" : "piano";
  show("home");                  // remoteMode set, so show() keeps the session alive
  activeFace.setState("happy");
  resumeRemoteStream();
  speak("Big screen on — keep going there!");
}

// The big screen disappeared mid-session — bring the picture back to the phone.
function migrateBackToPhone() {
  const mode = remoteMode;
  clearInterval(hudTimer);
  hudTimer = null;
  remoteMode = null;
  music.setLocalMuted(false); // notes come from the phone again
  show(mode);
  speak("Let us continue here!");
}

function resumeRemoteStream() {
  sync.send({ ev: "mode", mode: remoteMode });
  if (remoteMode === "coach") {
    sync.callStage($("coach-overlay").captureStream(24));
    startHudRelay();
  } else {
    music.setLocalMuted(true);
    sync.callStage($("piano-overlay").captureStream(24));
  }
}

function stopRemote() {
  clearInterval(hudTimer);
  hudTimer = null;
  sync.endCall();
  sync.send({ ev: "mode", mode: "home" });
  remoteMode = null;
  updateTracker();
}

// Starting any camera mode first kills whatever else is running — sessions
// must never overlap (e.g. Air Music notes playing during exercise).
function stopAllSessions() {
  coach.stop();
  music.stop();
  clearInterval(hudTimer);
  hudTimer = null;
  if (remoteMode) {
    sync.endCall();
    remoteMode = null;
  }
}

// Start exercise — camera and tracking always run on THIS phone; if a big
// screen is paired, the composited canvas is streamed to it and the phone
// keeps showing the face.
async function beginCoach() {
  stopAllSessions();
  if (stageConnected) {
    remoteMode = "coach";
    updateTracker();            // free the camera for the coach
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
    speak("Watch the big screen!");
    return;
  }
  show("coach");
  await startCoach();
}

async function beginPiano() {
  stopAllSessions();
  if (stageConnected) {
    remoteMode = "piano";
    updateTracker();            // free the camera for the music tracker
    activeFace.setState("happy");
    await speak("Wave your fingers — watch the big screen!");
    try {
      await music.start();      // runs hidden behind the face screen
    } catch (err) {
      remoteMode = null;
      await speak("I could not open my camera eye. Please check camera permission.");
      return;
    }
    sync.send({ ev: "mode", mode: "piano" });
    music.setLocalMuted(true); // the laptop synthesizes the notes
    sync.callStage($("piano-overlay").captureStream(24));
    return;
  }
  await startPiano();
}


// ---------- Chat ----------
async function startChat() {
  await speak(hasRecognition ? "Talk to me!" : "Type to me!");
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

// In two-screen mode the phone only DETECTS notes; the laptop synthesizes
// them with its own (unrestricted) audio engine. iOS refuses to render
// WebAudio while the mic session is active, so phone-side audio can't be
// trusted when the big screen is running the show.
music.onNote = (idx, vol) => {
  if (remoteMode === "piano" && sync) sync.send({ ev: "note", idx, vol });
};

async function startPiano() {
  show("piano");
  // iOS silences WebAudio while speech recognition runs — pause the mic
  // for local play; it comes back when leaving the music screen.
  if (micOn) { micPausedForMusic = true; setMic(false); }
  try {
    await speak("Wave your fingers in the air — higher hand, higher note!");
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
  $("room-code").textContent = ROOM || "";
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
