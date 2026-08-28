import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  ensureAudio, beep, crashSound, whoosh,
  startEngine, stopEngine, setEnginePitch, playBeat, setMusicIntensity
} from './audio.js';
import * as ui from './ui.js';

const $ = id => document.getElementById(id);
const LANES = [-2.5, 0, 2.5];
const GRAVITY = -38, JUMP_V = 13;
const COMBO_WINDOW = 2.5;
const TRACK_HALF = 2.5;
const TOASTS = { 5: '手感来了!', 10: '连击狂潮!', 15: '火力全开!', 20: '超神操作!', 30: '登峰造极!!' };
const TIER_COLORS = [0x00ffff, 0x66ff22, 0xffee00, 0xff8822, 0xff22cc];
const TIER_NAMES = ['', '引擎过载 · 横移强化!', '能量护盾展开!', '磁力场激活!', '究极形态 · 双倍得分!!'];

let scene, camera, renderer, composer, clock, bloomPass, railMat;
let grid, ship, shipGlowMat;
let obstacles = [], orbs = [], pillars = [], particles = [], streaks = [], shockwaves = [];
let state = 'menu', paused = false;
let vy = 0, grounded = true;
let speed = 26, maxSpeed = 26, dist = 0, spawnDist = 0, orbCount = 0, elapsed = 0, score = 0;
let shakeTime = 0, best = +(localStorage.getItem('neonRacerBest') || 0);
let combo = 0, comboTimer = 0, maxCombo = 0;
let streakTimer = 0, fovKick = 0;
let beatTimer = 0, beatGlow = 0, beatCount = 0, timeScale = 1, lastSpeedMark = 26, camRoll = 0;
let overTimerId = null;
let shieldReady = false, invuln = 0, orbCountAtShieldEvent = 0;
let tier = 0;
let latVel = 0;
const activePointers = new Map();
const keys = { left: false, right: false };

function addScore(base) {
  const g = base * (tier >= 4 ? 2 : 1);
  score += g;
  return g;
}

function calcTier() {
  return orbCount >= 100 ? 4 : orbCount >= 65 ? 3 : orbCount >= 35 ? 2 : orbCount >= 15 ? 1 : 0;
}

function updateHUD() {
  ui.updateHUD({
    dist, bonus: score, speed, orbCount, maxCombo, tier,
    shieldReady, charge: orbCount - orbCountAtShieldEvent,
    tierColorHex: TIER_COLORS[tier].toString(16).padStart(6, '0')
  });
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05050f);
  scene.fog = new THREE.Fog(0x05050f, 30, 150);

  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 300);
  camera.position.set(0, 4.6, 8.5);
  camera.lookAt(0, 1, -12);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.1, 0.6, 0.25);
  composer.addPass(bloomPass);

  scene.add(new THREE.AmbientLight(0x5566aa, 1.6));
  const dir = new THREE.DirectionalLight(0xffffff, 2);
  dir.position.set(3, 8, 4);
  scene.add(dir);

  grid = new THREE.GridHelper(400, 100, 0x00ffff, 0x004466);
  grid.material.transparent = true;
  grid.material.opacity = 0.85;
  scene.add(grid);

  railMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  for (const x of [-5.4, 5.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 400), railMat);
    rail.position.set(x, 0.05, -150);
    scene.add(rail);
  }

  const starGeo = new THREE.BufferGeometry();
  const pos = [];
  for (let i = 0; i < 600; i++) {
    pos.push((Math.random() - 0.5) * 300, Math.random() * 80 + 10, -Math.random() * 250 - 20);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x88ccff, size: 0.35, transparent: true, opacity: 0.7 })));

  buildShip();
}

function buildShip() {
  ship = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14142a, metalness: 0.9, roughness: 0.25 });
  shipGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.7, 4), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  ship.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), shipGlowMat.clone());
  cockpit.material.color.set(0x66ffff);
  cockpit.position.set(0, 0.22, 0.1);
  ship.add(cockpit);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.62), bodyMat);
  wing.position.y = -0.06;
  ship.add(wing);

  const tipMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const tips = [];
  for (const x of [-0.95, 0.95]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.66), tipMat);
    tip.position.set(x, -0.04, 0);
    ship.add(tip);
    tips.push(tip);
  }
  ship.userData.tips = tips;

  const flames = [];
  for (const x of [-0.32, 0.32]) {
    const engine = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), shipGlowMat);
    engine.position.set(x, 0, 0.82);
    ship.add(engine);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.1, 8), shipGlowMat.clone());
    flame.material.transparent = true; flame.material.opacity = 0.65;
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0, 1.45);
    ship.add(flame);
    flames.push(flame);
  }
  ship.userData.flames = flames;
  ship.userData.cockpit = cockpit;

  const shieldBubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  shieldBubble.visible = false;
  ship.add(shieldBubble);
  ship.userData.shieldBubble = shieldBubble;

  const aura = new THREE.Mesh(
    new THREE.TorusGeometry(1.3, 0.06, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false })
  );
  aura.visible = false;
  ship.add(aura);
  ship.userData.aura = aura;

  ship.position.set(0, 0.95, 0);
  scene.add(ship);
}

const wallMat = new THREE.MeshBasicMaterial({ color: 0xff2255 });
const lowMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
const orbMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false });
const pillarMat = new THREE.MeshBasicMaterial({ color: 0x2244ff });
const streakMat = new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.35, fog: false });

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(90,255,255,0.55)');
  grad.addColorStop(1, 'rgba(0,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const orbHaloMat = new THREE.SpriteMaterial({ map: makeGlowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

function makeWall(lane, z) {
  const g = new THREE.Group();
  const w = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 0.5), wallMat);
  w.position.y = 1.6;
  const e = new THREE.Mesh(new THREE.BoxGeometry(2.55, 3.35, 0.56),
    new THREE.MeshBasicMaterial({ color: 0xff2255, wireframe: true }));
  e.position.y = 1.6;
  g.add(w, e);
  g.position.set(LANES[lane], 0, z);
  g.userData = { type: 'wall', lane };
  return g;
}

function makeLow(lane, z) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 0.5), lowMat);
  b.position.y = 0.38;
  const e = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.85, 0.55),
    new THREE.MeshBasicMaterial({ color: 0xff8800, wireframe: true }));
  e.position.y = 0.38;
  g.add(b, e);
  g.position.set(LANES[lane], 0, z);
  g.userData = { type: 'low', lane };
  return g;
}

function makeOrb(x, y, z) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), orbMat);
  const halo = new THREE.Sprite(orbHaloMat);
  halo.scale.set(1.9, 1.9, 1);
  m.add(halo);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.05, 8, 26),
    new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false })
  );
  ring.rotation.x = Math.PI / 2;
  m.add(ring);
  m.userData = { baseY: y, phase: Math.random() * Math.PI * 2, ring };
  m.position.set(x, y, z);
  return m;
}

function makePillar(z) {
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), pillarMat);
  p.position.set(Math.random() < 0.5 ? -7.5 : 7.5, 2.5, z);
  return p;
}

function spawnPattern() {
  const roll = Math.random();
  if (roll < 0.18) {
    const lane = (Math.random() * 3) | 0;
    for (let i = 0; i < 5; i++) {
      const o = makeOrb(LANES[lane], 1.2, -140 - i * 2);
      orbs.push(o);
      scene.add(o);
    }
    return;
  }
  const freeLane = (Math.random() * 3) | 0;
  for (let lane = 0; lane < 3; lane++) {
    if (lane === freeLane) continue;
    if (Math.random() < 0.75) {
      const isLow = Math.random() < 0.4;
      const obj = isLow ? makeLow(lane, -140) : makeWall(lane, -140);
      obstacles.push(obj);
      scene.add(obj);
    } else if (Math.random() < 0.5) {
      const o = makeOrb(LANES[lane], 1.2, -140);
      orbs.push(o);
      scene.add(o);
    }
  }
  if (Math.random() < 0.6) {
    for (let i = 1; i <= 3 + ((Math.random() * 3) | 0); i++) {
      const o = makeOrb(LANES[freeLane], 1.2, -140 - i * 2);
      orbs.push(o);
      scene.add(o);
    }
  }
}

function burst(pos, color, size, maxLife, power, count = 140) {
  const geo = new THREE.BufferGeometry();
  const posArr = new Float32Array(count * 3), vel = [];
  for (let i = 0; i < count; i++) {
    posArr[i * 3] = pos.x; posArr[i * 3 + 1] = pos.y; posArr[i * 3 + 2] = pos.z;
    vel.push(new THREE.Vector3(
      (Math.random() - 0.5) * 16 * power,
      Math.random() * 12 * power + 2,
      (Math.random() - 0.5) * 16 * power
    ));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  const mat = new THREE.PointsMaterial({ color, size, transparent: true, fog: false });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  particles.push({ pts, vel, life: maxLife, maxLife });
}

function explode(pos) {
  burst(pos, 0xff5533, 0.45, 1.5, 1.5, 220);
  burst(pos, 0xffffff, 0.32, 0.5, 0.9, 70);
}

const shockGeo = new THREE.TorusGeometry(1, 0.05, 8, 48);
function spawnShockwave(pos, color, power = 1) {
  const m = new THREE.Mesh(shockGeo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, fog: false }));
  m.position.set(pos.x, Math.max(0.15, pos.y), pos.z);
  m.scale.setScalar(0.3);
  scene.add(m);
  shockwaves.push({ m, life: 0.6 * power, maxLife: 0.6 * power, power });
}

function shieldBreakFx() {
  spawnShockwave(ship.position, 0x00ffff, 1.2);
  spawnShockwave(ship.position, 0xffffff, 0.7);
  burst(ship.position, 0x00ffff, 0.26, 0.7, 1.2, 80);
  ui.flash('#00ffff', 0.3, 400);
  ui.toast('护盾破碎!', '#00ffff');
  shakeTime = Math.max(shakeTime, 0.4);
  beep(800, 0.2, 'sawtooth', 0.12);
  setTimeout(() => beep(400, 0.25, 'sawtooth', 0.1), 100);
}

function applyShipTier() {
  const c = TIER_COLORS[tier];
  shipGlowMat.color.setHex(c);
  ship.userData.cockpit.material.color.setHex(c).lerp(new THREE.Color(0xffffff), 0.35);
  for (const t of ship.userData.tips) t.material.color.setHex(c);
  const aura = ship.userData.aura;
  aura.visible = tier >= 2;
  aura.material.color.setHex(c);
  if (ship.userData.shieldBubble) ship.userData.shieldBubble.visible = tier >= 2 && shieldReady;
  if (scene && grid) {
    const tc = new THREE.Color(TIER_COLORS[tier]);
    grid.material.color.copy(tc).multiplyScalar(0.5);
    if (railMat) railMat.color.copy(tc).multiplyScalar(0.9);
    scene.background.copy(new THREE.Color(0x05050f)).lerp(tc, 0.05);
  }
}

function resetGame() {
  for (const o of [...obstacles, ...orbs, ...pillars, ...streaks]) scene.remove(o);
  for (const p of particles) scene.remove(p.pts);
  obstacles = []; orbs = []; pillars = []; particles = []; streaks = [];
  vy = 0; grounded = true;
  keys.left = keys.right = false;
  speed = 26; maxSpeed = 26; dist = 0; spawnDist = 0; orbCount = 0; elapsed = 0; shakeTime = 0;
  combo = 0; comboTimer = 0; score = 0; streakTimer = 0; fovKick = 0;
  beatTimer = 0; beatGlow = 0; timeScale = 1; lastSpeedMark = 26; camRoll = 0;
  shieldReady = false; invuln = 0; orbCountAtShieldEvent = 0;
  maxCombo = 0;
  latVel = 0; activePointers.clear();
  for (const s of shockwaves) scene.remove(s.m);
  shockwaves = [];
  ui.els.vig.style.opacity = 0;
  ui.els.comboBox.style.opacity = 0;
  tier = 0;
  applyShipTier();
  camera.fov = 70;
  camera.updateProjectionMatrix();
  ship.position.set(0, 0.95, 0);
  ship.rotation.z = 0;
  ship.visible = true;
  updateHUD();
}

function startGame() {
  ensureAudio();
  if (overTimerId) { clearTimeout(overTimerId); overTimerId = null; }
  ui.resetRunSummary();
  resetGame();
  beatCount = 0;
  startEngine();
  state = 'playing'; paused = false;
  $('startScreen').classList.add('hidden');
  $('overScreen').classList.add('hidden');
}

function gameOver() {
  state = 'over';
  crashSound();
  explode(ship.position);
  ship.visible = false;
  shakeTime = 0.9;
  ui.flash('#ffffff', 0.5, 500);
  ui.els.comboBox.style.opacity = 0;
  ui.els.vig.style.opacity = 0;
  stopEngine();
  timeScale = 0.25;
  const sc = Math.floor(dist) + score;
  const isRecord = sc > best;
  if (isRecord) {
    best = sc;
    localStorage.setItem('neonRacerBest', best);
  }
  ui.els.bestEl.textContent = best;
  ui.prepareRunSummary({
    score: sc, distanceMeters: dist, orbCount, maxCombo,
    topSpeedKmh: maxSpeed * 3.6, elapsed, tier, isRecord,
    tierColorHex: TIER_COLORS[tier].toString(16).padStart(6, '0')
  });
  overTimerId = setTimeout(() => {
    if (state === 'over') {
      $('overScreen').classList.remove('hidden');
      ui.playRunSummary(index => beep(420 + index * 105, 0.055, 'square', 0.045));
    }
  }, 900);
}

function jump() {
  if (state !== 'playing' || paused || !grounded) return;
  vy = JUMP_V;
  grounded = false;
  ship.scale.set(0.8, 1.35, 0.8);
  beep(500, 0.15, 'sine', 0.1);
  setTimeout(() => beep(750, 0.12, 'sine', 0.08), 70);
}

addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
    e.preventDefault();
    if (state === 'playing') jump();
    else startGame();
  } else if (e.code === 'Enter' && state !== 'playing') startGame();
});

addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || e.target.closest('button')) return;
  if (state !== 'playing' || paused) return;
  activePointers.set(e.pointerId, { x: e.clientX, baseY: e.clientY });
});
addEventListener('pointermove', e => {
  const p = activePointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  if (e.clientY > p.baseY) p.baseY = e.clientY;
  else if (p.baseY - e.clientY >= 55) { jump(); p.baseY = e.clientY; }
});
const releasePointer = e => activePointers.delete(e.pointerId);
addEventListener('pointerup', releasePointer);
addEventListener('pointercancel', releasePointer);

$('startBtn').onclick = startGame;
$('restartBtn').onclick = startGame;

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') paused = true;
});
addEventListener('keydown', () => {
  if (paused && state === 'playing') { paused = false; $('pauseScreen').classList.add('hidden'); }
});
addEventListener('pointerdown', () => {
  if (paused && state === 'playing') { paused = false; $('pauseScreen').classList.add('hidden'); }
});

function showPaused() {
  $('pauseScreen').classList.remove('hidden');
}

$('fsBtn').onclick = e => {
  e.stopPropagation();
  const d = document, de = d.documentElement;
  try {
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const fn = de.requestFullscreen || de.webkitRequestFullscreen;
      if (fn) { const r = fn.call(de); if (r && r.catch) r.catch(() => ui.toast('请使用分享菜单添加到主屏幕', '#ff8822')); }
    } else {
      const fn = d.exitFullscreen || d.webkitExitFullscreen;
      if (fn) fn.call(d);
    }
  } catch (err) {}
};

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(onResize, 350));

initScene();
ui.initUI(camera);
ui.els.bestEl.textContent = best;
clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  grid.position.z = (grid.position.z + (state === 'playing' ? speed : 8) * dt) % 4;

  if (state === 'menu') {
    ship.position.x = Math.sin(t) * 2.5;
    ship.rotation.z = -Math.cos(t) * 0.35;
    ship.position.y = 0.95 + Math.sin(t * 3) * 0.1;
    camera.lookAt(ship.position.x * 0.4, 1, -12);
  }

  if (state === 'playing' && !paused) {
    elapsed += dt;
    speed = Math.min(72, 26 + elapsed * 0.55);
    maxSpeed = Math.max(maxSpeed, speed);
    const move = speed * dt;
    dist += move;
    spawnDist += move;

    const gap = Math.max(15, 26 - elapsed * 0.25);
    if (spawnDist >= gap) { spawnDist = 0; spawnPattern(); }

    if ((dist % 14) < move) {
      const p = makePillar(-150);
      pillars.push(p);
      scene.add(p);
    }

    let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let braking = false;
    if (activePointers.size) {
      let s = 0, hasL = false, hasR = false;
      for (const p of activePointers.values()) {
        const side = p.x < innerWidth / 2 ? -1 : 1;
        s += side;
        if (side < 0) hasL = true; else hasR = true;
      }
      if (hasL && hasR) braking = true;
      dir += s;
    }
    dir = Math.max(-1, Math.min(1, dir));
    const maxV = (5 + speed * 0.27) * (1 + tier * 0.08);
    if (dir !== 0) {
      latVel += dir * 150 * dt;
    } else {
      const decel = (braking ? 340 : 175) * dt;
      latVel = Math.abs(latVel) <= decel ? 0 : latVel - Math.sign(latVel) * decel;
    }
    latVel = Math.max(-maxV, Math.min(maxV, latVel));
    const nx = ship.position.x + latVel * dt;
    if ((nx <= -TRACK_HALF && latVel < 0) || (nx >= TRACK_HALF && latVel > 0)) latVel = 0;
    ship.position.x = Math.max(-TRACK_HALF, Math.min(TRACK_HALF, nx));
    const bankTarget = Math.max(-0.45, Math.min(0.45, -latVel * 0.02));
    ship.rotation.z += (bankTarget - ship.rotation.z) * Math.min(1, dt * 10);

    if (!grounded) {
      vy += GRAVITY * dt;
      ship.position.y += vy * dt;
      if (ship.position.y <= 0.95) {
        ship.position.y = 0.95; grounded = true; vy = 0;
        ship.scale.set(1.3, 0.65, 1.3);
        burst(new THREE.Vector3(ship.position.x, 0.25, 0.5), 0x66ccff, 0.16, 0.35, 0.4, 14);
        beep(170, 0.09, 'sine', 0.1);
        shakeTime = Math.max(shakeTime, 0.12);
      }
    } else {
      ship.position.y = 0.95 + Math.sin(t * 3.2) * 0.07;
    }
    ship.scale.x += (1 - ship.scale.x) * Math.min(1, dt * 9);
    ship.scale.y += (1 - ship.scale.y) * Math.min(1, dt * 9);
    ship.scale.z += (1 - ship.scale.z) * Math.min(1, dt * 9);

    if (invuln > 0) {
      invuln -= dt;
      ship.visible = Math.floor(t * 18) % 2 === 0;
      if (invuln <= 0) ship.visible = true;
    }

    for (let i = pillars.length - 1; i >= 0; i--) {
      pillars[i].position.z += move;
      if (pillars[i].position.z > 12) { scene.remove(pillars[i]); pillars.splice(i, 1); }
    }

    streakTimer -= dt;
    if (speed > 40 && streakTimer <= 0) {
      streakTimer = 0.05 + Math.random() * 0.07;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 4 + Math.random() * 5), streakMat);
      s.position.set((Math.random() - 0.5) * 18, Math.random() * 7 + 0.5, -120);
      streaks.push(s);
      scene.add(s);
    }
    for (let i = streaks.length - 1; i >= 0; i--) {
      const st = streaks[i];
      st.position.z += move * 1.6;
      if (st.position.z > 12) { scene.remove(st); streaks.splice(i, 1); }
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      const prevZ = o.position.z;
      o.position.z += move;
      if (o.position.z > 12) { scene.remove(o); obstacles.splice(i, 1); continue; }
      if (!o.userData.passed && prevZ <= 1.0 && o.position.z >= -1.0) {
        o.userData.passed = true;
        const dx = Math.abs(o.position.x - ship.position.x);
        const hitTop = o.userData.type === 'wall' ? 3.2 : 0.76;
        const bottom = ship.position.y - 0.35;
        const crashing = dx < 1.85 && bottom < hitTop;
        if (crashing && invuln <= 0) {
          if (shieldReady && tier >= 2) {
            shieldReady = false;
            orbCountAtShieldEvent = orbCount;
            invuln = 1.3;
            applyShipTier();
            shieldBreakFx();
          } else {
            gameOver();
            break;
          }
        }
        if (!crashing) {
          if (o.userData.type === 'low' && dx < 1.85 && !grounded) {
            const g = addScore(40);
            ui.floatLabel('完美跳跃 +' + g, o.position, '#ffffff', 19);
            fovKick += 2.5;
            beep(1250, 0.14, 'sine', 0.12);
            burst(o.position, 0xffffff, 0.2, 0.4, 0.6, 22);
            bumpScore();
          } else if (dx >= 1.85 && dx < 3.6) {
            const g = addScore(30);
            ui.floatLabel('擦身而过 +' + g, o.position, '#aaffff', 16);
            fovKick += 1.5;
            whoosh();
          }
        }
      }
    }

    if (combo > 0) {
      comboTimer -= dt;
      ui.els.comboBar.style.width = Math.max(0, comboTimer / COMBO_WINDOW * 130) + 'px';
      if (comboTimer <= 0) {
        combo = 0;
        ui.els.comboBox.style.opacity = 0;
        beep(300, 0.2, 'sawtooth', 0.05);
      }
    }

    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      const prevZ = o.position.z;
      o.position.z += move;
      o.position.y = o.userData.baseY + Math.sin(t * 4 + o.userData.phase) * 0.15;
      o.rotation.y += dt * 3;
      if (o.userData.ring) {
        o.userData.ring.rotation.x = t * 2 + o.userData.phase;
        o.userData.ring.rotation.y = Math.sin(t * 3 + o.userData.phase) * 0.6;
      }
      if (o.position.z > 10) { scene.remove(o); orbs.splice(i, 1); continue; }
      if (tier >= 3 && o.position.z < 4 && o.position.z > -16) {
        const md = Math.hypot(o.position.x - ship.position.x, o.userData.baseY - ship.position.y);
        if (md < 4.5) {
          const pull = Math.min(1, dt * 7);
          o.position.x += (ship.position.x - o.position.x) * pull;
          o.userData.baseY += (ship.position.y - o.userData.baseY) * pull;
        }
      }
      if (prevZ <= 1.15 && o.position.z >= -1.15 && Math.abs(o.position.x - ship.position.x) < 1.15
        && Math.abs(o.position.y - ship.position.y) < 1.25) {
        scene.remove(o); orbs.splice(i, 1);
        orbCount++;
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        comboTimer = COMBO_WINDOW;
        const mult = ui.multOf(combo);
        const gainAmt = addScore(25 * mult);
        fovKick += 1.5;
        bumpScore();
        beep(700 + combo * 30, 0.09, 'square', 0.11);
        if (combo % 8 === 0) beep(1400 + combo * 15, 0.16, 'sawtooth', 0.06);
        burst(o.position, ui.comboColor(mult), 0.18 + mult * 0.03, 0.5, 0.55, 14 + mult * 7);
        ui.floatLabel('+' + gainAmt + (mult > 1 ? ' ×' + mult : ''), o.position, ui.comboColor(mult), 17 + mult * 3);
        ui.flash(ui.comboColor(mult), mult >= 3 ? 0.13 : 0.06);
        ui.els.comboText.textContent = '×' + mult + ' COMBO ' + combo;
        ui.els.comboBox.style.color = ui.comboColor(mult);
        ui.els.comboBox.style.opacity = 1;
        ui.els.comboBox.classList.remove('pop');
        void ui.els.comboBox.offsetWidth;
        ui.els.comboBox.classList.add('pop');
        if (TOASTS[combo]) ui.toast(TOASTS[combo], ui.comboColor(mult));
        if (tier >= 2 && !shieldReady && orbCount - orbCountAtShieldEvent >= ui.SHIELD_RECHARGE) {
          shieldReady = true;
          applyShipTier();
          ui.toast('护盾已充能', '#66ffff');
          beep(900, 0.12, 'triangle', 0.1);
          setTimeout(() => beep(1300, 0.15, 'triangle', 0.1), 90);
          spawnShockwave(ship.position, 0x00ffff, 0.6);
        }
        const nt = calcTier();
        if (nt > tier) {
          tier = nt;
          applyShipTier();
          if (tier >= 2 && !shieldReady) { shieldReady = true; orbCountAtShieldEvent = orbCount; }
          timeScale = 0.35;
          shakeTime = Math.max(shakeTime, 0.45);
          ui.flash('#ffffff', 0.35, 550);
          ui.toast(TIER_NAMES[tier], '#ffee00');
          spawnShockwave(ship.position, TIER_COLORS[tier], 1);
          setTimeout(() => { if (state === 'playing') spawnShockwave(ship.position, 0xffffff, 0.7); }, 130);
          for (let k = 0; k < 4; k++) {
            setTimeout(() => {
              burst(ship.position, k % 2 ? 0xffffff : TIER_COLORS[tier], 0.24, 0.9, 1.1, 50);
              if (k < 3) beep(520 + k * 260, 0.12, 'triangle', 0.13);
            }, k * 110);
          }
        }
        updateHUD();
      }
    }

    updateHUD();

    const bpm = 92 + speed * 1.15;
    beatTimer -= dt;
    if (beatTimer <= 0) {
      const dur = 60 / bpm;
      beatTimer = dur;
      beatGlow = 1;
      setMusicIntensity(Math.min(1, ((speed - 26) / 46) * 0.6 + tier * 0.1));
      playBeat(beatCount, dur);
      beatCount++;
    }
    setEnginePitch(46 + speed * 1.5 + combo * 2);

    if (speed - lastSpeedMark >= 10) {
      lastSpeedMark = speed;
      ui.toast('速度提升!', '#ff8822');
      fovKick += 3;
      beep(500, 0.35, 'sawtooth', 0.07);
      setTimeout(() => beep(800, 0.3, 'sawtooth', 0.06), 120);
    }

    if (combo > 0) {
      ui.els.vig.style.setProperty('--vc', ui.comboColor(ui.multOf(combo)));
      ui.els.vig.style.opacity = Math.min(0.85, 0.18 + ui.multOf(combo) * 0.07) * Math.max(0, comboTimer / COMBO_WINDOW);
    } else ui.els.vig.style.opacity = 0;

    camera.position.x = ship.position.x * 0.35;
    camera.lookAt(ship.position.x * 0.5, 1, -12);
    camRoll += (-latVel * 0.0016 - camRoll) * Math.min(1, dt * 8);
    camera.rotation.z += camRoll;

    fovKick *= Math.exp(-dt * 5);
    camera.fov = 70 + ((speed - 26) / 46) * 12 + fovKick;
    camera.updateProjectionMatrix();

    const flamesArr = ship.userData.flames;
    if (flamesArr) {
      const fs = (1 + tier * 0.35) * (0.85 + (speed / 72) * 0.5) + Math.sin(t * 24) * 0.07;
      for (const f of flamesArr) f.scale.set(1 + tier * 0.15, fs, 1 + tier * 0.15);
    }
    const aura = ship.userData.aura;
    if (aura && aura.visible) {
      aura.rotation.x = Math.PI / 2 + Math.sin(t * 1.8) * 0.45;
      aura.rotation.y = t * 2.2;
      aura.scale.setScalar(1 + Math.sin(t * 6) * 0.08 + tier * 0.05);
    }
    const sb = ship.userData.shieldBubble;
    if (sb && sb.visible) {
      const p = 1 + Math.sin(t * 4) * 0.04 + (invuln > 0 ? Math.sin(t * 30) * 0.12 : 0);
      sb.scale.setScalar(p);
      sb.material.opacity = invuln > 0 ? 0.35 : 0.16;
    }
  }

  const pdt = dt * timeScale;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= pdt;
    const arr = p.pts.geometry.attributes.position.array;
    for (let j = 0; j < p.vel.length; j++) {
      p.vel[j].y -= 20 * pdt;
      arr[j * 3] += p.vel[j].x * pdt;
      arr[j * 3 + 1] = Math.max(0.05, arr[j * 3 + 1] + p.vel[j].y * pdt);
      arr[j * 3 + 2] += p.vel[j].z * pdt;
    }
    p.pts.geometry.attributes.position.needsUpdate = true;
    p.pts.material.opacity = Math.max(0, p.life / p.maxLife);
    if (p.life <= 0) { scene.remove(p.pts); particles.splice(i, 1); }
  }

  beatGlow *= Math.exp(-dt * 6);
  grid.material.opacity = 0.72 + beatGlow * 0.28;
  if (bloomPass) bloomPass.strength = 1.1 + beatGlow * 0.35;
  if (state === 'over') timeScale += (1 - timeScale) * dt * 2;

  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.life -= pdt;
    const k = 1 - Math.max(0, s.life) / s.maxLife;
    s.m.scale.setScalar(0.3 + k * 9 * s.power);
    s.m.material.opacity = 0.9 * (1 - k);
    if (s.life <= 0) { scene.remove(s.m); s.m.material.dispose(); shockwaves.splice(i, 1); }
  }

  if (shakeTime > 0) {
    shakeTime -= dt;
    const s = shakeTime * 0.5;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y = 4.6 + (Math.random() - 0.5) * s;
  } else if (state !== 'playing') {
    camera.position.y = 4.6;
    camera.position.x *= 0.9;
  }

  if (paused && !showPending) { showPending = true; showPaused(); }
  if (!paused && showPending) { showPending = false; $('pauseScreen').classList.add('hidden'); }

  composer.render();
}

let showPending = false;
function bumpScore() {
  ui.els.scoreEl.classList.remove('bump');
  void ui.els.scoreEl.offsetWidth;
  ui.els.scoreEl.classList.add('bump');
}

animate();
