import { speak } from "./speech.js";

const MAX_DISTANCE = 8.0;
let currentDistance = MAX_DISTANCE;
let arStream = null;
let lastAccelY = 0;
let stepCount = 0;
let isPlaying = false;
let sceneInitialized = false;

function setupScene() {
  if (sceneInitialized) return;
  const container = document.getElementById("ar-scene-container");
  container.innerHTML = `
    <a-scene embedded vr-mode-ui="enabled: false" background="transparent: true">
      <a-camera position="0 1.6 0" look-controls="magicWindowTrackingEnabled: true" wasd-controls="enabled: false"></a-camera>
      
      <!-- Hologram Coin / Badge -->
      <a-entity id="ar-coin" position="0 1.5 -${MAX_DISTANCE}" scale="0.5 0.5 0.5" animation="property: rotation; to: 0 360 0; loop: true; dur: 2000">
        <a-cylinder color="gold" height="0.1" radius="1" rotation="90 0 0"></a-cylinder>
        <a-text value="Happy" color="black" align="center" width="6" position="0 0 0.06"></a-text>
        <a-text value="Badge" color="black" align="center" width="4" position="0 -0.5 0.06"></a-text>
      </a-entity>
    </a-scene>
  `;
  sceneInitialized = true;
}

function handleMotion(e) {
  if (!isPlaying) return;
  
  // Basic pedometer/wheelchair push detection
  const accel = e.accelerationIncludingGravity || e.acceleration;
  if (!accel) return;
  
  // Looking for spikes in acceleration (wheelchair push or physical step)
  const y = accel.y;
  const delta = Math.abs(y - lastAccelY);
  lastAccelY = y;
  
  // If spike > 1.5, we count it as a "push"
  if (delta > 1.5) {
    stepCount++;
    // Move the coin closer by 0.5m every 3 pushes
    if (stepCount >= 3) {
      stepCount = 0;
      currentDistance = Math.max(0, currentDistance - 0.5);
      
      const coin = document.getElementById("ar-coin");
      if (coin) {
        coin.setAttribute("position", `0 1.5 -${currentDistance}`);
        // Scale it up as it gets closer
        const scale = 0.5 + ((MAX_DISTANCE - currentDistance) * 0.1);
        coin.setAttribute("scale", `${scale} ${scale} ${scale}`);
      }
      
      document.getElementById("ar-distance").textContent = currentDistance.toFixed(1);
      
      if (currentDistance <= 0) {
        collectCoin();
      }
    }
  }
}

async function collectCoin() {
  isPlaying = false;
  
  // Visual explosion/hide
  const coin = document.getElementById("ar-coin");
  if (coin) {
    coin.setAttribute("animation", "property: scale; to: 5 5 5; dur: 500");
    setTimeout(() => {
      coin.setAttribute("visible", "false");
    }, 500);
  }
  
  // Log badge locally
  let badges = parseInt(localStorage.getItem("happy_ar_badges") || "0", 10);
  badges++;
  localStorage.setItem("happy_ar_badges", badges.toString());
  
  // Create +1 floating text
  const plusOne = document.createElement("a-text");
  plusOne.setAttribute("value", "+1 Badge!");
  plusOne.setAttribute("color", "green");
  plusOne.setAttribute("align", "center");
  plusOne.setAttribute("scale", "2 2 2");
  plusOne.setAttribute("position", `0 2 -${currentDistance + 1}`);
  plusOne.setAttribute("animation", "property: position; to: 0 4 -2; dur: 1500; easing: easeOutQuad");
  document.querySelector("a-scene").appendChild(plusOne);
  
  speak("Badge collected! Keep going!");
  
  // Respawn after 2 seconds
  setTimeout(() => {
    plusOne.remove();
    currentDistance = MAX_DISTANCE;
    stepCount = 0;
    document.getElementById("ar-distance").textContent = currentDistance.toFixed(1);
    if (coin) {
      coin.setAttribute("position", `0 1.5 -${MAX_DISTANCE}`);
      coin.setAttribute("scale", "0.5 0.5 0.5");
      coin.setAttribute("visible", "true");
    }
    isPlaying = true;
  }, 2000);
}

export async function startARGame() {
  setupScene();
  currentDistance = MAX_DISTANCE;
  stepCount = 0;
  isPlaying = true;
  document.getElementById("ar-distance").textContent = currentDistance.toFixed(1);
  
  const coin = document.getElementById("ar-coin");
  if (coin) {
    coin.setAttribute("position", `0 1.5 -${MAX_DISTANCE}`);
    coin.setAttribute("scale", "0.5 0.5 0.5");
    coin.setAttribute("visible", "true");
  }
  
  try {
    arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.getElementById("ar-camera-feed");
    video.srcObject = arStream;
  } catch (err) {
    console.error("Camera access denied or unavailable:", err);
  }
  
  // Request motion permissions for iOS 13+
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission === "granted") {
        window.addEventListener("devicemotion", handleMotion);
      }
    } catch (err) {
      console.error("Motion permission denied:", err);
    }
  } else {
    window.addEventListener("devicemotion", handleMotion);
  }
  
  await speak("I have placed a hologram in front of you. Push your wheelchair forward to collect it!");
}

export function stopARGame() {
  isPlaying = false;
  window.removeEventListener("devicemotion", handleMotion);
  if (arStream) {
    arStream.getTracks().forEach(t => t.stop());
    arStream = null;
  }
  document.getElementById("ar-camera-feed").srcObject = null;
}
