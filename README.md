# Mitra — Companion Robot Web App 🤖

**Claude Impact Lab · Superhuman Lab · Bangalore · Aug 8–9, 2026**

Mitra ("friend") is the face and brain of our companion robot for elderly people
and people with limited mobility. A phone or iPad in landscape mode, mounted in
the robot body, runs this web app.

## Features

- **Animated robot face** — Wall-E-style eyes that blink, listen, and talk.
- **💬 Companion chat** — tap-to-talk voice conversation with a warm caregiver
  personality (typed input as fallback).
- **🏋️ Exercise coach** — camera + on-device pose detection (MediaPipe) with a
  live skeleton overlay and automatic rep counting for wheelchair-accessible,
  upper-body exercises (arm raises, elbow curls, overhead reach, side bends).
  Guided framing check, 2 practice reps to learn the user's own range of
  motion, spoken counts, and AI form feedback.
- **🎵 Entertainment** — stories, jokes, riddles, and a cheerful tune.

## Two modes

- **Offline mode (default)** — works with no keys: scripted companion replies,
  rule-based coaching feedback, canned stories. The demo never breaks.
- **AI mode** — tap ⚙️ and paste a Claude API key. Chat becomes a real
  conversation, and the coach sends camera snapshots to Claude for personalized
  posture feedback. No redeploy needed; the key is stored only on the device.

## Two-screen mode (phone = face, laptop = big screen)

The robot's phone always shows the face; a laptop can act as the "projector"
that runs the camera modes:

1. On the phone, open the app URL normally and tap wake.
2. On the laptop, open the **same URL with `?stage=1`** and click
   "Start camera screen". It connects to the phone automatically (WebRTC via
   PeerJS) and uses the **laptop's own webcam**.
3. Say "let's exercise" or "play some music" to the phone — the laptop runs
   the camera view while the phone keeps showing the face, speaking counts
   and feedback. If no laptop is connected, the phone uses its own camera.

Multiple teams on one network? Add the same `?room=yourname` to both URLs.

## Running it

The camera and mic require **HTTPS**, so open the deployed URL on the phone:

1. Enable GitHub Pages: repo **Settings → Pages → Source: GitHub Actions**.
2. Push to this branch — the included workflow deploys automatically.
3. Open the Pages URL on the phone/iPad in **landscape**, tap **Wake Mitra**,
   and allow mic + camera.

On iPhone: enable **Siri & Dictation** in iOS Settings for voice input, and use
Safari. Add to Home Screen for a full-screen, no-browser-chrome look.

Local development: `python3 -m http.server 8000` and open
`http://localhost:8000` (camera works on localhost without HTTPS).

## Stack

Plain HTML/CSS/JS, no build step. MediaPipe Tasks Vision (CDN) for pose,
Web Speech API for voice, Claude API (direct browser calls) for intelligence.
