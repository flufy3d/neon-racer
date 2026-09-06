import { playSound } from '../audio.js';
import { MAX_PARTICLES_PER_BURST, MAX_TIER, PARTICLE_POOL_SIZE, TIER_COLORS } from '../core/constants.js';
import { run, view } from '../core/state.js';
import { jetNeedleTex, neonSparkTex, shockwaveRingTex } from '../scene/textures.js';
import * as ui from '../ui.js';
import * as THREE from 'three';

// ── 爆发粒子池（Zero-GC，加法混合，跑道相对运动，内敛高级感） ──
export const particlePool = [];

function initParticlePool() {
  if (particlePool.length > 0) return;
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(MAX_PARTICLES_PER_BURST * 3);
    const posAttr = new THREE.BufferAttribute(posArr, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setDrawRange(0, 0);

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.20,
      map: neonSparkTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });

    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    pts.frustumCulled = false;
    view.scene.add(pts);

    const vel = [];
    const drag = new Float32Array(MAX_PARTICLES_PER_BURST);
    const gravity = new Float32Array(MAX_PARTICLES_PER_BURST);
    const bounces = new Uint8Array(MAX_PARTICLES_PER_BURST);

    for (let j = 0; j < MAX_PARTICLES_PER_BURST; j++) {
      vel.push(new THREE.Vector3());
      drag[j] = 1.2;
      gravity[j] = 14;
      bounces[j] = 0;
    }

    particlePool.push({
      pts,
      geo,
      posArr,
      posAttr,
      mat,
      vel,
      drag,
      gravity,
      bounces,
      baseSize: 0.20,
      count: 0,
      life: 0,
      maxLife: 1,
      active: false
    });
  }
}

export function burst(pos, color, size = 0.20, maxLife = 0.45, power = 1, count = 30) {
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
  item.baseSize = size;
  item.mat.size = size;
  item.mat.opacity = 1;

  const posArr = item.posArr;
  for (let i = 0; i < actualCount; i++) {
    posArr[i * 3] = pos.x;
    posArr[i * 3 + 1] = pos.y;
    posArr[i * 3 + 2] = pos.z;

    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const spd = (0.3 + Math.random() * 0.7) * 11 * power;

    item.vel[i].set(
      Math.sin(phi) * Math.cos(theta) * spd,
      Math.abs(Math.sin(phi) * Math.sin(theta)) * spd * 0.75 + 1.0 * power,
      Math.cos(phi) * spd
    );

    item.drag[i] = 1.8 + Math.random() * 1.5;
    item.gravity[i] = 10 + Math.random() * 10;
    item.bounces[i] = 0;
  }

  item.geo.setDrawRange(0, actualCount);
  item.posAttr.needsUpdate = true;
  item.pts.visible = true;
  item.active = true;
}

export function updateBurstParticles(pdt, move = 0) {
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
    let allBehind = true;

    for (let j = 0; j < cnt; j++) {
      const v = p.vel[j];
      const dragFactor = Math.exp(-p.drag[j] * pdt);
      v.x *= dragFactor;
      v.z *= dragFactor;
      v.y -= p.gravity[j] * pdt;

      arr[j * 3] += v.x * pdt;
      arr[j * 3 + 1] += v.y * pdt;
      // 物理脱离：粒子留在世界跑道坐标系中，随着飞船前进以 move 速度迅速后退脱离战机！
      arr[j * 3 + 2] += (v.z * pdt) + move;

      if (arr[j * 3 + 2] <= 16) allBehind = false;

      // 地面接触反弹衰减
      if (arr[j * 3 + 1] <= 0.06) {
        arr[j * 3 + 1] = 0.06;
        if (p.bounces[j] < 1) {
          v.y = -v.y * 0.28;
          v.x *= 0.55;
          v.z *= 0.55;
          p.bounces[j]++;
        } else {
          v.y = 0;
          v.x *= 0.3;
          v.z *= 0.3;
        }
      }
    }

    // 若全部粒子已远离视野后方，提前回收
    if (allBehind && arr[2] > 18) {
      p.active = false;
      p.pts.visible = false;
      continue;
    }

    p.posAttr.needsUpdate = true;
    const progress = Math.max(0, p.life / p.maxLife);
    p.mat.opacity = Math.pow(progress, 1.4);
    p.mat.size = p.baseSize * (0.5 + 0.5 * progress);
  }
}

// ── 冲击波对象池（Zero-GC 预分配，世界坐标脱离后退） ──
export const shockwavePool = [];
const SHOCKWAVE_POOL_SIZE = 8;
const shockPlaneGeo = new THREE.PlaneGeometry(2, 2);
shockPlaneGeo.rotateX(-Math.PI / 2);

export function initShockwavePool() {
  if (shockwavePool.length > 0) return;
  for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: shockwaveRingTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(shockPlaneGeo, mat);
    m.visible = false;
    view.scene.add(m);

    shockwavePool.push({
      m,
      mat,
      active: false,
      life: 0,
      maxLife: 1,
      power: 1
    });
  }
}

export function spawnShockwave(pos, color, power = 1) {
  if (shockwavePool.length === 0) initShockwavePool();
  let s = shockwavePool.find(item => !item.active);
  if (!s) {
    let minLife = Infinity;
    for (const item of shockwavePool) {
      if (item.life < minLife) { minLife = item.life; s = item; }
    }
  }
  if (!s) return;

  s.active = true;
  s.life = 0.45 * power;
  s.maxLife = s.life;
  s.power = power;
  s.mat.color.set(color);
  s.mat.opacity = 0.85;
  s.m.position.set(pos.x, Math.max(0.06, pos.y), pos.z);
  s.m.scale.setScalar(0.2 * power);
  s.m.visible = true;
}

export function updateShockwaves(pdt, move = 0) {
  for (let i = 0; i < shockwavePool.length; i++) {
    const s = shockwavePool[i];
    if (!s.active) continue;
    s.life -= pdt;
    if (s.life <= 0) {
      s.active = false;
      s.m.visible = false;
      continue;
    }

    // 冲击波固定在赛道地面，随飞船前进相对后退脱离战机
    s.m.position.z += move;
    if (s.m.position.z > 22) {
      s.active = false;
      s.m.visible = false;
      continue;
    }

    const progress = 1 - Math.max(0, s.life) / s.maxLife;
    const ease = 1 - Math.pow(1 - progress, 3);
    const targetScale = (0.2 + ease * 6.5) * s.power;
    s.m.scale.setScalar(targetScale);
    s.mat.opacity = 0.82 * Math.pow(1 - progress, 1.5);
  }
}

// ── 战斗机超音速马赫尾喷束（内敛紧凑、超细离子流羽、超短寿命连续射流） ──
const TRAIL_MAX = 120;
let trailPoints = null;
let trailGeo = null;
let trailPosAttr = null;
let trailColAttr = null;
let trailPosArr = null;
let trailColArr = null;
const trailVel = [];
const trailLife = new Float32Array(TRAIL_MAX);
const trailMaxLife = new Float32Array(TRAIL_MAX);
const trailActive = new Uint8Array(TRAIL_MAX);
const trailBaseCol = [];
let trailCursor = 0;

const _vNozzleLocal = new THREE.Vector3();
const _vNozzleWorld = new THREE.Vector3();
const _tmpCol = new THREE.Color();
const _whiteCol = new THREE.Color(1, 1, 1);

export function initShipTrailEmitter() {
  if (trailPoints) return;
  trailGeo = new THREE.BufferGeometry();
  trailPosArr = new Float32Array(TRAIL_MAX * 3);
  trailColArr = new Float32Array(TRAIL_MAX * 3);

  for (let i = 0; i < TRAIL_MAX; i++) {
    trailPosArr[i * 3 + 1] = -999;
    trailVel.push(new THREE.Vector3());
    trailBaseCol.push(new THREE.Color(0, 1, 1));
  }

  trailPosAttr = new THREE.BufferAttribute(trailPosArr, 3);
  trailPosAttr.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('position', trailPosAttr);

  trailColAttr = new THREE.BufferAttribute(trailColArr, 3);
  trailColAttr.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('color', trailColAttr);

  // 使用超细战斗机离子流针状贴图，尺寸极小，杜绝离散大圆球
  const mat = new THREE.PointsMaterial({
    size: 0.12,
    map: jetNeedleTex,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });

  trailPoints = new THREE.Points(trailGeo, mat);
  trailPoints.frustumCulled = false;
  trailPoints.visible = true;
  view.scene.add(trailPoints);
}

function spawnTrailParticle(pos, vel, color, life) {
  if (!trailPoints) initShipTrailEmitter();
  const idx = trailCursor;
  trailCursor = (trailCursor + 1) % TRAIL_MAX;

  trailPosArr[idx * 3] = pos.x;
  trailPosArr[idx * 3 + 1] = pos.y;
  trailPosArr[idx * 3 + 2] = pos.z;

  trailVel[idx].copy(vel);
  trailLife[idx] = life;
  trailMaxLife[idx] = life;
  trailActive[idx] = 1;
  trailBaseCol[idx].copy(color);

  trailColArr[idx * 3] = color.r;
  trailColArr[idx * 3 + 1] = color.g;
  trailColArr[idx * 3 + 2] = color.b;
}

export function updateShipTrail(dt, t) {
  if (!trailPoints) initShipTrailEmitter();

  // 1. 发射战斗机超音速紧致等离子射流
  if (run.state === 'playing' && view.ship && view.ship.visible) {
    view.ship.updateMatrixWorld();
    _tmpCol.setHex(TIER_COLORS[Math.min(MAX_TIER, Math.floor(run.tier))]);

    // 主引擎喷口
    const nozzles = [
      [-0.3, 0, 1.48],
      [0.3, 0, 1.48]
    ];

    // T3 翼下引擎
    if (run.tier >= 3) {
      nozzles.push([-0.72, -0.06, 0.85], [0.72, -0.06, 0.85]);
    }
    // T5 背部推进器
    if (run.tier >= 5) {
      nozzles.push([-0.46, 0.36, 1.30], [0.46, 0.36, 1.30]);
    }

    // 相对飞船的超音速向后喷射速度（射流紧密相连形成光锥拉丝）
    const relJetSpeed = run.speed + 38 + Math.random() * 8;

    for (let k = 0; k < nozzles.length; k++) {
      const n = nozzles[k];
      // 极紧凑的喷嘴中心约束（微抖动 < 0.02），绝不散开成大团
      _vNozzleLocal.set(
        n[0] + (Math.random() - 0.5) * 0.02,
        n[1] + (Math.random() - 0.5) * 0.02,
        n[2]
      );
      _vNozzleWorld.copy(_vNozzleLocal).applyMatrix4(view.ship.matrixWorld);

      const emitVel = new THREE.Vector3(
        -run.latVel * 0.12,
        (Math.random() - 0.5) * 0.3,
        relJetSpeed
      );

      // 60% 产生喷口炽白马赫核心光，40% 呈现战机主题色
      const pCol = Math.random() < 0.6 ? _whiteCol : _tmpCol;
      // 超短寿命（0.05 ~ 0.08 秒），在 1.5 米内迅速溶解成真空，形成内敛光刃尾流
      const life = 0.05 + Math.random() * 0.035;
      spawnTrailParticle(_vNozzleWorld, emitVel, pCol, life);
    }
  }

  // 2. 模拟射流后移与能量衰减
  let hasActive = false;
  for (let i = 0; i < TRAIL_MAX; i++) {
    if (!trailActive[i]) continue;
    trailLife[i] -= dt;
    if (trailLife[i] <= 0) {
      trailActive[i] = 0;
      trailPosArr[i * 3 + 1] = -999;
      trailColArr[i * 3] = 0;
      trailColArr[i * 3 + 1] = 0;
      trailColArr[i * 3 + 2] = 0;
      continue;
    }

    hasActive = true;
    const v = trailVel[i];
    v.x *= Math.exp(-6.0 * dt);

    trailPosArr[i * 3] += v.x * dt;
    trailPosArr[i * 3 + 1] += v.y * dt;
    trailPosArr[i * 3 + 2] += v.z * dt;

    // 超快线性衰减，干净利落
    const alpha = Math.max(0, trailLife[i] / trailMaxLife[i]);
    const base = trailBaseCol[i];
    trailColArr[i * 3] = base.r * alpha;
    trailColArr[i * 3 + 1] = base.g * alpha;
    trailColArr[i * 3 + 2] = base.b * alpha;
  }

  trailPosAttr.needsUpdate = true;
  trailColAttr.needsUpdate = true;
  trailPoints.visible = hasActive || (run.state === 'playing');
}

export function resetParticlePools() {
  for (let i = 0; i < particlePool.length; i++) {
    const p = particlePool[i];
    p.active = false;
    p.pts.visible = false;
    p.geo.setDrawRange(0, 0);
  }

  for (let i = 0; i < shockwavePool.length; i++) {
    const s = shockwavePool[i];
    s.active = false;
    s.m.visible = false;
  }

  if (trailPoints) {
    for (let i = 0; i < TRAIL_MAX; i++) {
      trailActive[i] = 0;
      trailLife[i] = 0;
      trailPosArr[i * 3 + 1] = -999;
      trailColArr[i * 3] = 0;
      trailColArr[i * 3 + 1] = 0;
      trailColArr[i * 3 + 2] = 0;
    }
    trailPosAttr.needsUpdate = true;
    trailColAttr.needsUpdate = true;
  }
}

// ── 内敛克制、高级质感的复合爆炸宏 ──
export function explode(pos) {
  // 紧凑白炽瞬闪
  burst(pos, 0xffffff, 0.28, 0.35, 1.3, 30);
  // 核心等离子碎屑扩散
  burst(pos, 0xff2266, 0.22, 0.75, 1.2, 60);
  // 单层赛博冲击波
  spawnShockwave(pos, 0xff0055, 1.6);
}

export function shieldBreakFx() {
  spawnShockwave(view.ship.position, 0x00ffff, 1.2);
  burst(view.ship.position, 0x00ffff, 0.20, 0.4, 1.0, 35);
  ui.flash('#00ffff', 0.16, 250);
  ui.toast('护盾破碎!', '#00ffff');
  run.shakeTime = Math.max(run.shakeTime, 0.35);
  playSound('shieldBreak');
}
