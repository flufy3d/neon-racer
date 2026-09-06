import { playSound } from '../audio.js';
import { MAX_PARTICLES_PER_BURST, MAX_TIER, PARTICLE_POOL_SIZE, TIER_COLORS } from '../core/constants.js';
import { run, view } from '../core/state.js';
import { neonSparkTex, neonStarTex, shockwaveRingTex } from '../scene/textures.js';
import * as ui from '../ui.js';
import * as THREE from 'three';

// ── 爆发粒子池（Zero-GC，加法混合，带光晕与空气阻尼） ──
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
      size: 0.36,
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
      drag[j] = 0.94;
      gravity[j] = 16;
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
      baseSize: 0.36,
      count: 0,
      life: 0,
      maxLife: 1,
      active: false
    });
  }
}

export function burst(pos, color, size, maxLife, power, count = 140) {
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
  item.baseSize = size * 1.35;
  item.mat.size = item.baseSize;
  item.mat.opacity = 1;

  const posArr = item.posArr;
  for (let i = 0; i < actualCount; i++) {
    posArr[i * 3] = pos.x;
    posArr[i * 3 + 1] = pos.y;
    posArr[i * 3 + 2] = pos.z;

    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const spd = (0.35 + Math.random() * 0.95) * 16 * power;

    item.vel[i].set(
      Math.sin(phi) * Math.cos(theta) * spd,
      Math.abs(Math.sin(phi) * Math.sin(theta)) * spd * 0.85 + 1.2 * power,
      Math.cos(phi) * spd
    );

    item.drag[i] = 1.6 + Math.random() * 1.8;
    item.gravity[i] = 12 + Math.random() * 14;
    item.bounces[i] = 0;
  }

  item.geo.setDrawRange(0, actualCount);
  item.posAttr.needsUpdate = true;
  item.pts.visible = true;
  item.active = true;
}

export function updateBurstParticles(pdt) {
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
      const dragFactor = Math.exp(-p.drag[j] * pdt);
      v.x *= dragFactor;
      v.z *= dragFactor;
      v.y -= p.gravity[j] * pdt;

      arr[j * 3] += v.x * pdt;
      arr[j * 3 + 1] += v.y * pdt;
      arr[j * 3 + 2] += v.z * pdt;

      // 地面弹性碰撞与微摩擦衰减，杜绝生硬平移
      if (arr[j * 3 + 1] <= 0.06) {
        arr[j * 3 + 1] = 0.06;
        if (p.bounces[j] < 2) {
          v.y = -v.y * 0.38;
          v.x *= 0.65;
          v.z *= 0.65;
          p.bounces[j]++;
        } else {
          v.y = 0;
          v.x *= 0.4;
          v.z *= 0.4;
        }
      }
    }

    p.posAttr.needsUpdate = true;
    const progress = Math.max(0, p.life / p.maxLife);
    p.mat.opacity = Math.pow(progress, 1.3);
    p.mat.size = p.baseSize * (0.6 + 0.4 * progress);
  }
}

// ── 冲击波对象池（Zero-GC 预分配，双环能量干涉） ──
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
  s.life = 0.52 * power;
  s.maxLife = s.life;
  s.power = power;
  s.mat.color.set(color);
  s.mat.opacity = 0.96;
  s.m.position.set(pos.x, Math.max(0.06, pos.y), pos.z);
  s.m.scale.setScalar(0.2 * power);
  s.m.visible = true;
}

export function updateShockwaves(pdt) {
  for (let i = 0; i < shockwavePool.length; i++) {
    const s = shockwavePool[i];
    if (!s.active) continue;
    s.life -= pdt;
    if (s.life <= 0) {
      s.active = false;
      s.m.visible = false;
      continue;
    }

    const progress = 1 - Math.max(0, s.life) / s.maxLife;
    const ease = 1 - Math.pow(1 - progress, 3);
    const targetScale = (0.2 + ease * 8.4) * s.power;
    s.m.scale.setScalar(targetScale);
    s.mat.opacity = 0.96 * Math.pow(1 - progress, 1.5);
  }
}

// ── 战机等离子尾流发射器（160 颗环形缓冲，单 DrawCall） ──
const TRAIL_MAX = 160;
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

const _vShipPos = new THREE.Vector3();
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

  const mat = new THREE.PointsMaterial({
    size: 0.38,
    map: neonSparkTex,
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

  // 1. 发射新尾流粒子
  if (run.state === 'playing' && view.ship && view.ship.visible) {
    view.ship.updateMatrixWorld();
    _tmpCol.setHex(TIER_COLORS[Math.min(MAX_TIER, Math.floor(run.tier))]);

    // 主引擎喷口 (左右对称)
    const nozzles = [
      [-0.3, 0, 1.25],
      [0.3, 0, 1.25]
    ];

    // T3 及以上激活外侧引擎喷口
    if (run.tier >= 3) {
      nozzles.push([-0.72, -0.06, 0.75], [0.72, -0.06, 0.75]);
    }
    // T5 激活背部量子推进器
    if (run.tier >= 5) {
      nozzles.push([-0.46, 0.36, 1.18], [0.46, 0.36, 1.18]);
    }

    const backwardSpeed = run.speed * 0.42 + 11;
    for (let k = 0; k < nozzles.length; k++) {
      const n = nozzles[k];
      _vNozzleLocal.set(
        n[0] + (Math.random() - 0.5) * 0.06,
        n[1] + (Math.random() - 0.5) * 0.06,
        n[2]
      );
      _vNozzleWorld.copy(_vNozzleLocal).applyMatrix4(view.ship.matrixWorld);

      const emitVel = new THREE.Vector3(
        -run.latVel * 0.22 + (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.5) * 1.2,
        backwardSpeed + Math.random() * 5
      );

      // 40% 几率产生炽白高温火花，60% 产生形态主题色彩
      const pCol = Math.random() < 0.4 ? _whiteCol : _tmpCol;
      const life = 0.20 + Math.random() * 0.12;
      spawnTrailParticle(_vNozzleWorld, emitVel, pCol, life);
    }
  }

  // 2. 模拟与更新粒子生命周期
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
    v.x *= Math.exp(-4.5 * dt);
    v.y *= Math.exp(-4.5 * dt);

    trailPosArr[i * 3] += v.x * dt;
    trailPosArr[i * 3 + 1] += v.y * dt;
    trailPosArr[i * 3 + 2] += v.z * dt;

    const alpha = Math.pow(Math.max(0, trailLife[i] / trailMaxLife[i]), 1.2);
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

// ── 高表现力复合特效宏 ──
export function explode(pos) {
  // 炽白瞬闪核心
  burst(pos, 0xffffff, 0.52, 0.55, 1.8, 80);
  // 主能量等离子狂暴扩散
  burst(pos, 0xff2266, 0.44, 1.25, 1.55, 180);
  // 悬浮长寿命赛博火星
  burst(pos, 0xffaa00, 0.32, 1.7, 1.1, 120);
  // 双层高能冲击波
  spawnShockwave(pos, 0xff0055, 2.3);
  spawnShockwave(pos, 0xffffff, 1.4);
}

export function shieldBreakFx() {
  spawnShockwave(view.ship.position, 0x00ffff, 1.8);
  spawnShockwave(view.ship.position, 0xffffff, 1.1);
  burst(view.ship.position, 0x00ffff, 0.38, 0.65, 1.4, 90);
  burst(view.ship.position, 0xffffff, 0.28, 0.45, 0.95, 50);
  ui.flash('#00ffff', 0.3, 400);
  ui.toast('护盾破碎!', '#00ffff');
  run.shakeTime = Math.max(run.shakeTime, 0.4);
  playSound('shieldBreak');
}
