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
const CENTER_X = LANES[1];
const GRAVITY = -38, JUMP_V = 13;
const COMBO_WINDOW = 2.5;
const TRACK_HALF = 2.5;
const MIN_OUTER_SWAP_TIME = 0.32;
const STABILIZER_ACCEL = 340;
const STABILIZER_GAIN = 16;
const SWIPE_JUMP = 40;      // 地面起跳所需上滑距离 (优化为 40px, 兼顾 flick 灵敏度与防误跳)
const SWIPE_AIRJUMP = 30;   // 滞空二段跳: 阈值放宽, 否则 0.7 秒内滑不完
const TOASTS = { 5: '手感来了!', 10: '连击狂潮!', 15: '火力全开!', 20: '超神操作!', 30: '登峰造极!!' };
const TIER_COLORS = [0x00ffff, 0x66ff22, 0xffee00, 0xff8822, 0xff22cc, 0xb066ff];
const TIER_NAMES = ['', '引擎过载 · 鸭翼展开!', '能量护盾 · 装甲环绕!', '磁力场 · 磁叉伸展!', '超载核心 · 双倍得分!!', '量子跃迁 · 空中二段跳!!!'];
const MAX_TIER = TIER_COLORS.length - 1;
// 各形态的连续形变参数（下标 = 形态等级，帧间按 shipMorph 插值）
const MORPH = {
  noseLen:   [1, 1.05, 1.09, 1.14, 1.20, 1.32],
  hullBulk:  [1, 1.05, 1.14, 1.20, 1.26, 1.34],
  wingSpan:  [1, 1.03, 1.07, 1.12, 1.17, 1.24],
  wingSweep: [0.03, 0.11, 0.17, 0.23, 0.31, 0.42],
  wingRise:  [0, 0.05, 0.10, 0.14, 0.19, 0.27],
  tipFin:    [1, 1.15, 1.30, 1.50, 1.85, 2.70],
  flameLen:  [1, 1.30, 1.50, 1.75, 2.05, 2.50]
};

const MILESTONE_ZONES = [
  { dist: 0,    name: 'ZONE 1 · 赛博黎明', color: '#00ffff', bgHex: 0x05050f, fogHex: 0x05050f, archFreq: 0,
    wallEdgeHex: 0xff1155, wallCoreHex: 0xff0055, lowEdgeHex: 0xffaa00, lowCoreHex: 0xffaa00 },
  { dist: 400,  name: 'ZONE 2 · 霓虹拱门', color: '#ff00aa', bgHex: 0x0e051a, fogHex: 0x0e051a, archFreq: 110,
    wallEdgeHex: 0xff00aa, wallCoreHex: 0xff0088, lowEdgeHex: 0x00ffff, lowCoreHex: 0x00ddff },
  { dist: 1200, name: 'ZONE 3 · 跃迁信标', color: '#ffaa00', bgHex: 0x180812, fogHex: 0x180812, archFreq: 85,
    wallEdgeHex: 0xffaa00, wallCoreHex: 0xff8800, lowEdgeHex: 0xff00ff, lowCoreHex: 0xee00ee },
  { dist: 2500, name: 'ZONE 4 · 极光奇点', color: '#00ff88', bgHex: 0x041614, fogHex: 0x041614, archFreq: 65,
    wallEdgeHex: 0x00ff88, wallCoreHex: 0x00dd66, lowEdgeHex: 0xffee00, lowCoreHex: 0xffcc00 },
  { dist: 4000, name: 'ZONE 5 · 量子深空', color: '#b066ff', bgHex: 0x120428, fogHex: 0x120428, archFreq: 50,
    wallEdgeHex: 0xb066ff, wallCoreHex: 0x9944ff, lowEdgeHex: 0x00ffcc, lowCoreHex: 0x00ddbb }
];

let scene, camera, renderer, composer, clock, bloomPass, railMat;
let grid, ship, shipGlowMat, groundGlow, groundGlowMat;
let cyberSun, deepStars, warpStars, singularityHalo;
let obstacles = [], orbs = [], pillars = [], roadside = [], arches = [], warpBeacons = [], sideFibres = [], particles = [], streaks = [], shockwaves = [];
let lastArchDist = 0, currentZoneIndex = 0;
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
let shipMorph = 0, morphRoll = 0, shipBank = 0, airFlip = 0;
let airJumps = 0;
let latVel = 0;
let stabilizerEngaged = false, dualHoldTime = 0;
let lastGuidedLane = null, lastGuidedDist = -Infinity;
const activePointers = new Map();
const keys = { left: false, right: false };

function addScore(base) {
  const g = base * (tier >= 4 ? 2 : 1);
  score += g;
  return g;
}

function calcTier() {
  let t = 0;
  for (let i = 0; i < ui.TIER_THRESHOLDS.length; i++) if (orbCount >= ui.TIER_THRESHOLDS[i]) t = i + 1;
  return t;
}

function updateHUD() {
  ui.updateHUD({
    dist, bonus: score, speed, orbCount, maxCombo, tier,
    airJumpReady: tier >= MAX_TIER && (grounded || airJumps > 0),
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

  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  const pr = Math.min(devicePixelRatio, 2);
  const renderTarget = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, {
    type: THREE.HalfFloatType,
    samples: 0
  });
  composer = new EffectComposer(renderer, renderTarget);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.1, 0.6, 0.25);
  composer.addPass(bloomPass);
  window.composer = composer;
  window.bloomPass = bloomPass;

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

  const sideFibreGeo = new THREE.BoxGeometry(0.12, 0.08, 400);
  const sideFibreMat = new THREE.MeshBasicMaterial({
    color: 0x9944ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  sideFibres = [];
  for (const x of [-6.4, 6.4]) {
    const sf = new THREE.Mesh(sideFibreGeo, sideFibreMat);
    sf.position.set(x, 0.12, -150);
    sf.visible = false;
    scene.add(sf);
    sideFibres.push(sf);
  }

  const starGeo1 = new THREE.BufferGeometry();
  const pos1 = [];
  for (let i = 0; i < 1300; i++) {
    pos1.push((Math.random() - 0.5) * 320, Math.random() * 85 + 4, -Math.random() * 240 - 20);
  }
  starGeo1.setAttribute('position', new THREE.Float32BufferAttribute(pos1, 3));
  deepStars = new THREE.Points(starGeo1, new THREE.PointsMaterial({ color: 0x88ccff, size: 0.42, transparent: true, opacity: 0.75 }));
  scene.add(deepStars);

  const starGeo2 = new THREE.BufferGeometry();
  const pos2 = [];
  for (let i = 0; i < 700; i++) {
    pos2.push((Math.random() - 0.5) * 160, Math.random() * 65 + 3, -Math.random() * 200 - 10);
  }
  starGeo2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
  warpStars = new THREE.Points(starGeo2, new THREE.PointsMaterial({ color: 0xee77ff, size: 0.65, transparent: true, opacity: 0.6 }));
  scene.add(warpStars);

  cyberSun = makeCyberSun();
  scene.add(cyberSun);
  initMeteors();

  groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), groundGlowMat);
  groundGlow.name = 'groundGlow';
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.set(0, 0.02, 0.35);
  scene.add(groundGlow);

  buildShip();
}

function buildShip() {
  ship = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14142a, metalness: 0.9, roughness: 0.25, emissive: 0x000000 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x1c1c3a, metalness: 0.85, roughness: 0.3, emissive: 0x000000 });
  shipGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, fog: false });
  const flameMat = () => new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.62, fog: false });
  const p = { bodyMat, plateMat };

  // ── 主体: 机腹 + 机首(可拉长) + 座舱 ──
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.5), bodyMat);
  fuselage.position.set(0, 0, 0.35);
  ship.add(fuselage);
  p.fuselage = fuselage;

  const noseGroup = new THREE.Group();
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.7, 4), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  noseGroup.add(nose);
  const lance = new THREE.Mesh(new THREE.ConeGeometry(0.09, 1.6, 6), shipGlowMat); // T5 破风长矛
  lance.rotation.x = -Math.PI / 2;
  noseGroup.add(lance);
  ship.add(noseGroup);
  p.noseGroup = noseGroup;
  p.lance = lance;

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x66ffff, fog: false }));
  cockpit.position.set(0, 0.22, 0.1);
  ship.add(cockpit);
  p.cockpit = cockpit;

  // ── 主翼: 后掠 / 展开 / 上反, 并挂载副翼、引擎荚、磁力叉 ──
  p.wings = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(side * 0.24, -0.06, 0.05);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.09, 0.62), bodyMat);
    panel.position.x = side * 0.36;
    g.add(panel);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.66), trimMat);
    tip.position.set(side * 0.72, 0.02, 0);
    g.add(tip);

    const blade = new THREE.Group();                       // T4 副翼下张
    const bladePanel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 0.44), plateMat);
    bladePanel.position.x = side * 0.32;
    blade.add(bladePanel);
    const bladeEdge = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.025, 0.07), shipGlowMat);
    bladeEdge.position.set(side * 0.32, 0.05, -0.2);
    blade.add(bladeEdge);
    blade.position.set(side * 0.38, -0.03, 0.08);
    g.add(blade);

    const pod = new THREE.Group();                         // T3 外侧引擎荚
    const podShell = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.62, 10), bodyMat);
    podShell.rotation.x = Math.PI / 2;
    pod.add(podShell);
    const podLip = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.06, 10), shipGlowMat);
    podLip.rotation.x = Math.PI / 2;
    podLip.position.z = 0.3;
    pod.add(podLip);
    const podFlame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9, 8), flameMat());
    podFlame.rotation.x = -Math.PI / 2;
    podFlame.position.z = 0.82;
    pod.add(podFlame);
    g.add(pod);

    const prong = new THREE.Group();                       // T3 磁力叉
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.95), bodyMat);
    arm.position.z = -0.48;
    prong.add(arm);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 18), shipGlowMat);
    coil.position.z = -0.95;
    prong.add(coil);
    prong.position.set(side * 0.5, 0.02, -0.15);
    g.add(prong);

    ship.add(g);
    p.wings.push({ g, side, tip, blade, pod, podFlame, prong, coil });
  }

  // ── T1 鸭翼(从机身折出) + 过载散热鳍 ──
  p.canards = [];
  for (const side of [-1, 1]) {
    const c = new THREE.Group();
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.26), bodyMat);
    fin.position.x = side * 0.23;
    c.add(fin);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.06), shipGlowMat);
    edge.position.set(side * 0.23, 0.04, -0.1);
    c.add(edge);
    c.position.set(side * 0.16, 0.06, -0.52);
    ship.add(c);
    p.canards.push({ g: c, side });
  }

  p.vents = [];
  for (const side of [-1, 1]) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.46), plateMat);
    ship.add(v);
    p.vents.push({ m: v, side });
  }

  // ── T2 铰接式装甲板(上下左右四片, 沿机身张开) ──
  p.plates = [];
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -1 : 1, sy = i % 2 ? 1 : -1;
    const hinge = new THREE.Group();
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.86), plateMat);
    pl.position.x = sx * 0.2;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.88), shipGlowMat);
    edge.position.set(sx * 0.38, sy * 0.04, 0);
    pl.add(edge);
    hinge.add(pl);
    ship.add(hinge);
    p.plates.push({ g: hinge, sx, sy });
  }

  // ── T4 背鳍 + 外露反应堆 ──
  const spine = new THREE.Group();
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.66, 0.9), plateMat);
  dorsal.position.y = 0.33;
  spine.add(dorsal);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.86, 8), shipGlowMat);
  core.rotation.x = Math.PI / 2;
  core.position.y = 0.12;
  spine.add(core);
  spine.position.set(0, 0.04, 0.46);
  ship.add(spine);
  p.spine = spine;

  // ── T5 背部量子推进器 ──
  p.boosters = [];
  for (const side of [-1, 1]) {
    const b = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.52, 8), bodyMat);
    shell.rotation.x = Math.PI / 2;
    b.add(shell);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 8), shipGlowMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.z = 0.25;
    b.add(lip);
    const bf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.85, 8), flameMat());
    bf.rotation.x = -Math.PI / 2;
    bf.position.z = 0.68;
    b.add(bf);
    ship.add(b);
    p.boosters.push({ g: b, side, flame: bf });
  }

  // ── T5 量子光环 + 环绕晶体 ──
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.028, 8, 32), shipGlowMat);
  halo.rotation.x = Math.PI / 2;
  ship.add(halo);
  p.halo = halo;

  p.shards = [];
  for (let i = 0; i < 4; i++) {
    const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), shipGlowMat);
    ship.add(sh);
    p.shards.push({ m: sh, i });
  }

  // ── 主引擎 ──
  p.flames = [];
  for (const x of [-0.3, 0.3]) {
    const engine = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), shipGlowMat);
    engine.position.set(x, 0, 1.02);
    ship.add(engine);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1, 8), flameMat());
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0, 1.62);
    ship.add(flame);
    p.flames.push(flame);
  }

  const shieldBubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  shieldBubble.visible = false;
  ship.add(shieldBubble);
  p.shieldBubble = shieldBubble;

  const aura = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.04, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false })
  );
  aura.visible = false;
  ship.add(aura);
  p.aura = aura;
  p.trimMat = trimMat;

  ship.userData = p;
  ship.position.set(0, 0.95, 0);
  scene.add(ship);
  poseShip(0, 0);
}

const WHITE = new THREE.Color(0xffffff);
const BG_BASE = new THREE.Color(0x05050f);
const tmpColA = new THREE.Color(), tmpColB = new THREE.Color();
const currentWallEdgeCol = new THREE.Color(0xff1155);
const currentLowEdgeCol = new THREE.Color(0xffaa00);
const currentWallCoreCol = new THREE.Color(0xff0055);
const currentLowCoreCol = new THREE.Color(0xffaa00);
const targetWallEdgeCol = new THREE.Color(0xff1155);
const targetLowEdgeCol = new THREE.Color(0xffaa00);
const targetWallCoreCol = new THREE.Color(0xff0055);
const targetLowCoreCol = new THREE.Color(0xffaa00);

function curve(arr, m) {
  const i = Math.max(0, Math.min(arr.length - 1, Math.floor(m)));
  const j = Math.min(arr.length - 1, i + 1);
  return arr[i] + (arr[j] - arr[i]) * Math.max(0, Math.min(1, m - i));
}
// 模块在 at-1 → at 之间完成展开
function seg(m, at) { return Math.max(0, Math.min(1, m - at + 1)); }
function tierColorAt(m, out) {
  const i = Math.max(0, Math.min(MAX_TIER, Math.floor(m)));
  const j = Math.min(MAX_TIER, i + 1);
  return out.setHex(TIER_COLORS[i]).lerp(tmpColB.setHex(TIER_COLORS[j]), Math.max(0, Math.min(1, m - i)));
}

// 按连续形态值 m 摆放机体每个部件 —— 形态切换是真正的机械变形
function poseShip(m, t) {
  const p = ship.userData;
  const col = tierColorAt(m, tmpColA);
  shipGlowMat.color.copy(col);
  p.bodyMat.emissive.copy(col).multiplyScalar(0.07);
  p.plateMat.emissive.copy(col).multiplyScalar(0.1);
  p.trimMat.color.copy(col).lerp(WHITE, 0.18);
  p.cockpit.material.color.copy(col).lerp(WHITE, 0.45);

  const bulk = curve(MORPH.hullBulk, m);
  p.fuselage.scale.set(1 + (bulk - 1) * 0.8, bulk, 1 + (bulk - 1) * 0.35);
  p.noseGroup.scale.set(1 + (bulk - 1) * 0.6, 1 + (bulk - 1) * 0.6, curve(MORPH.noseLen, m));

  const lanceK = seg(m, 5);
  p.lance.visible = lanceK > 0.01;
  p.lance.scale.set(0.5 + 0.5 * lanceK, lanceK, 0.5 + 0.5 * lanceK);
  p.lance.position.z = -0.85 - 0.8 * lanceK;

  const span = curve(MORPH.wingSpan, m), sweep = curve(MORPH.wingSweep, m), rise = curve(MORPH.wingRise, m);
  const fin = curve(MORPH.tipFin, m);
  const flameLen = curve(MORPH.flameLen, m) * (0.8 + (speed / 72) * 0.45) + Math.sin(t * 24) * 0.07;
  const podK = seg(m, 3), bladeK = seg(m, 4);

  for (const w of p.wings) {
    w.g.rotation.y = -w.side * sweep;
    w.g.rotation.z = w.side * rise;
    w.g.scale.x = span;
    w.tip.scale.y = fin;
    w.tip.position.y = 0.02 + (fin - 1) * 0.055;

    w.pod.visible = podK > 0.01;
    w.pod.scale.setScalar(0.35 + 0.65 * podK);
    w.pod.position.set(w.side * (0.38 + 0.2 * podK), -0.12 + 0.12 * podK, 0.2);
    w.podFlame.material.color.copy(col);
    w.podFlame.scale.set(1, flameLen * 0.8, 1);

    w.prong.visible = podK > 0.01;
    w.prong.scale.set(0.4 + 0.6 * podK, 0.4 + 0.6 * podK, podK);
    w.coil.rotation.z = t * 4;

    w.blade.visible = bladeK > 0.01;
    w.blade.scale.setScalar(0.3 + 0.7 * bladeK);
    w.blade.rotation.z = -w.side * 0.95 * bladeK;
  }

  const canK = seg(m, 1);
  for (const c of p.canards) {
    c.g.visible = canK > 0.01;
    c.g.scale.setScalar(0.25 + 0.75 * canK);
    c.g.rotation.z = c.side * (-1.15 + 1.4 * canK);
    c.g.rotation.y = -c.side * (0.5 - 0.32 * canK);
  }
  for (const v of p.vents) {
    v.m.visible = canK > 0.01;
    v.m.scale.set(1, 0.15 + 0.85 * canK, 1);
    v.m.rotation.z = v.side * 0.45 * canK;
    v.m.position.set(v.side * 0.2, 0.1 + 0.09 * canK, 0.68);
  }

  const plateK = seg(m, 2);
  const breathe = Math.sin(t * (shieldReady ? 3.4 : 1.6)) * (shieldReady ? 0.16 : 0.07);
  for (const pl of p.plates) {
    pl.g.visible = plateK > 0.01;
    pl.g.scale.setScalar(0.4 + 0.6 * plateK);
    pl.g.rotation.z = pl.sx * pl.sy * plateK * (0.5 + breathe);
    pl.g.rotation.y = -pl.sx * 0.14 * plateK;
    pl.g.position.set(pl.sx * (0.22 + 0.1 * plateK), pl.sy * (0.13 + 0.16 * plateK), 0.45);
  }

  const spineK = seg(m, 4);
  p.spine.visible = spineK > 0.01;
  p.spine.scale.set(1, spineK, 0.5 + 0.5 * spineK);
  p.spine.position.y = 0.04 - 0.14 * (1 - spineK);

  p.halo.visible = lanceK > 0.01;
  p.halo.scale.setScalar(0.3 + 0.7 * lanceK);
  p.halo.rotation.z = t * 1.4;
  p.halo.rotation.x = Math.PI / 2 + Math.sin(t * 1.1) * 0.55;
  p.halo.position.set(0, 0.62 + 0.24 * lanceK + Math.sin(t * 2.2) * 0.03, 0.3);
  for (const sh of p.shards) {
    sh.m.visible = lanceK > 0.01;
    const a = t * 1.7 + sh.i * Math.PI / 2;
    const r = 0.75 + 0.45 * lanceK;
    sh.m.position.set(Math.cos(a) * r, 0.3 + Math.sin(t * 2.4 + sh.i) * 0.22, 0.3 + Math.sin(a) * r * 0.7);
    sh.m.rotation.set(t * 2, t * 2.6, 0);
    sh.m.scale.setScalar(lanceK);
  }

  for (const b of p.boosters) {
    b.g.visible = lanceK > 0.01;
    b.g.scale.setScalar(0.3 + 0.7 * lanceK);
    b.g.position.set(b.side * (0.3 + 0.16 * lanceK), 0.18 + 0.18 * lanceK, 0.75);
    b.g.rotation.z = -b.side * 0.18 * lanceK;
    b.flame.material.color.copy(col);
    b.flame.scale.set(1, flameLen * 0.7, 1);
  }

  for (const f of p.flames) {
    f.material.color.copy(col);
    f.scale.set(1 + m * 0.05, flameLen, 1 + m * 0.05);
  }

  const aura = p.aura;
  aura.visible = plateK > 0.01;
  aura.material.color.copy(col);
  aura.rotation.x = Math.PI / 2;
  aura.rotation.z = t * 1.2;
  aura.position.set(0, -0.06, 0.25);
  aura.scale.setScalar((0.5 + 0.5 * plateK) * (1 + Math.sin(t * 5) * 0.05 + m * 0.02));

  const sb = p.shieldBubble;
  if (sb.visible) {
    sb.material.color.copy(col);
    sb.scale.setScalar(1 + Math.sin(t * 4) * 0.04 + (invuln > 0 ? Math.sin(t * 30) * 0.12 : 0));
    sb.material.opacity = invuln > 0 ? 0.35 : 0.16;
  }

  if (grid) {
    grid.material.color.copy(col).multiplyScalar(0.5);
    railMat.color.copy(col).multiplyScalar(0.9);
    scene.background.copy(BG_BASE).lerp(col, 0.05);
    if (groundGlowMat) groundGlowMat.color.copy(col);
  }
}

function updateShipMorph(dt, t) {
  shipMorph += (tier - shipMorph) * Math.min(1, dt * 3.2);
  if (Math.abs(tier - shipMorph) < 0.002) shipMorph = tier;
  poseShip(shipMorph, t);
}

function updateGroundGlow() {
  if (!groundGlow) return;
  groundGlow.position.x = ship.position.x;
  groundGlow.position.z = ship.position.z + 0.35;
  const h = Math.max(0, ship.position.y - 0.95);
  const scaleFactor = 1 + h * 0.4;
  groundGlow.scale.set(scaleFactor, scaleFactor, 1);
  groundGlowMat.opacity = Math.max(0.06, 0.45 - h * 0.16);
  groundGlow.visible = ship.visible && state !== 'over';
}

// 障碍物单例几何体与材质（消除重复分配与内存泄漏，纯正交赛博边框）
const wallBoxGeo = new THREE.BoxGeometry(2.4, 3.2, 0.5);
const wallEdgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.44, 3.24, 0.52));
const lowBoxGeo = new THREE.BoxGeometry(2.4, 0.75, 0.5);
const lowEdgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.44, 0.77, 0.52));
const wallScanGeo = new THREE.BoxGeometry(2.38, 0.08, 0.54);
const lowScanGeo = new THREE.BoxGeometry(2.38, 0.06, 0.54);
const wallPylonGeo = new THREE.BoxGeometry(0.06, 3.2, 0.54);
const lowGuideGeo = new THREE.BoxGeometry(2.4, 0.04, 0.52);

const wallBodyMat = new THREE.MeshBasicMaterial({ color: 0x160610, transparent: true, opacity: 0.92, depthWrite: true });
const lowBodyMat = new THREE.MeshBasicMaterial({ color: 0x160d04, transparent: true, opacity: 0.92, depthWrite: true });
const wallEdgeMat = new THREE.LineBasicMaterial({ color: 0xff1155 });
const lowEdgeMat = new THREE.LineBasicMaterial({ color: 0xffaa00 });
const wallCoreMat = new THREE.MeshBasicMaterial({ color: 0xff0055, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
const lowCoreMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

// 能量球共享单例组件（白炽高能核心 + 青金正交双轴陀螺环，杜绝几何体重复实例化）
const orbCoreGeo = new THREE.SphereGeometry(0.24, 16, 16);
const orbCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
const orbInnerRingGeo = new THREE.TorusGeometry(0.46, 0.035, 8, 24);
const orbRingMat1 = new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false });
const orbOuterRingGeo = new THREE.TorusGeometry(0.68, 0.026, 8, 24);
const orbRingMat2 = new THREE.MeshBasicMaterial({ color: 0xffd700, fog: false });

const pillarGeo = new THREE.BoxGeometry(0.3, 5, 0.3);
const streakGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
const pillarMat = new THREE.MeshBasicMaterial({ color: 0x2244ff });
const streakMat = new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.35, fog: false });
function makeCyberSun() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffee33');
  grad.addColorStop(0.5, '#ff2277');
  grad.addColorStop(1.0, '#7700aa');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(128, 128, 120, 0, Math.PI * 2);
  g.fill();

  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) {
    const y = 138 + i * 12;
    const h = 2 + i * 1.5;
    g.fillRect(0, y, 256, h);
  }
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    fog: false,
    depthWrite: false
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat);
  plane.position.set(0, 22, -260);
  plane.name = 'cyberSun';

  const haloGeo = new THREE.RingGeometry(42, 60, 48);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x00ffaa,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  singularityHalo = new THREE.Mesh(haloGeo, haloMat);
  singularityHalo.position.set(0, 0, -1);
  singularityHalo.name = 'singularityHalo';
  singularityHalo.visible = false;
  plane.add(singularityHalo);

  return plane;
}

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

function makeGroundGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.__isPureWhiteGradient = true;
  return tex;
}
groundGlowMat = new THREE.MeshBasicMaterial({
  map: makeGroundGlowTexture(),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.45
});

function makeWall(lane, z) {
  const g = new THREE.Group();
  const w = new THREE.Mesh(wallBoxGeo, wallBodyMat);
  w.position.y = 1.6;
  const e = new THREE.LineSegments(wallEdgesGeo, wallEdgeMat);
  e.position.y = 1.6;
  const scan = new THREE.Mesh(wallScanGeo, wallCoreMat);
  scan.position.y = 1.6;
  const leftPylon = new THREE.Mesh(wallPylonGeo, wallCoreMat);
  leftPylon.position.set(-1.21, 1.6, 0);
  const rightPylon = new THREE.Mesh(wallPylonGeo, wallCoreMat);
  rightPylon.position.set(1.21, 1.6, 0);
  g.add(w, e, scan, leftPylon, rightPylon);
  g.position.set(LANES[lane], 0, z);
  g.userData = { type: 'wall', lane, scan, leftPylon, rightPylon, phase: Math.random() * Math.PI * 2 };
  return g;
}

function makeLow(lane, z) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(lowBoxGeo, lowBodyMat);
  b.position.y = 0.38;
  const e = new THREE.LineSegments(lowEdgesGeo, lowEdgeMat);
  e.position.y = 0.38;
  const scan = new THREE.Mesh(lowScanGeo, lowCoreMat);
  scan.position.y = 0.38;
  const guide = new THREE.Mesh(lowGuideGeo, lowCoreMat);
  guide.position.set(0, 0.74, 0);
  g.add(b, e, scan, guide);
  g.position.set(LANES[lane], 0, z);
  g.userData = { type: 'low', lane, scan, guide, phase: Math.random() * Math.PI * 2 };
  return g;
}

function makeOrb(x, y, z) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(orbCoreGeo, orbCoreMat);
  const halo = new THREE.Sprite(orbHaloMat);
  halo.scale.set(1.9, 1.9, 1);
  core.add(halo);

  const innerRing = new THREE.Mesh(orbInnerRingGeo, orbRingMat1);
  innerRing.rotation.x = Math.PI / 2;
  const outerRing = new THREE.Mesh(orbOuterRingGeo, orbRingMat2);
  outerRing.rotation.y = Math.PI / 4;

  g.add(core, innerRing, outerRing);
  g.userData = {
    baseY: y,
    phase: Math.random() * Math.PI * 2,
    core,
    innerRing,
    outerRing
  };
  g.position.set(x, y, z);
  return g;
}

function makePillar(z) {
  const p = new THREE.Mesh(pillarGeo, pillarMat);
  p.position.set(Math.random() < 0.5 ? -7.5 : 7.5, 2.5, z);
  return p;
}

const towerGeo1 = new THREE.BoxGeometry(3.6, 26, 3.6);
const towerCapGeo = new THREE.BoxGeometry(4.0, 0.6, 4.0);
const towerBeaconGeo = new THREE.CylinderGeometry(0.1, 0.35, 5, 8);
const towerBodyMat = new THREE.MeshBasicMaterial({ color: 0x070716 });
const towerCapMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false });
const towerSpireMat = new THREE.MeshBasicMaterial({ color: 0xff0088, fog: false });

function makeRoadsideStructure(side, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(towerGeo1, towerBodyMat);
  body.position.y = 13;
  const cap = new THREE.Mesh(towerCapGeo, towerCapMat);
  cap.position.y = 26;
  const beacon = new THREE.Mesh(towerBeaconGeo, towerSpireMat);
  beacon.position.y = 28.5;
  g.add(body, cap, beacon);
  const xDist = side * (14 + Math.random() * 8);
  g.position.set(xDist, 0, z);
  g.userData = { type: 'roadsideStructure' };
  return g;
}

const relayBaseGeo = new THREE.CylinderGeometry(2.2, 3.4, 5, 6);
const relayPillarGeo = new THREE.CylinderGeometry(0.8, 1.2, 14, 8);
const relayRingGeo = new THREE.TorusGeometry(2.8, 0.16, 8, 24);
const relayCoreGeo = new THREE.OctahedronGeometry(0.9);

function makeRoadsideRelay(side, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(relayBaseGeo, towerBodyMat);
  base.position.y = 2.5;
  const pillar = new THREE.Mesh(relayPillarGeo, towerBodyMat);
  pillar.position.y = 12;
  const ring = new THREE.Mesh(relayRingGeo, towerCapMat);
  ring.position.y = 19;
  const core = new THREE.Mesh(relayCoreGeo, towerSpireMat);
  core.position.y = 19;
  g.add(base, pillar, ring, core);
  const xDist = side * (15 + Math.random() * 7);
  g.position.set(xDist, 0, z);
  g.userData = { type: 'roadsideRelay', ring, core, phase: Math.random() * Math.PI * 2 };
  return g;
}

const meteorGeo = new THREE.BoxGeometry(0.18, 0.18, 9.0);
const meteorMat = new THREE.MeshBasicMaterial({ color: 0xaaffff, transparent: true, opacity: 0, fog: false });
const meteors = [];
function initMeteors() {
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(meteorGeo, meteorMat.clone());
    m.visible = false;
    scene.add(m);
    meteors.push({
      mesh: m,
      active: false,
      timer: 1.2 + i * 2.4,
      progress: 0,
      startX: 0, startY: 0, startZ: 0,
      endX: 0, endY: 0, endZ: 0
    });
  }
}

function updateMeteors(dt) {
  for (const met of meteors) {
    if (!met.active) {
      met.timer -= dt;
      if (met.timer <= 0) {
        met.active = true;
        met.progress = 0;
        const side = Math.random() < 0.5 ? -1 : 1;
        met.startX = side * (32 + Math.random() * 38);
        met.startY = 22 + Math.random() * 14;
        met.startZ = -210 - Math.random() * 40;
        met.endX = met.startX * 0.15;
        met.endY = 12 + Math.random() * 6;
        met.endZ = met.startZ + 70 + Math.random() * 30;
        met.mesh.position.set(met.startX, met.startY, met.startZ);
        met.mesh.lookAt(met.endX, met.endY, met.endZ);
        met.mesh.visible = true;
      }
    } else {
      met.progress += dt * 1.8;
      if (met.progress >= 1) {
        met.active = false;
        met.mesh.visible = false;
        met.timer = 2.0 + Math.random() * 3.5;
      } else {
        const k = met.progress;
        met.mesh.position.set(
          met.startX + (met.endX - met.startX) * k,
          met.startY + (met.endY - met.startY) * k,
          met.startZ + (met.endZ - met.startZ) * k
        );
        const alpha = Math.sin(k * Math.PI);
        met.mesh.material.opacity = alpha * 0.85;
      }
    }
  }
}

const archBeamGeo = new THREE.BoxGeometry(12.4, 0.45, 0.7);
const archPillarGeo = new THREE.BoxGeometry(0.55, 5.6, 0.7);
const archNeonGeo = new THREE.BoxGeometry(12.2, 0.12, 0.76);
const archFrameMat = new THREE.MeshBasicMaterial({ color: 0x0b0b1e });
const archNeonMat = new THREE.MeshBasicMaterial({ color: 0xff00aa, fog: false });

function makeOverheadArch(z) {
  const g = new THREE.Group();
  const leftPillar = new THREE.Mesh(archPillarGeo, archFrameMat);
  leftPillar.position.set(-5.8, 2.8, 0);
  const rightPillar = new THREE.Mesh(archPillarGeo, archFrameMat);
  rightPillar.position.set(5.8, 2.8, 0);
  const topBeam = new THREE.Mesh(archBeamGeo, archFrameMat);
  topBeam.position.set(0, 5.6, 0);
  const neonBar = new THREE.Mesh(archNeonGeo, archNeonMat);
  neonBar.position.set(0, 5.4, 0);

  g.add(leftPillar, rightPillar, topBeam, neonBar);
  g.position.set(0, 0, z);
  g.userData = { type: 'overheadArch' };
  return g;
}

const beaconPillarGeo = new THREE.CylinderGeometry(0.35, 0.9, 70, 8);
beaconPillarGeo.translate(0, 35, 0);
const beaconBaseGeo = new THREE.BoxGeometry(3.2, 2.0, 3.2);
const beaconCoreGeo = new THREE.SphereGeometry(1.2, 12, 12);
const beaconBeamMat = new THREE.MeshBasicMaterial({
  color: 0xffaa00,
  transparent: true,
  opacity: 0.45,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false
});
const beaconRingMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, fog: false });

function makeWarpBeacon(side, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(beaconBaseGeo, towerBodyMat);
  base.position.y = 1.0;
  const core = new THREE.Mesh(beaconCoreGeo, beaconRingMat);
  core.position.y = 2.2;
  const beam = new THREE.Mesh(beaconPillarGeo, beaconBeamMat);
  beam.position.y = 0;
  g.add(base, core, beam);
  const xDist = side * (16 + Math.random() * 6);
  g.position.set(xDist, 0, z);
  g.userData = { type: 'warpBeacon', core, beam, phase: Math.random() * Math.PI * 2 };
  return g;
}

function buildPatternPlan(freeLane) {
  const plan = [];
  for (let lane = 0; lane < 3; lane++) {
    if (lane === freeLane) continue;
    if (Math.random() < 0.75) {
      plan.push({ lane, type: Math.random() < 0.4 ? 'low' : 'wall' });
    } else if (Math.random() < 0.5) {
      plan.push({ lane, type: 'orb' });
    }
  }
  return plan;
}

function isGuidedPattern(plan) {
  return plan.filter(item => item.type === 'wall' || item.type === 'low').length === 2;
}

function spawnPattern() {
  if (Math.random() < 0.18) {
    const lane = (Math.random() * 3) | 0;
    for (let i = 0; i < 5; i++) {
      const o = makeOrb(LANES[lane], 1.2, -140 - i * 2);
      orbs.push(o);
      scene.add(o);
    }
    return;
  }
  let freeLane = (Math.random() * 3) | 0;
  let plan = buildPatternPlan(freeLane);
  let guided = isGuidedPattern(plan);
  const outerSwap = lastGuidedLane !== null && Math.abs(freeLane - lastGuidedLane) === 2;
  const transitionTime = (dist - lastGuidedDist) / Math.max(speed, 1);
  if (guided && outerSwap && transitionTime < MIN_OUTER_SWAP_TIME) {
    freeLane = 1;
    plan = buildPatternPlan(freeLane);
    guided = isGuidedPattern(plan);
  }
  for (const item of plan) {
    if (item.type === 'wall' || item.type === 'low') {
      const obj = item.type === 'low' ? makeLow(item.lane, -140) : makeWall(item.lane, -140);
      obstacles.push(obj);
      scene.add(obj);
    } else {
      const o = makeOrb(LANES[item.lane], 1.2, -140);
      orbs.push(o);
      scene.add(o);
    }
  }
  if (guided) {
    lastGuidedLane = freeLane;
    lastGuidedDist = dist;
  }
  if (Math.random() < 0.6) {
    for (let i = 1; i <= 3 + ((Math.random() * 3) | 0); i++) {
      const o = makeOrb(LANES[freeLane], 1.2, -140 - i * 2);
      orbs.push(o);
      scene.add(o);
    }
  }
}

const PARTICLE_POOL_SIZE = 24;
const MAX_PARTICLES_PER_BURST = 240;
const particlePool = [];

function initParticlePool() {
  if (particlePool.length > 0) return;
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(MAX_PARTICLES_PER_BURST * 3);
    const posAttr = new THREE.BufferAttribute(posArr, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, fog: false });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    pts.frustumCulled = false;
    scene.add(pts);

    const vel = [];
    for (let j = 0; j < MAX_PARTICLES_PER_BURST; j++) {
      vel.push(new THREE.Vector3());
    }

    particlePool.push({
      pts,
      geo,
      posArr,
      posAttr,
      mat,
      vel,
      count: 0,
      life: 0,
      maxLife: 1,
      active: false
    });
  }
}

function burst(pos, color, size, maxLife, power, count = 140) {
  if (particlePool.length === 0) initParticlePool();
  let item = particlePool.find(p => !p.active);
  if (!item) {
    let minLife = Infinity;
    for (const p of particlePool) {
      if (p.life < minLife) { minLife = p.life; item = p; }
    }
  }
  if (!item) return;

  const actualCount = Math.min(count, MAX_PARTICLES_PER_BURST);
  item.count = actualCount;
  item.life = maxLife;
  item.maxLife = maxLife;
  item.mat.color.set(color);
  item.mat.size = size;
  item.mat.opacity = 1;

  const posArr = item.posArr;
  for (let i = 0; i < actualCount; i++) {
    posArr[i * 3] = pos.x;
    posArr[i * 3 + 1] = pos.y;
    posArr[i * 3 + 2] = pos.z;
    item.vel[i].set(
      (Math.random() - 0.5) * 16 * power,
      Math.random() * 12 * power + 2,
      (Math.random() - 0.5) * 16 * power
    );
  }
  item.geo.setDrawRange(0, actualCount);
  item.posAttr.needsUpdate = true;
  item.pts.visible = true;
  item.active = true;
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
  ship.userData.shieldBubble.visible = tier >= 2 && shieldReady;
}

function resetGame() {
  for (const o of [...obstacles, ...orbs, ...pillars, ...streaks, ...roadside, ...arches, ...warpBeacons]) scene.remove(o);
  for (const p of particlePool) {
    p.active = false;
    p.pts.visible = false;
  }
  obstacles = []; orbs = []; pillars = []; roadside = []; arches = []; warpBeacons = []; particles = []; streaks = [];
  if (singularityHalo) {
    singularityHalo.material.opacity = 0;
    singularityHalo.visible = false;
  }
  for (const sf of sideFibres) {
    sf.visible = false;
    sf.material.opacity = 0;
  }
  lastArchDist = 0; currentZoneIndex = 0;
  BG_BASE.setHex(MILESTONE_ZONES[0].bgHex);
  if (scene && scene.fog) scene.fog.color.setHex(MILESTONE_ZONES[0].fogHex);
  currentWallEdgeCol.setHex(MILESTONE_ZONES[0].wallEdgeHex);
  currentLowEdgeCol.setHex(MILESTONE_ZONES[0].lowEdgeHex);
  currentWallCoreCol.setHex(MILESTONE_ZONES[0].wallCoreHex);
  currentLowCoreCol.setHex(MILESTONE_ZONES[0].lowCoreHex);
  wallCoreMat.color.setHex(MILESTONE_ZONES[0].wallCoreHex);
  lowCoreMat.color.setHex(MILESTONE_ZONES[0].lowCoreHex);
  wallEdgeMat.color.setHex(MILESTONE_ZONES[0].wallEdgeHex);
  lowEdgeMat.color.setHex(MILESTONE_ZONES[0].lowEdgeHex);
  vy = 0; grounded = true;
  keys.left = keys.right = false;
  speed = 26; maxSpeed = 26; dist = 0; spawnDist = 0; orbCount = 0; elapsed = 0; shakeTime = 0;
  combo = 0; comboTimer = 0; score = 0; streakTimer = 0; fovKick = 0;
  beatTimer = 0; beatGlow = 0; timeScale = 1; lastSpeedMark = 26; camRoll = 0;
  shieldReady = false; invuln = 0; orbCountAtShieldEvent = 0;
  maxCombo = 0;
  latVel = 0; stabilizerEngaged = false; dualHoldTime = 0; activePointers.clear();
  lastGuidedLane = null; lastGuidedDist = -Infinity;
  for (const s of shockwaves) scene.remove(s.m);
  shockwaves = [];
  for (const met of meteors) {
    met.active = false;
    met.mesh.visible = false;
    met.timer = 1.2 + Math.random() * 2;
  }
  ui.els.vig.style.opacity = 0;
  ui.els.comboBox.style.opacity = 0;
  tier = 0;
  airJumps = 0; airFlip = 0; morphRoll = 0; shipBank = 0; shipMorph = 0;
  applyShipTier();
  poseShip(0, 0);
  camera.fov = 70;
  camera.updateProjectionMatrix();
  ship.position.set(0, 0.95, 0);
  ship.rotation.set(0, 0, 0);
  ship.visible = true;
  if (groundGlow) {
    groundGlow.visible = true;
    groundGlow.position.set(0, 0.02, 0.35);
    groundGlow.scale.set(1, 1, 1);
    if (groundGlowMat) groundGlowMat.opacity = 0.45;
  }
  updateHUD();
}

function updateFsBtn() {
  const btn = $('fsBtn');
  if (btn) btn.style.display = (state === 'playing' && !paused) ? 'none' : 'flex';
}

function startGame() {
  ensureAudio();
  if (overTimerId) { clearTimeout(overTimerId); overTimerId = null; }
  ui.resetRunSummary();
  resetGame();
  beatCount = 0;
  startEngine();
  state = 'playing'; paused = false;
  updateFsBtn();
  $('startScreen').classList.add('hidden');
  $('overScreen').classList.add('hidden');
}

function gameOver() {
  state = 'over';
  updateFsBtn();
  crashSound();
  explode(ship.position);
  ship.visible = false;
  if (groundGlow) groundGlow.visible = false;
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
  if (state !== 'playing' || paused) return;
  if (grounded) {
    vy = JUMP_V;
    grounded = false;
    airJumps = tier >= MAX_TIER ? 1 : 0;
    ship.scale.set(0.8, 1.35, 0.8);
    beep(500, 0.15, 'sine', 0.1);
    setTimeout(() => beep(750, 0.12, 'sine', 0.08), 70);
  } else if (airJumps > 0) {
    // T5 量子跃迁: 空中二段跳
    airJumps--;
    vy = JUMP_V * 0.88;
    airFlip = Math.PI * 2;
    ship.scale.set(1.22, 0.74, 1.22);
    const at = new THREE.Vector3(ship.position.x, ship.position.y - 0.35, ship.position.z);
    spawnShockwave(at, TIER_COLORS[MAX_TIER], 0.5);
    burst(at, TIER_COLORS[MAX_TIER], 0.2, 0.45, 0.8, 28);
    ui.floatLabel('量子跃迁', ship.position, '#c08cff', 16);
    beep(760, 0.12, 'triangle', 0.11);
    setTimeout(() => beep(1180, 0.14, 'triangle', 0.09), 60);
    updateHUD();
  }
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

function hasOtherActiveSteering(currId = null) {
  if (keys.left || keys.right) return true;
  for (const [id, p] of activePointers.entries()) {
    if (id !== currId && !p.isJump) return true;
  }
  return false;
}

function clearInputState() {
  activePointers.clear();
  dualHoldTime = 0;
  stabilizerEngaged = false;
  keys.left = false;
  keys.right = false;
}

addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  if (paused && state === 'playing') {
    paused = false;
    $('pauseScreen').classList.add('hidden');
    updateFsBtn();
  }
  if (e.pointerType !== 'touch' || state !== 'playing' || paused) return;
  activePointers.set(e.pointerId, {
    x: e.clientX,
    startX: e.clientX,
    baseY: e.clientY,
    isJump: false,
    jumpTriggered: false,
    origShipX: ship ? ship.position.x : 0
  });
});
addEventListener('pointermove', e => {
  const p = activePointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  const dy = p.baseY - e.clientY;
  const dx = Math.abs(e.clientX - p.startX);
  if (dy > 12 && dy > dx * 0.8) {
    if (!p.isJump && !hasOtherActiveSteering(e.pointerId) && p.origShipX !== undefined) {
      ship.position.x = p.origShipX;
      latVel = 0;
    }
    p.isJump = true;
  }
  const need = grounded ? SWIPE_JUMP : SWIPE_AIRJUMP;
  if (e.clientY > p.baseY) {
    p.baseY = e.clientY;
  } else if (dx > dy * 1.2) {
    if (!p.jumpTriggered && dx >= 16) {
      p.isJump = false;
      p.origShipX = ship ? ship.position.x : 0;
    } else {
      p.origShipX = undefined;
    }
    p.baseY = e.clientY;
    p.startX = e.clientX;
  } else if (dy >= need && dy > dx * 1.1 && (grounded || airJumps > 0)) {
    if (!p.isJump && !hasOtherActiveSteering(e.pointerId) && p.origShipX !== undefined) {
      ship.position.x = p.origShipX;
    }
    p.isJump = true;
    p.jumpTriggered = true;
    if (!hasOtherActiveSteering(e.pointerId)) latVel = 0;
    jump();
    p.baseY = e.clientY;
    p.startX = e.clientX;
    p.origShipX = undefined;
  }
});
const releasePointer = e => {
  const p = activePointers.get(e.pointerId);
  if (p) {
    const dy = p.baseY - e.clientY;
    const dx = Math.abs(e.clientX - p.startX);
    const need = grounded ? SWIPE_JUMP : SWIPE_AIRJUMP;
    if (dy >= need && dy > dx * 1.1 && (grounded || airJumps > 0)) {
      if (!p.isJump && !hasOtherActiveSteering(e.pointerId) && p.origShipX !== undefined) {
        ship.position.x = p.origShipX;
      }
      p.isJump = true;
      p.jumpTriggered = true;
      jump();
      p.origShipX = undefined;
    }
    if (p.isJump && !hasOtherActiveSteering(e.pointerId)) latVel = 0;
    activePointers.delete(e.pointerId);
  }
};
addEventListener('pointerup', releasePointer);
addEventListener('pointercancel', releasePointer);

$('startBtn').onclick = startGame;
$('restartBtn').onclick = startGame;

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') {
    paused = true;
    updateFsBtn();
    clearInputState();
  }
});
window.addEventListener('blur', () => {
  if (state === 'playing') {
    paused = true;
    updateFsBtn();
    clearInputState();
  }
});
window.addEventListener('pagehide', clearInputState);
addEventListener('keydown', () => {
  if (paused && state === 'playing') { paused = false; $('pauseScreen').classList.add('hidden'); updateFsBtn(); }
});

function showPaused() {
  $('pauseScreen').classList.remove('hidden');
  updateFsBtn();
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
  if (warpStars) {
    warpStars.position.z = (warpStars.position.z + (state === 'playing' ? speed : 8) * dt * 0.25) % 80;
  }
  if (deepStars) {
    deepStars.material.opacity = 0.68 + Math.sin(t * 1.5) * 0.12;
  }
  updateMeteors(dt);

  if (singularityHalo) {
    singularityHalo.rotation.z += dt * 0.35;
    const targetHaloOp = currentZoneIndex >= 3 ? 0.62 : 0;
    singularityHalo.material.opacity += (targetHaloOp - singularityHalo.material.opacity) * Math.min(1, dt * 2.5);
    singularityHalo.visible = singularityHalo.material.opacity > 0.01;
  }
  const isZone5 = currentZoneIndex >= 4;
  for (const sf of sideFibres) {
    sf.visible = isZone5;
    if (isZone5) {
      sf.material.opacity = 0.5 + Math.sin(t * 14 + sf.position.x) * 0.35;
    }
  }

  morphRoll *= Math.exp(-dt * 3.4);
  if (Math.abs(morphRoll) < 0.004) morphRoll = 0;
  airFlip *= Math.exp(-dt * 4.6);
  if (Math.abs(airFlip) < 0.004) airFlip = 0;
  updateShipMorph(dt, t);

  if (state === 'menu') {
    ship.position.x = Math.sin(t) * 2.5;
    shipBank = -Math.cos(t) * 0.35;
    ship.rotation.set(0, 0, shipBank);
    ship.position.y = 0.95 + Math.sin(t * 3) * 0.1;
    camera.lookAt(ship.position.x * 0.4, 1, -12);
    if (cyberSun) cyberSun.position.x = ship.position.x * 2.31;
    updateGroundGlow();
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
    if ((dist % 24) < move) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const relayChance = currentZoneIndex === 0 ? 0 : (currentZoneIndex === 1 ? 0.35 : 0.55);
      const rs = Math.random() < relayChance ? makeRoadsideRelay(side, -150) : makeRoadsideStructure(side, -150);
      roadside.push(rs);
      scene.add(rs);
    }
    if (currentZoneIndex >= 2 && (dist % 45) < move) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const wb = makeWarpBeacon(side, -150);
      warpBeacons.push(wb);
      scene.add(wb);
    }

    while (currentZoneIndex + 1 < MILESTONE_ZONES.length && dist >= MILESTONE_ZONES[currentZoneIndex + 1].dist) {
      currentZoneIndex++;
      const zInfo = MILESTONE_ZONES[currentZoneIndex];
      ui.milestoneBanner(zInfo.name, `已行驶 ${Math.floor(dist)} M`, zInfo.color);
      beep(880, 0.16, 'sine', 0.12);
      setTimeout(() => beep(1320, 0.22, 'sine', 0.12), 110);
    }

    const curZone = MILESTONE_ZONES[currentZoneIndex];
    if (curZone.archFreq > 0 && (dist - lastArchDist >= curZone.archFreq)) {
      lastArchDist = dist;
      const arch = makeOverheadArch(-150);
      arches.push(arch);
      scene.add(arch);
    }

    let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let stabilizing = false;
    if (activePointers.size) {
      let s = 0, hasL = false, hasR = false;
      for (const p of activePointers.values()) {
        if (p.isJump) continue;
        const side = p.x < innerWidth / 2 ? -1 : 1;
        s += side;
        if (side < 0) hasL = true; else hasR = true;
      }
      if (hasL && hasR) {
        dualHoldTime += dt;
        if (dualHoldTime >= 0.08) {
          stabilizing = true;
          dir = 0;
          if (!stabilizerEngaged) {
            stabilizerEngaged = true;
            latVel *= 0.25;
            ui.floatLabel('中线锁定', ship.position, '#66ffff', 14);
            beep(710, 0.07, 'triangle', 0.065);
          }
        }
      } else {
        dualHoldTime = 0;
        stabilizerEngaged = false;
        dir += s;
      }
    } else {
      dualHoldTime = 0;
      stabilizerEngaged = false;
    }
    dir = Math.max(-1, Math.min(1, dir));
    const maxV = (5 + speed * 0.27) * (1 + tier * 0.08);
    if (stabilizing) {
      const error = CENTER_X - ship.position.x;
      const targetVel = Math.max(-maxV, Math.min(maxV, error * STABILIZER_GAIN));
      const step = STABILIZER_ACCEL * dt;
      latVel += Math.max(-step, Math.min(step, targetVel - latVel));
      if (Math.abs(error) < 0.012 && Math.abs(latVel) < 0.45) {
        ship.position.x = CENTER_X;
        latVel = 0;
      }
    } else if (dir !== 0) {
      latVel += dir * 150 * dt;
    } else {
      const decel = 175 * dt;
      latVel = Math.abs(latVel) <= decel ? 0 : latVel - Math.sign(latVel) * decel;
    }
    latVel = Math.max(-maxV, Math.min(maxV, latVel));
    const nx = ship.position.x + latVel * dt;
    if ((nx <= -TRACK_HALF && latVel < 0) || (nx >= TRACK_HALF && latVel > 0)) latVel = 0;
    ship.position.x = Math.max(-TRACK_HALF, Math.min(TRACK_HALF, nx));
    const bankTarget = Math.max(-0.45, Math.min(0.45, -latVel * 0.02));
    shipBank += (bankTarget - shipBank) * Math.min(1, dt * 10);
    ship.rotation.z = shipBank + morphRoll;
    ship.rotation.x = -airFlip;

    if (!grounded) {
      vy += GRAVITY * dt;
      ship.position.y += vy * dt;
      if (ship.position.y <= 0.95) {
        ship.position.y = 0.95; grounded = true; vy = 0;
        airJumps = tier >= MAX_TIER ? 1 : 0;
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
    updateGroundGlow();

    for (let i = pillars.length - 1; i >= 0; i--) {
      pillars[i].position.z += move;
      if (pillars[i].position.z > 12) { scene.remove(pillars[i]); pillars.splice(i, 1); }
    }
    for (let i = roadside.length - 1; i >= 0; i--) {
      const rs = roadside[i];
      rs.position.z += move;
      if (rs.userData.ring) {
        rs.userData.ring.rotation.z += dt * 1.8;
        rs.userData.ring.rotation.x = Math.sin(t * 2.2 + rs.userData.phase) * 0.35;
      }
      if (rs.userData.core) {
        rs.userData.core.rotation.y += dt * 2.5;
        rs.userData.core.rotation.x += dt * 1.2;
      }
      if (rs.position.z > 15) { scene.remove(rs); roadside.splice(i, 1); }
    }
    for (let i = arches.length - 1; i >= 0; i--) {
      arches[i].position.z += move;
      if (arches[i].position.z > 15) { scene.remove(arches[i]); arches.splice(i, 1); }
    }
    for (let i = warpBeacons.length - 1; i >= 0; i--) {
      const wb = warpBeacons[i];
      wb.position.z += move;
      if (wb.userData.core) {
        wb.userData.core.scale.setScalar(0.9 + Math.sin(t * 6 + wb.userData.phase) * 0.15);
      }
      if (wb.position.z > 15) { scene.remove(wb); warpBeacons.splice(i, 1); }
    }

    streakTimer -= dt;
    if (speed > 40 && streakTimer <= 0) {
      streakTimer = 0.05 + Math.random() * 0.07;
      const s = new THREE.Mesh(streakGeo, streakMat);
      s.scale.set(1, 1, 4 + Math.random() * 5);
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
      if (o.userData.scan) {
        if (o.userData.type === 'wall') {
          o.userData.scan.position.y = 1.6 + Math.sin(t * 7 + o.userData.phase) * 1.1;
          if (o.userData.leftPylon && o.userData.rightPylon) {
            const pulse = 0.85 + Math.sin(t * 10 + o.userData.phase) * 0.15;
            o.userData.leftPylon.scale.x = pulse;
            o.userData.rightPylon.scale.x = pulse;
          }
        } else if (o.userData.type === 'low') {
          o.userData.scan.scale.x = 0.88 + Math.sin(t * 8 + o.userData.phase) * 0.12;
          if (o.userData.guide) {
            o.userData.guide.scale.x = 0.94 + Math.sin(t * 11 + o.userData.phase) * 0.06;
          }
        }
      }
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
      if (o.userData.innerRing) {
        o.userData.innerRing.rotation.x = t * 2.8 + o.userData.phase;
        o.userData.innerRing.rotation.z = Math.sin(t * 1.8 + o.userData.phase) * 0.4;
      }
      if (o.userData.outerRing) {
        o.userData.outerRing.rotation.y = t * -2.1 + o.userData.phase;
        o.userData.outerRing.rotation.x = Math.cos(t * 1.5 + o.userData.phase) * 0.5;
      } else if (o.userData.ring) {
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
          morphRoll = Math.PI * 2;
          if (tier >= MAX_TIER) airJumps = 1;
          if (tier >= 2 && !shieldReady) { shieldReady = true; orbCountAtShieldEvent = orbCount; }
          timeScale = 0.35;
          shakeTime = Math.max(shakeTime, 0.45);
          ui.flash('#ffffff', 0.35, 550);
          ui.toast(TIER_NAMES[tier], '#' + TIER_COLORS[tier].toString(16).padStart(6, '0'));
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
    if (cyberSun) {
      cyberSun.position.x = ship.position.x * 2.31;
    }
    camRoll += (-latVel * 0.0016 - camRoll) * Math.min(1, dt * 8);
    camera.rotation.z += camRoll;

    fovKick *= Math.exp(-dt * 5);
    camera.fov = 70 + ((speed - 26) / 46) * 12 + fovKick;
    camera.updateProjectionMatrix();

    // 随里程平滑过渡环境基色、远景雾效与障碍物主题配色
    const curZoneCfg = MILESTONE_ZONES[currentZoneIndex];
    tmpColB.setHex(curZoneCfg.bgHex);
    BG_BASE.lerp(tmpColB, dt * 1.5);
    if (scene.fog) scene.fog.color.lerp(tmpColB, dt * 1.5);

    targetWallEdgeCol.setHex(curZoneCfg.wallEdgeHex);
    targetLowEdgeCol.setHex(curZoneCfg.lowEdgeHex);
    targetWallCoreCol.setHex(curZoneCfg.wallCoreHex);
    targetLowCoreCol.setHex(curZoneCfg.lowCoreHex);
    currentWallEdgeCol.lerp(targetWallEdgeCol, dt * 2.0);
    currentLowEdgeCol.lerp(targetLowEdgeCol, dt * 2.0);
    currentWallCoreCol.lerp(targetWallCoreCol, dt * 2.0);
    currentLowCoreCol.lerp(targetLowCoreCol, dt * 2.0);

  }

  const pdt = dt * timeScale;
  for (let i = 0; i < particlePool.length; i++) {
    const p = particlePool[i];
    if (!p.active) continue;
    p.life -= pdt;
    if (p.life <= 0) {
      p.active = false;
      p.pts.visible = false;
      continue;
    }
    const arr = p.posArr;
    const cnt = p.count;
    for (let j = 0; j < cnt; j++) {
      const v = p.vel[j];
      v.y -= 20 * pdt;
      arr[j * 3] += v.x * pdt;
      arr[j * 3 + 1] = Math.max(0.05, arr[j * 3 + 1] + v.y * pdt);
      arr[j * 3 + 2] += v.z * pdt;
    }
    p.posAttr.needsUpdate = true;
    p.mat.opacity = Math.max(0, p.life / p.maxLife);
  }

  beatGlow *= Math.exp(-dt * 6);
  grid.material.opacity = 0.72 + beatGlow * 0.28;
  if (bloomPass) bloomPass.strength = 1.1 + beatGlow * 0.35;
  wallCoreMat.opacity = 0.65 + beatGlow * 0.35;
  lowCoreMat.opacity = 0.65 + beatGlow * 0.35;
  wallCoreMat.color.copy(currentWallCoreCol);
  lowCoreMat.color.copy(currentLowCoreCol);
  wallEdgeMat.color.copy(currentWallEdgeCol).lerp(WHITE, beatGlow * 0.35);
  lowEdgeMat.color.copy(currentLowEdgeCol).lerp(WHITE, beatGlow * 0.35);
  towerCapMat.color.setHex(0x00ffff).lerp(WHITE, beatGlow * 0.35);
  towerSpireMat.color.setHex(0xff0088).lerp(WHITE, beatGlow * 0.35);
  archNeonMat.color.setHex(0xff00aa).lerp(WHITE, beatGlow * 0.35);
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

window.__neon = {
  get scene() { return scene; },
  get camera() { return camera; },
  get renderer() { return renderer; },
  get composer() { return composer; },
  get bloomPass() { return bloomPass; },
  get ship() { return ship; },
  get state() { return state; },
  get tier() { return tier; },
  get groundGlow() { return groundGlow; },
  get groundGlowMat() { return groundGlowMat; },
  updateGroundGlow,
  makeWall,
  makeLow,
  makeOrb,
  makeOverheadArch,
  makeRoadsideRelay,
  makeWarpBeacon,
  get warpBeacons() { return warpBeacons; },
  get singularityHalo() { return singularityHalo; },
  get sideFibres() { return sideFibres; },
  get meteors() { return meteors; },
  get currentZoneIndex() { return currentZoneIndex; },
  get wallEdgeMat() { return wallEdgeMat; },
  get lowEdgeMat() { return lowEdgeMat; },
  get wallCoreMat() { return wallCoreMat; },
  get lowCoreMat() { return lowCoreMat; },
  MILESTONE_ZONES,
  TIER_COLORS
};
