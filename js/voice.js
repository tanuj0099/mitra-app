// Hands-free voice loop: continuously listens (except while Mitra speaks)
// and passes every heard utterance to the intent handler.

import { listenOnce, hasRecognition } from "./speech.js";

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
    while (this.enabled) {
      if (this.speaking || document.hidden) { await delay(300); continue; }
      const text = await listenOnce({ onStateChange: this.onListenState });
      if (!this.enabled) break;
      // Discard anything captured while Mitra was talking (it hears itself)
      if (text && text.trim().length > 1 && !this.speaking) {
        try { await this.handler(text.trim()); } catch {}
        await delay(150);
      } else {
        await delay(600);
      }
    }
    this.looping = false;
  }
}
