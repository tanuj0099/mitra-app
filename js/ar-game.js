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
        <a-entity id="hud-compass" position="0 -0.5 -1">
          <a-cone color="#B8965A" radius-bottom="0.05" height="0.2" rotation="-90 0 0"></a-cone>
          <a-text value="Follow!" color="white" align="center" width="1.5" position="0 -0.15 0"></a-text>
        </a-entity>
      </a-camera>
      
      <!-- Lighting -->
      <a-light type="ambient" color="#ffffff" intensity="0.6"></a-light>
      <a-light type="directional" color="#ffffff" intensity="0.8" position="-1 2 1"></a-light>
      
      <!-- Hologram Water Droplet -->
      <a-entity id="ar-coin" position="0 1.5 -8" scale="0.5 0.5 0.5" animation="property: position; dir: alternate; loop: true; dur: 2000; to: 0 1.7 -8">
        <a-sphere color="#37e0ff" radius="0.3" opacity="0.8"></a-sphere>
        <a-sphere color="#ffffff" radius="0.1" position="-0.1 0.1 0.2"></a-sphere>
        <a-light type="point" color="#37e0ff" intensity="1" distance="2"></a-light>
      </a-entity>
      
      <!-- Central Zen Sapling -->
      <a-entity id="ar-sapling" position="0 -0.5 -4" scale="1 1 1">
        <a-cylinder color="#3a2f2a" height="0.1" radius="1.2" position="0 0 0"></a-cylinder>
        <a-cone id="sapling-plant" color="#4F7A5B" radius-bottom="0.2" height="0.5" position="0 0.3 0"></a-cone>
      </a-entity>
    </a-scene>
  `;
  sceneInitialized = true;
}

function spawnCoin() {
  const cameraEl = document.querySelector("a-camera");
  const coin = document.getElementById("ar-coin");
  if (!cameraEl || !coin || !cameraEl.object3D) return;

  const cam3D = cameraEl.object3D;
  const direction = new THREE.Vector3();
  cam3D.getWorldDirection(direction);
  
  const camPos = new THREE.Vector3();
  cam3D.getWorldPosition(camPos);
  
  const targetPos = camPos.clone().add(direction.multiplyScalar(MAX_DISTANCE));
  
  coin.setAttribute("position", `${targetPos.x} 1.5 ${targetPos.z}`);
  coin.setAttribute("scale", "0.5 0.5 0.5");
  coin.setAttribute("visible", "true");
  
  currentDistance = MAX_DISTANCE;
  stepCount = 0;
}

function compassLoop() {
  if (!isPlaying) return;
  const coin = document.getElementById("ar-coin");
  const compass = document.getElementById("hud-compass");
  
  if (coin && compass && coin.object3D && compass.object3D) {
    const coinPos = new THREE.Vector3();
    coin.object3D.getWorldPosition(coinPos);
    compass.object3D.lookAt(coinPos);
  }
  
  requestAnimationFrame(compassLoop);
}

function handleMotion(e) {
  if (!isPlaying) return;
  
  const accel = e.accelerationIncludingGravity || e.acceleration;
  if (!accel) return;
  
  const y = accel.y;
  const delta = Math.abs(y - lastAccelY);
  lastAccelY = y;
  
  if (delta > 1.5) {
    stepCount++;
    if (stepCount >= 3) {
      stepCount = 0;
      currentDistance = Math.max(0, currentDistance - 0.5);
      
      const coin = document.getElementById("ar-coin");
      const cameraEl = document.querySelector("a-camera");
      
      if (coin && cameraEl && cameraEl.object3D) {
        const camPos = new THREE.Vector3();
        cameraEl.object3D.getWorldPosition(camPos);
        
        const coinPos = new THREE.Vector3();
        coin.object3D.getWorldPosition(coinPos);
        
        // Move coin closer along the vector between camera and current coin position
        const dir = new THREE.Vector3().subVectors(coinPos, camPos).normalize();
        const newPos = camPos.clone().add(dir.multiplyScalar(currentDistance));
        
        coin.setAttribute("position", `${newPos.x} 1.5 ${newPos.z}`);
        
        const scale = 0.5 + ((MAX_DISTANCE - currentDistance) * 0.1);
        coin.setAttribute("scale", `${scale} ${scale} ${scale}`);
      }
      
      if (currentDistance <= 0) {
        collectCoin();
      }
    }
  }
}

async function collectCoin() {
  isPlaying = false;
  
  const coin = document.getElementById("ar-coin");
  if (coin) {
    coin.setAttribute("animation", "property: scale; to: 5 5 5; dur: 500");
    setTimeout(() => {
      coin.setAttribute("visible", "false");
    }, 500);
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
    plusOne.setAttribute("value", "+1 Droplet!");
    plusOne.setAttribute("color", "#37e0ff");
    plusOne.setAttribute("align", "center");
    plusOne.setAttribute("scale", "2 2 2");
    plusOne.setAttribute("position", `${textPos.x} 1.5 ${textPos.z}`);
    plusOne.setAttribute("animation", `property: position; to: ${textPos.x} 3 ${textPos.z}; dur: 1500; easing: easeOutQuad`);
    document.querySelector("a-scene").appendChild(plusOne);
    
    // Grow sapling
    const sapling = document.getElementById("sapling-plant");
    if (sapling) {
       const curScale = sapling.getAttribute("scale") || {x:1, y:1, z:1};
       const newScale = `${curScale.x * 1.1} ${curScale.y * 1.2} ${curScale.z * 1.1}`;
       sapling.setAttribute("animation__grow", `property: scale; to: ${newScale}; dur: 1000; easing: easeOutElastic`);
    }
    
    speak("Water collected! Your garden is growing. Find the next drop.");
    
    setTimeout(() => {
      plusOne.remove();
      spawnCoin();
      isPlaying = true;
      compassLoop();
    }, 2000);
  }
}

export async function startARGame() {
  setupScene();
  
  // Wait a tiny bit for A-Frame to mount the camera
  setTimeout(() => {
    spawnCoin();
    isPlaying = true;
    compassLoop();
  }, 500);
  
  try {
    arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.getElementById("ar-camera-feed");
    video.srcObject = arStream;
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
  
  await speak("I have placed a hologram. Follow the red compass arrow to find it!");
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
