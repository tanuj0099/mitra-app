// Text-to-speech + speech recognition wrappers (Web Speech API).
// iOS Safari: TTS must be unlocked by a user gesture; recognition needs Siri & Dictation enabled.
// Voice quality tip: iOS "Enhanced"/"Premium" voices (downloadable under
// Settings > Accessibility > Spoken Content > Voices) show up here too.

const VOICE_STORAGE = "mitra_voice";
let voice = null;
let onSpeakStateChange = () => {};

// Soft, friendly delivery: slightly high pitch, unhurried rate.
const PITCH = 1.25;
const RATE = 0.92;

function rankVoice(v) {
  let score = 0;
  if (/en[-_]IN/i.test(v.lang)) score += 4;              // Indian English first
  if (/enhanced|premium|natural/i.test(v.name)) score += 3;
  if (/Veena|Samantha|Karen|Moira|Tessa/i.test(v.name)) score += 2;
  if (v.lang.startsWith("en")) score += 1;
  return score;
}

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;
  const savedName = localStorage.getItem(VOICE_STORAGE);
  if (savedName) {
    const saved = voices.find(v => v.name === savedName);
    if (saved) { voice = saved; return; }
  }
  voice = voices.filter(v => v.lang.startsWith("en")).sort((a, b) => rankVoice(b) - rankVoice(a))[0] || voices[0];
}

export function initSpeech(stateCb) {
  onSpeakStateChange = stateCb || (() => {});
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function listVoices() {
  return speechSynthesis.getVoices()
    .filter(v => v.lang.startsWith("en"))
    .sort((a, b) => rankVoice(b) - rankVoice(a))
    .map(v => ({ name: v.name, lang: v.lang, selected: voice && v.name === voice.name }));
}

export function setVoice(name) {
  const v = speechSynthesis.getVoices().find(x => x.name === name);
  if (v) {
    voice = v;
    localStorage.setItem(VOICE_STORAGE, name);
  }
}

// Unlock audio on iOS: speak a silent utterance from a tap handler.
export function unlockAudio() {
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}

// Stage devices route all speech to the face device instead of local TTS.
let speakProxy = null;
export function setSpeakProxy(fn) { speakProxy = fn; }

export function speak(text) {
  if (speakProxy) { speakProxy(text); return Promise.resolve(); }
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = RATE;
    u.pitch = PITCH;
    u.onstart = () => onSpeakStateChange(true);
    const done = () => { onSpeakStateChange(false); resolve(); };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
    // Safari sometimes never fires onend; safety timeout scaled to length.
    setTimeout(done, 4000 + text.length * 90);
  });
}

export function stopSpeaking() {
  speechSynthesis.cancel();
  onSpeakStateChange(false);
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const hasRecognition = !!SR;

// One-shot recognition: resolves with transcript string, or null on failure/silence.
export function listenOnce({ onStateChange } = {}) {
  return new Promise((resolve) => {
    if (!SR) { resolve(null); return; }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      onStateChange && onStateChange(false);
      try { rec.stop(); } catch {}
      resolve(val);
    };
    rec.onresult = (e) => finish(e.results[0][0].transcript);
    rec.onerror = () => finish(null);
    rec.onend = () => finish(null);
    onStateChange && onStateChange(true);
    try { rec.start(); } catch { finish(null); }
    setTimeout(() => finish(null), 12000);
  });
}
