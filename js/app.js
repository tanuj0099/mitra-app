// Mitra companion robot — main app: hands-free voice control, screens, chat,
// exercise coach, air piano, entertainment, settings.

import { RobotFace } from "./face.js";
import { initSpeech, unlockAudio, speak, stopSpeaking, listenOnce, hasRecognition, listVoices, setVoice, setSpeakProxy } from "./speech.js";
import { chatReply, coachFeedback, getStory, getJoke, getRiddle, checkBackendStatus, hasBackendKey } from "./claude.js";
import { Coach } from "./coach.js";
import { AirMusic, NOTE_FREQS, synthNote } from "./piano.js";
import { VoiceLoop } from "./voice.js";
import { initFaceSync, initStageSync } from "./sync.js";
import { PersonTracker } from "./tracker.js";
import { seedDemoIfEmpty, logSession, logSOSEvent, getHeatmapData, getRomTrend, buildWeeklySpeech, exportCSV, exportPlainText, buildClinicalSummary } from "./tracking.js";
import { RobotLink, hasBluetooth } from "./robot.js";
import { startARGame, stopARGame } from "./ar-game.js";

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
const screens = ["boot", "home", "chat", "coach", "entertain", "piano", "stage", "progress", "sos", "triage", "quest"];
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
  if (has(/\b(i am fine|im fine|i'm fine|cancel alarm|stop alarm|im okay|i am okay)\b/)) { cancelSafety(); return; }
  if (has(/\b(hey happy|happy help|sos|i need help|help me)\b/)) { triggerSOS(); return; }
  if (has(/piano|keyboard|air music|play.*fingers|fingers.*play|make.*music/)) { await beginPiano(); return; }
  if (has(/exercis|workout|work out|physio|stretch|fitness|training/)) { await beginCoach(); return; }
  if (has(/ar game|hologram|pokemon|badge|quest/)) { await beginQuest(); return; }
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
            ? "✅ Connected to Happy — talk to the robot!"
            : "⚠️ Version mismatch — hard refresh BOTH devices (Cmd+Shift+R / close and reopen the tab)";
        } else if (d.ev === "mode") {
          if (d.mode === "home") stageShowIdle();
          else {
            $("stage-hud").classList.toggle("hidden", d.mode !== "coach");
            if (!$("stage-video").srcObject) $("stage-status").textContent = "🎥 Starting video from Happy…";
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
          $("stage-status").textContent = "🔗 Linked — verifying it's really your Happy…";
          clearTimeout(helloTimer);
          helloTimer = setTimeout(() => {
            $("stage-status").textContent =
              "⚠️ Reached a stale session — retrying automatically. Make sure the phone shows its code in ⚙️ settings and it matches.";
            setTimeout(() => { if (sync) sync.retryNow(); }, 4000);
          }, 3000);
          return;
        }
        clearTimeout(helloTimer);
        $("stage-status").textContent =
          s === "connecting" ? "Connecting to Happy… (open the app on the phone too)"
          : s === "disconnected" ? "Lost Happy — reconnecting…"
          : `Waiting for Happy… (${s})`;
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
  checkBackendStatus().then(hasKey => {
    console.log("Backend AI Key Configured:", hasKey);
  });
  woken = true;
  show("home");
  faces.home.setState("happy");
  $("mic-toggle").classList.remove("hidden");
  const name = localStorage.getItem("happy_user_name");
  if (name && name.trim().length > 0) speak(`Welcome back, ${name}!`);
  else speak("Welcome back! I am here.");
  const greeting = hasRecognition
    ? "Tap the mic button, then just talk to me."
    : "Tap a button and let us begin.";
  setCaption(greeting);
  await speak(greeting);
  setTimeout(() => { if (currentScreen === "home") setCaption(""); }, 4000);
});

// ---------- Home nav (touch remains as backup) ----------
document.querySelectorAll("[data-mode]").forEach(btn =>
  btn.addEventListener("click", async () => {
    const mode = btn.dataset.mode;
    if (mode === "coach") { beginCoach(); return; }
    if (mode === "progress") { await showProgress(); return; }
    if (mode === "triage") { await showTriage(); return; }
    if (mode === "quest") { beginQuest(); return; }
    if (currentScreen === "coach") { activeCoach.stop(); activeCoach = null; }
    if (currentScreen === "chat") stopSpeaking();
    if (currentScreen === "quest") stopARGame();
    if (currentScreen === "entertain") stopSpeaking();
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

$("btn-restart-coach").addEventListener("click", () => {
  if (activeCoach) {
    activeCoach.resetSession();
    speak("Calibration restarted. Let's try again.");
  }
});
$("btn-switch-exercise").addEventListener("click", () => {
  if (activeCoach) activeCoach.switchExercise();
});
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
  speak("Hello my friend! I am Happy. Do you like this voice?");
});

$("btn-settings").addEventListener("click", () => {
  modal.classList.remove("hidden");
  $("room-code").textContent = ROOM || "";
  refreshVoiceList();
});

$("btn-close-settings").addEventListener("click", () => {
  modal.classList.add("hidden");
});

// ---------- Progress ----------
async function showProgress() {
  seedDemoIfEmpty();
  show("progress");
  
  // Render Today's Activity Log
  const hm = $("progress-heatmap");
  const todayEntries = getEntries(1); // Get last 24h
  if (todayEntries.length === 0) {
    hm.innerHTML = '<p style="padding:1rem; opacity:0.7">No exercises logged today yet. Time to get moving!</p>';
  } else {
    hm.innerHTML = '<ul class="activity-log"></ul>';
    const ul = hm.querySelector('.activity-log');
    todayEntries.forEach(e => {
      if (e.sosEventFlag) return;
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="act-name">${e.exerciseType}</div>
        <div class="act-stats">${e.repsCompleted} reps • ${e.durationSec}s</div>
      `;
      ul.appendChild(li);
    });
  }
  
  $("progress-summary").textContent = buildWeeklySpeech();
  
  // Render Chart (Simple SVG)
  const trend = getRomTrend();
  const chart = $("progress-chart");
  if (trend.length > 1) {
    const maxRom = Math.max(90, ...trend.map(t => t.rom));
    const pts = trend.map((t, i) => `${(i / (trend.length - 1)) * 100},${100 - (t.rom / maxRom) * 100}`).join(" ");
    chart.innerHTML = `<svg viewBox="0 -10 100 120" width="100%" height="150px" preserveAspectRatio="none">
      <polyline points="${pts}" fill="none" stroke="#ffb454" stroke-width="2" vector-effect="non-scaling-stroke" />
      ${trend.map((t, i) => `<circle cx="${(i / (trend.length - 1)) * 100}" cy="${100 - (t.rom / maxRom) * 100}" r="2" fill="#37e0ff" />`).join("")}
    </svg>`;
  } else {
    chart.innerHTML = "<p>Not enough range-of-motion data for a trend yet.</p>";
  }
  
  await speak($("progress-summary").textContent);
}

$("btn-export-csv").addEventListener("click", () => {
  navigator.clipboard.writeText(exportCSV()).then(() => speak("Data copied to clipboard"));
});

// ---------- AR Game ----------
async function beginQuest() {
  show("quest");
  await startARGame();
}

window.addEventListener("ar-game-done", async () => {
  await goHome("That was fun! Do you want to play again or do something else?");
});

// ---------- Triage ----------
async function showTriage() {
  seedDemoIfEmpty();
  show("triage");
  
  const summaryHtml = buildClinicalSummary();
  $("triage-feedback").innerHTML = summaryHtml;
  
  // Basic speech summary of the triage
  if (summaryHtml.includes("Moderate Severity")) {
    await speak("I have detected recurring joint pain. I recommend replacing heavy pushing with gentle stretches.");
  } else if (summaryHtml.includes("Low Severity")) {
    await speak("I noted mild spasticity flares. We should focus on safe recovery protocols.");
  } else {
    await speak("Your clinical log is clear. Keep up the great work!");
  }
}

$("btn-export-clinical").addEventListener("click", () => {
  navigator.clipboard.writeText(exportPlainText()).then(() => speak("Clinical report copied to clipboard"));
});

// ---------- SOS Feature ----------
let sosTimer = null;
let sosInterval = null;
const sosBtn = $("sos-toggle");

function triggerSOS() {
  if (currentScreen === "sos") return; // Already in SOS
  logSOSEvent();
  stopSpeaking();
  show("sos");
  if (activeFace) activeFace.setState("urgent");
  
  const num = localStorage.getItem("mitra_sos_number") || "";
  $("sos-contact-info").textContent = num ? `Calling ${num}...` : "Calling emergency contact...";
  
  speak("I'm getting help. Stay with me.");
  
  if (num) {
    const a = document.createElement("a");
    a.href = `tel:${num}`;
    a.click();
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const sms = document.createElement("a");
        sms.href = `sms:${num}?body=I need help — [${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}]`;
        sms.click();
      }, () => {});
    }
  }
  
  clearInterval(sosInterval);
  sosInterval = setInterval(() => {
    speak("I'm getting help. Stay with me.");
  }, 20000);
}

function cancelSOS() {
  if (currentScreen !== "sos") return;
  clearInterval(sosInterval);
  goHome("Emergency alert cancelled.");
}

// SOS Button Long Press
let pressStart = 0;
function handleSosDown(e) {
  e.preventDefault();
  pressStart = performance.now();
  sosBtn.classList.add("pressing");
  sosTimer = setTimeout(() => {
    triggerSOS();
    sosBtn.classList.remove("pressing");
  }, 1000);
}
function handleSosUp(e) {
  e.preventDefault();
  clearTimeout(sosTimer);
  sosBtn.classList.remove("pressing");
  if (currentScreen === "sos" && performance.now() - pressStart > 1000) {
    cancelSOS();
  }
}
sosBtn.addEventListener("touchstart", handleSosDown);
sosBtn.addEventListener("mousedown", handleSosDown);
sosBtn.addEventListener("touchend", handleSosUp);
sosBtn.addEventListener("mouseup", handleSosUp);
sosBtn.addEventListener("mouseleave", handleSosUp);

const sosCancelBtn = $("btn-sos-cancel");
let cancelTimer = null;
function handleCancelDown(e) {
  e.preventDefault();
  sosCancelBtn.classList.add("pressing");
  cancelTimer = setTimeout(() => {
    cancelSOS();
    sosCancelBtn.classList.remove("pressing");
  }, 1000);
}
function handleCancelUp(e) {
  e.preventDefault();
  clearTimeout(cancelTimer);
  sosCancelBtn.classList.remove("pressing");
}
sosCancelBtn.addEventListener("touchstart", handleCancelDown);
sosCancelBtn.addEventListener("mousedown", handleCancelDown);
sosCancelBtn.addEventListener("touchend", handleCancelUp);
sosCancelBtn.addEventListener("mouseup", handleCancelUp);
sosCancelBtn.addEventListener("mouseleave", handleCancelUp);

// Settings for Personalization
const userNameInput = $("user-name-input");
if (userNameInput) {
  userNameInput.value = localStorage.getItem("happy_user_name") || "";
  userNameInput.addEventListener("input", (e) => {
    localStorage.setItem("happy_user_name", e.target.value);
  });
}

// Settings for SOS
const sosNumberInput = $("sos-number-input");
if (sosNumberInput) {
  sosNumberInput.value = localStorage.getItem("mitra_sos_number") || "";
  sosNumberInput.addEventListener("input", (e) => {
    localStorage.setItem("mitra_sos_number", e.target.value);
  });
}

// Initialize Lucide icons
if (window.lucide) {
  lucide.createIcons();
}

// ---------- Safety Monitoring & SOS Escalation ----------
let safetyState = "ok"; // ok, tier1, tier2
let safetyTimeout = null;
let countdownInterval = null;
let countdownValue = 10;

window.addEventListener("safety-check-tier1", async () => {
  safetyState = "tier1";
  speak("Are you okay? Say 'I am fine' or tap the screen.");
  
  // Wait 15s for response
  safetyTimeout = setTimeout(() => {
    if (safetyState === "tier1") {
      triggerTier2();
    }
  }, 15000);
});

function triggerTier2() {
  safetyState = "tier2";
  $("safety-overlay").classList.remove("hidden");
  countdownValue = 10;
  $("safety-countdown").textContent = countdownValue;
  speak("Ten. Nine. Eight."); // Shortened voice to not block
  
  countdownInterval = setInterval(() => {
    countdownValue--;
    $("safety-countdown").textContent = countdownValue;
    if (countdownValue <= 0) {
      clearInterval(countdownInterval);
      if (safetyState === "tier2") {
        $("safety-overlay").classList.add("hidden");
        triggerSOS(); // Escalates to Tier 3
      }
    }
  }, 1000);
}

function cancelSafety() {
  if (safetyState !== "ok") {
    safetyState = "ok";
    clearTimeout(safetyTimeout);
    clearInterval(countdownInterval);
    $("safety-overlay").classList.add("hidden");
    speak("Okay, returning to your session.");
    if (activeCoach) {
      activeCoach.lastMovementTime = performance.now();
      activeCoach.safetyTier = 0;
      activeCoach.start();
    }
  }
}

$("btn-safety-cancel").addEventListener("click", cancelSafety);
// Add global voice intent for safety cancel
// Update handleUtterance with "i am fine", "cancel alarm"

// ---------- Interval Pulse Check ----------
let pendingSessionData = null;
let painFlag = false;
let spasmFlag = false;

window.addEventListener("show-pulse-check", (e) => {
  pendingSessionData = e.detail;
  painFlag = false;
  spasmFlag = false;
  $("btn-pain").style.background = "";
  $("btn-spasm").style.background = "";
  $("pulse-rpe").value = 5;
  $("pulse-overlay").classList.remove("hidden");
  speak("How did that set feel?");
});

$("btn-pain").addEventListener("click", () => {
  painFlag = !painFlag;
  $("btn-pain").style.background = painFlag ? "rgba(255,107,107,0.5)" : "";
});
$("btn-spasm").addEventListener("click", () => {
  spasmFlag = !spasmFlag;
  $("btn-spasm").style.background = spasmFlag ? "rgba(255,180,84,0.5)" : "";
});

$("btn-pulse-done").addEventListener("click", async () => {
  $("pulse-overlay").classList.add("hidden");
  
  if (pendingSessionData) {
    const rpe = parseInt($("pulse-rpe").value, 10);
    
    // Log the session with the new wellness metrics
    logSession({
      ...pendingSessionData,
      rpe: rpe,
      pain: painFlag,
      spasm: spasmFlag
    });
    
    let msg = `Fantastic! ${pendingSessionData.repsCompleted} repetitions — I am proud of you!`;
    
    // Dynamic Adjustment Logic
    if (painFlag) {
      msg = "I noted the discomfort. I am reducing the range of motion for your next exercises to keep your joints safe.";
    } else if (rpe > 8) {
      msg = "That looked like hard work! Take an extra 30 seconds of rest before we continue.";
    } else if (spasmFlag) {
      msg = "Noted the spasticity flare. We will take it slow.";
    }
    
    await speak(msg);
    pendingSessionData = null;
  }
});
