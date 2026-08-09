// Text-to-speech + speech recognition wrappers (Web Speech API).
// iOS Safari: TTS must be unlocked by a user gesture; recognition needs Siri & Dictation enabled.

let voice = null;
let onSpeakStateChange = () => {};

export function initSpeech(stateCb) {
  onSpeakStateChange = stateCb || (() => {});
  const pickVoice = () => {
    const voices = speechSynthesis.getVoices();
    voice =
      voices.find(v => /en[-_](IN)/i.test(v.lang)) ||
      voices.find(v => /Samantha|Google UK English Female|Karen/i.test(v.name)) ||
      voices.find(v => v.lang.startsWith("en")) || null;
  };
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

// Unlock audio on iOS: speak a silent utterance from a tap handler.
export function unlockAudio() {
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}

export function speak(text) {
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.pitch = 1.05;
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
