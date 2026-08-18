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
      <a-camera position="0 1.6 0" look-controls="magicWindowTrackingEnabled: true" wasd-controls="enabled: false">
        <a-cursor fuse="false" raycaster="objects: .clickable" color="#FFD700" opacity="0.6"></a-cursor>
      </a-camera>
      
      <!-- Lighting -->
      <a-light type="ambient" color="#ffffff" intensity="0.6"></a-light>
      <a-light type="directional" color="#ffffff" intensity="0.8" position="-1 2 1"></a-light>
      
      <!-- Golden Coin -->
      <a-entity id="ar-coin" class="clickable" position="0 0.5 -2" animation="property: rotation; to: 0 360 0; loop: true; dur: 2000; easing: linear">
        <a-cylinder color="#FFD700" radius="0.25" height="0.04" rotation="90 0 0" material="metalness: 0.8; roughness: 0.2"></a-cylinder>
        <a-text value=":)" color="#b38a00" align="center" width="4" position="0 0 0.025"></a-text>
        <a-text value=":)" color="#b38a00" align="center" width="4" position="0 0 -0.025" rotation="0 180 0"></a-text>
        <a-light type="point" color="#FFD700" intensity="0.5" distance="1"></a-light>
      </a-entity>
      
      <!-- Central Zen Sapling Removed -->
    </a-scene>
  `;
  sceneInitialized = true;
  
  setTimeout(() => {
    const coin = document.getElementById("ar-coin");
    if (coin) {
      coin.addEventListener("click", () => {
        if (isPlaying) collectCoin();
      });
    }
  }, 500);
}

function spawnCoin() {
  const cameraEl = document.querySelector("a-camera");
  const coin = document.getElementById("ar-coin");
  if (!cameraEl || !coin || !cameraEl.object3D) return;

  const cam3D = cameraEl.object3D;
  const direction = new THREE.Vector3();
  cam3D.getWorldDirection(direction);
  // Flatten direction to ground level
  direction.y = 0;
  if (direction.lengthSq() < 0.01) {
    direction.set(0, 0, -1);
  }
  direction.normalize();
  
  const camPos = new THREE.Vector3();
  cam3D.getWorldPosition(camPos);
  
  // Spawn coin 1.5 meters away, near the ground
  const targetPos = camPos.clone().add(direction.multiplyScalar(1.5));
  targetPos.y = -1.2; // Move it closer to ground level
  
  coin.setAttribute("position", `${targetPos.x} ${targetPos.y} ${targetPos.z}`);
  coin.setAttribute("scale", "1 1 1");
  coin.setAttribute("visible", "true");
  coin.classList.add("clickable");
  
  currentDistance = 1.5;
  stepCount = 0;
}

function gameLoop() {
  if (!isPlaying) return;
  const coin = document.getElementById("ar-coin");
  const cameraEl = document.querySelector("a-camera");
  
  if (coin && cameraEl && coin.object3D && cameraEl.object3D) {
    const coinPos = new THREE.Vector3();
    coin.object3D.getWorldPosition(coinPos);
    
    const camPos = new THREE.Vector3();
    cameraEl.object3D.getWorldPosition(camPos);
    
    const dist = camPos.distanceTo(coinPos);
    // If user physically moves the phone close to the coin, collect it!
    if (dist < 1.2) {
      collectCoin();
    }
  }
  
  requestAnimationFrame(gameLoop);
}

function handleMotion(e) {
  // Purposefully left empty.
  // The coin is now stationary, requiring physical positional tracking to collect.
}

async function collectCoin() {
  isPlaying = false;
  
  const coin = document.getElementById("ar-coin");
  if (coin) {
    coin.classList.remove("clickable");
    coin.setAttribute("animation__collect", "property: scale; to: 3 3 3; dur: 400");
    setTimeout(() => {
      coin.setAttribute("visible", "false");
    }, 400);
  }
  
  let badges = parseInt(localStorage.getItem("happy_ar_badges") || "0", 10);
  badges++;
  localStorage.setItem("happy_ar_badges", badges.toString());
  
  const cameraEl = document.querySelector("a-camera");
  if (cameraEl && cameraEl.object3D) {
    const camPos = new THREE.Vector3();
    cameraEl.object3D.getWorldPosition(camPos);
    
    const camDir = new THREE.Vector3();
    cameraEl.object3D.getWorldDirection(camDir);
    
    const textPos = camPos.clone().add(camDir.multiplyScalar(2));
    
    const plusOne = document.createElement("a-text");
    plusOne.setAttribute("value", "+1 Coin!");
    plusOne.setAttribute("color", "#FFD700");
    plusOne.setAttribute("align", "center");
    plusOne.setAttribute("scale", "1.5 1.5 1.5");
    plusOne.setAttribute("position", `${textPos.x} 1.5 ${textPos.z}`);
    plusOne.setAttribute("animation", `property: position; to: ${textPos.x} 2.5 ${textPos.z}; dur: 1500; easing: easeOutQuad`);
    document.querySelector("a-scene").appendChild(plusOne);
    
    // (Sapling growth removed)
    
    speak("Coin collected! Excellent reach.");
    
    setTimeout(() => {
      plusOne.remove();
      spawnCoin();
      isPlaying = true;
      gameLoop();
    }, 2000);
  }
}

export async function startARGame() {
  setupScene();
  
  // Wait a tiny bit for A-Frame to mount the camera
  setTimeout(() => {
    spawnCoin();
    isPlaying = true;
    gameLoop();
  }, 500);
  
  try {
    arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.getElementById("ar-camera-feed");
    video.srcObject = arStream;
    await video.play();
  } catch (err) {
    console.error("Camera access denied or unavailable:", err);
  }
  
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
  
  await speak("I have placed a golden coin! Move your phone toward it to collect it.");
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
