import { beep } from '../audio.js';
import { MAX_PARTICLES_PER_BURST, PARTICLE_POOL_SIZE } from '../core/constants.js';
import { lists, run, view } from '../core/state.js';
import * as ui from '../ui.js';
import * as THREE from 'three';

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
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, fog: false });
    const pts = new THREE.Points(geo, mat);
    pts.visible = false;
    pts.frustumCulled = false;
    view.scene.add(pts);

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

export function explode(pos) {
  burst(pos, 0xff5533, 0.45, 1.5, 1.5, 220);
  burst(pos, 0xffffff, 0.32, 0.5, 0.9, 70);
}

const shockGeo = new THREE.TorusGeometry(1, 0.05, 8, 48);

export function spawnShockwave(pos, color, power = 1) {
  const m = new THREE.Mesh(shockGeo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, fog: false }));
  m.position.set(pos.x, Math.max(0.15, pos.y), pos.z);
  m.scale.setScalar(0.3);
  view.scene.add(m);
  lists.shockwaves.push({ m, life: 0.6 * power, maxLife: 0.6 * power, power });
}

export function shieldBreakFx() {
  spawnShockwave(view.ship.position, 0x00ffff, 1.2);
  spawnShockwave(view.ship.position, 0xffffff, 0.7);
  burst(view.ship.position, 0x00ffff, 0.26, 0.7, 1.2, 80);
  ui.flash('#00ffff', 0.3, 400);
  ui.toast('护盾破碎!', '#00ffff');
  run.shakeTime = Math.max(run.shakeTime, 0.4);
  beep(800, 0.2, 'sawtooth', 0.12);
  setTimeout(() => beep(400, 0.25, 'sawtooth', 0.1), 100);
}

