// Hands-free voice loop: listens continuously EXCEPT while Mitra speaks —
// speech aborts any in-flight recognition (see speech.js), the loop waits
// out the utterance plus a short echo guard, and results that arrive right
// after speech end are discarded so Mitra never hears herself.

import { listenOnce, hasRecognition, timeSinceSpeechEnd } from "./speech.js";

const ECHO_GUARD_MS = 600;
const delay = (ms) => new Promise(r => setTimeout(r, ms));

export class VoiceLoop {
  constructor(handler, onListenState) {
    this.handler = handler;
    this.onListenState = onListenState || (() => {});
    this.enabled = false;
    this.speaking = false;
    this.looping = false;
  }

  start() {
    if (!hasRecognition) return false;
    this.enabled = true;
    this.loop();
    return true;
  }

  stop() { this.enabled = false; }

  setSpeaking(s) { this.speaking = s; }

  async loop() {
    if (this.looping) return;
    this.looping = true;
    let pausedBySpeech = false;
    while (this.enabled) {
      if (this.speaking || document.hidden) {
        pausedBySpeech = true;
        await delay(250);
        continue;
      }
      if (pausedBySpeech) {
        pausedBySpeech = false;
        await delay(ECHO_GUARD_MS); // let the room go quiet after TTS
        continue;
      }
      const text = await listenOnce({ onStateChange: this.onListenState });
      if (!this.enabled) break;
      const clean = text && text.trim().length > 1 &&
        !this.speaking && timeSinceSpeechEnd() > ECHO_GUARD_MS;
      if (clean) {
        try { await this.handler(text.trim()); } catch {}
        await delay(150);
      } else {
        await delay(500);
      }
    }
    this.looping = false;
  }
}
