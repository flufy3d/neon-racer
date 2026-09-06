import { playSound } from '../audio.js';
import { MAX_PARTICLES_PER_BURST, MAX_TIER, PARTICLE_POOL_SIZE, TIER_COLORS } from '../core/constants.js';
import { run, view } from '../core/state.js';
import { jetNeedleTex, neonSparkTex, plumeJetTex, shockwaveRingTex } from '../scene/textures.js';
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

// ── 障碍物多边形爆裂破片池（Zero-GC，三维低面数网格，空中剧烈自旋与跑道后退） ──
export const shardPool = [];
const SHARD_POOL_SIZE = 28;

const shardGeoTetra = new THREE.TetrahedronGeometry(0.32);
const shardGeoBox = new THREE.BoxGeometry(0.22, 0.42, 0.14);
const shardGeoOcta = new THREE.OctahedronGeometry(0.26);

export function initShardPool() {
  if (shardPool.length > 0) return;
  for (let i = 0; i < SHARD_POOL_SIZE; i++) {
    const geo = i % 3 === 0 ? shardGeoTetra : (i % 3 === 1 ? shardGeoBox : shardGeoOcta);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff1155,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    view.scene.add(m);

    shardPool.push({
      mesh: m,
      mat,
      active: false,
      life: 0,
      maxLife: 1,
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3(),
      baseScale: 1,
      bounces: 0
    });
  }
}

export function shatterObstacle(obstacle) {
  if (shardPool.length === 0) initShardPool();
  const pos = obstacle.position;
  const type = obstacle.userData?.type || 'wall';
  const isWall = type === 'wall';
  const centerY = isWall ? 1.6 : 0.42;
  const spreadY = isWall ? 2.4 : 0.55;
  const themeHex = isWall ? 0xff1155 : 0xffaa00;
  const altHex = isWall ? 0xff3388 : 0xffcc22;

  const count = 16;
  let allocated = 0;

  // 1. 激活三维几何立体破片
  for (let i = 0; i < SHARD_POOL_SIZE && allocated < count; i++) {
    const s = shardPool[i];
    if (s.active) continue;

    s.active = true;
    allocated++;
    s.life = 0.75 + Math.random() * 0.45;
    s.maxLife = s.life;
    s.bounces = 0;
    s.baseScale = 0.8 + Math.random() * 0.7;

    // 破片散布在障碍物体积内
    const px = pos.x + (Math.random() - 0.5) * 2.2;
    const py = Math.max(0.12, centerY + (Math.random() - 0.5) * spreadY);
    const pz = pos.z + (Math.random() - 0.5) * 0.4;
    s.mesh.position.set(px, py, pz);

    // 赋予强大的向外炸飞冲量（左右炸飞 + 被战机撞击向上抛甩 + 前后飞溅）
    const dx = px - (view.ship ? view.ship.position.x : 0);
    s.vel.set(
      dx * 4.8 + (Math.random() - 0.5) * 6.5,
      (isWall ? 4.5 : 3.0) + Math.random() * 6.5,
      (Math.random() - 0.5) * 7.0
    );

    // 剧烈三维自旋翻滚
    s.rotVel.set(
      (Math.random() - 0.5) * 18,
      (Math.random() - 0.5) * 18,
      (Math.random() - 0.5) * 18
    );

    // 色彩交替：主色、辅色与部分高能白炽
    const randCol = Math.random();
    s.mat.color.setHex(randCol < 0.55 ? themeHex : (randCol < 0.85 ? altHex : 0xffffff));
    s.mat.opacity = 1.0;
    s.mesh.scale.setScalar(s.baseScale);
    s.mesh.visible = true;
  }

  // 2. 叠加热烈的高能等离子爆发火花与黑客帝国多重空气时空激波环
  burst(pos, themeHex, 0.28, 0.65, 1.4, 38);
  burst(pos, 0xffffff, 0.32, 0.35, 1.1, 22);
  spawnShockwave(pos, themeHex, 2.0);
  spawnShockwave({ x: pos.x, y: pos.y + 0.3, z: pos.z - 1.2 }, 0x00ffff, 1.5);
  spawnShockwave({ x: pos.x, y: pos.y + 0.6, z: pos.z + 1.2 }, 0xffffff, 1.7);
}

export function updateShards(pdt, move = 0) {
  for (let i = 0; i < shardPool.length; i++) {
    const s = shardPool[i];
    if (!s.active) continue;
    s.life -= pdt;
    if (s.life <= 0) {
      s.active = false;
      s.mesh.visible = false;
      continue;
    }

    // 物理：空气阻尼、重力、自旋
    s.vel.x *= Math.exp(-1.6 * pdt);
    s.vel.z *= Math.exp(-1.6 * pdt);
    s.vel.y -= 13.5 * pdt;

    s.mesh.position.x += s.vel.x * pdt;
    s.mesh.position.y += s.vel.y * pdt;
    // 关键：跑道相对物理位移，破片留在原地并随飞船呼啸向前而迅速向后流逝
    s.mesh.position.z += (s.vel.z * pdt) + move;

    s.mesh.rotation.x += s.rotVel.x * pdt;
    s.mesh.rotation.y += s.rotVel.y * pdt;
    s.mesh.rotation.z += s.rotVel.z * pdt;

    // 地面接触反弹
    if (s.mesh.position.y <= 0.08) {
      s.mesh.position.y = 0.08;
      if (s.bounces < 2) {
        s.vel.y = -s.vel.y * 0.38;
        s.vel.x *= 0.65;
        s.vel.z *= 0.65;
        s.bounces++;
      } else {
        s.vel.y = 0;
        s.vel.x *= 0.3;
        s.vel.z *= 0.3;
      }
    }

    // 远离视野后方回收
    if (s.mesh.position.z > 24) {
      s.active = false;
      s.mesh.visible = false;
      continue;
    }

    const progress = Math.max(0, s.life / s.maxLife);
    s.mat.opacity = Math.pow(progress, 1.2);
    s.mesh.scale.setScalar(s.baseScale * (0.25 + 0.75 * progress));
  }
}

// ── 能量球晶体碎裂立体破片池（Zero-GC，能量球专属微型多边形水晶破片） ──
export const orbShardPool = [];
const ORB_SHARD_POOL_SIZE = 40;

const orbShardGeoTetra = new THREE.TetrahedronGeometry(0.14);
const orbShardGeoOcta = new THREE.OctahedronGeometry(0.11);
const orbShardGeoIcosa = new THREE.IcosahedronGeometry(0.10, 0);

export function initOrbShardPool() {
  if (orbShardPool.length > 0) return;
  for (let i = 0; i < ORB_SHARD_POOL_SIZE; i++) {
    const geo = i % 3 === 0 ? orbShardGeoTetra : (i % 3 === 1 ? orbShardGeoOcta : orbShardGeoIcosa);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    view.scene.add(mesh);

    orbShardPool.push({
      mesh,
      mat,
      active: false,
      life: 0,
      maxLife: 1,
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3(),
      baseScale: 1
    });
  }
}

export function shatterOrb(pos) {
  if (orbShardPool.length === 0) initOrbShardPool();
  const count = 10;
  // 10 颗立体水晶破片：4 颗青蓝内环碎片 + 4 颗聚变金外环碎片 + 2 颗白炽晶核碎片
  // 100% 严格忠实于能量球本体三大材质色彩！
  const colors = [
    0x00ffff, 0x00ffff, 0x00ffff, 0x00ffff,
    0xffd700, 0xffd700, 0xffd700, 0xffd700,
    0xffffff, 0xffffff
  ];

  for (let i = 0; i < count; i++) {
    let s = orbShardPool.find(item => !item.active);
    if (!s) {
      let minLife = Infinity;
      for (const item of orbShardPool) {
        if (item.life < minLife) { minLife = item.life; s = item; }
      }
    }
    if (!s) break;

    s.active = true;
    s.life = 0.42 + Math.random() * 0.22;
    s.maxLife = s.life;
    s.baseScale = 0.85 + Math.random() * 0.55;

    // 随机散布在能量球体积内
    const px = pos.x + (Math.random() - 0.5) * 0.35;
    const py = pos.y + (Math.random() - 0.5) * 0.35;
    const pz = pos.z + (Math.random() - 0.5) * 0.35;
    s.mesh.position.set(px, py, pz);

    // 强烈的向外爆裂放射速度
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const spd = 5.0 + Math.random() * 6.5;

    s.vel.set(
      Math.sin(phi) * Math.cos(theta) * spd,
      Math.sin(phi) * Math.sin(theta) * spd * 0.8 + 1.2,
      Math.cos(phi) * spd * 0.85
    );

    // 剧烈三维空间自旋翻滚
    s.rotVel.set(
      (Math.random() - 0.5) * 24,
      (Math.random() - 0.5) * 24,
      (Math.random() - 0.5) * 24
    );

    s.mat.color.setHex(colors[i]);
    s.mat.opacity = 1.0;
    s.mesh.scale.setScalar(s.baseScale);
    s.mesh.visible = true;
  }
}

export function updateOrbShards(pdt, move = 0) {
  for (let i = 0; i < orbShardPool.length; i++) {
    const s = orbShardPool[i];
    if (!s.active) continue;
    s.life -= pdt;
    if (s.life <= 0) {
      s.active = false;
      s.mesh.visible = false;
      continue;
    }

    s.vel.x *= Math.exp(-2.2 * pdt);
    s.vel.z *= Math.exp(-2.2 * pdt);
    s.vel.y -= 11.0 * pdt;

    s.mesh.position.x += s.vel.x * pdt;
    s.mesh.position.y += s.vel.y * pdt;
    // 跑道相对物理位移：随战机向前冲刺，碎裂晶片呼啸向后掠过视野！
    s.mesh.position.z += (s.vel.z * pdt) + move;

    s.mesh.rotation.x += s.rotVel.x * pdt;
    s.mesh.rotation.y += s.rotVel.y * pdt;
    s.mesh.rotation.z += s.rotVel.z * pdt;

    if (s.mesh.position.y < 0.06) {
      s.mesh.position.y = 0.06;
      s.vel.y = Math.abs(s.vel.y) * 0.35;
      s.vel.x *= 0.7;
      s.vel.z *= 0.7;
    }

    if (s.mesh.position.z > 20) {
      s.active = false;
      s.mesh.visible = false;
      continue;
    }

    const progress = Math.max(0, s.life / s.maxLife);
    s.mat.opacity = Math.pow(progress, 1.2);
    s.mesh.scale.setScalar(s.baseScale * (0.2 + 0.8 * progress));
  }
}

// ── 战斗机超音速马赫尾喷束（高密度连续向后排气流柱、高频推力光刃） ──
const TRAIL_MAX = 1200;
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
const trailType = new Uint8Array(TRAIL_MAX); // 0: 外层烈焰羽流, 1: 超音速马赫内芯
const trailBaseCol = [];
let trailCursor = 0;

const _vNozzleLocal = new THREE.Vector3();
const _vNozzleWorld = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _tmpCol = new THREE.Color();
const _whiteCol = new THREE.Color(1, 1, 1);
const _cCoreWhite = new THREE.Color(1.0, 1.0, 1.0);
const _cMachBlue = new THREE.Color(0.72, 0.90, 1.0);   // 喷口喉部超音速激波冰蓝微光
const _cSolarGold = new THREE.Color(1.0, 0.84, 0.18);  // 主加力燃烧室耀金爆燃光
const _cRocketOrange = new THREE.Color(1.0, 0.40, 0.02); // 超音速羽流烈焰高能橙
const _cDeepEmber = new THREE.Color(0.68, 0.06, 0.01);  // 冷却尾涡深红余烬

function getPlumeColor(progress, type = 0, spdRatio = 1.0) {
  // progress: 1.0 (刚从喷口射出) -> 0.0 (消散降温)
  if (type === 1) {
    // ── 超音速马赫激波内芯（白炽耀光针轴） ──
    // 高速全加力时极高温白炽核穿透更深（可达生命周期的 40%~60%）
    const whiteThreshold = 0.36 - spdRatio * 0.12;
    if (progress > whiteThreshold) {
      const k = (progress - whiteThreshold) / (1.0 - whiteThreshold);
      return _tmpCol.copy(_cMachBlue).lerp(_cCoreWhite, k);
    } else {
      const k = progress / whiteThreshold;
      return _tmpCol.copy(_cSolarGold).lerp(_cMachBlue, k);
    }
  } else {
    // ── 气动膨胀烈焰外羽（真机黑体辐射燃烧光谱） ──
    // 1.00 ~ 0.66: 耀金爆燃光 (#ffd62e)
    // 0.66 ~ 0.24: 超音速烈焰橙红 (#ff6605)
    // 0.24 ~ 0.00: 尾端深红冷却余烬 (#ad0f02)
    if (progress > 0.66) {
      const k = (progress - 0.66) / 0.34;
      return _tmpCol.copy(_cSolarGold).lerp(_cCoreWhite, k * 0.40);
    } else if (progress > 0.24) {
      const k = (progress - 0.24) / 0.42;
      return _tmpCol.copy(_cRocketOrange).lerp(_cSolarGold, k);
    } else {
      const k = progress / 0.24;
      return _tmpCol.copy(_cDeepEmber).lerp(_cRocketOrange, k);
    }
  }
}

export function initShipTrailEmitter() {
  if (trailPoints) return;
  trailGeo = new THREE.BufferGeometry();
  trailPosArr = new Float32Array(TRAIL_MAX * 3);
  trailColArr = new Float32Array(TRAIL_MAX * 3);

  for (let i = 0; i < TRAIL_MAX; i++) {
    trailPosArr[i * 3 + 1] = -999;
    trailVel.push(new THREE.Vector3());
    trailBaseCol.push(new THREE.Color(1, 1, 1));
  }

  trailPosAttr = new THREE.BufferAttribute(trailPosArr, 3);
  trailPosAttr.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('position', trailPosAttr);

  trailColAttr = new THREE.BufferAttribute(trailColArr, 3);
  trailColAttr.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('color', trailColAttr);

  // 采用专用全白宽能量核尾喷贴图 plumeJetTex，高光密集交融，彻底消除细小点状颗粒感
  const mat = new THREE.PointsMaterial({
    size: 0.28,
    map: plumeJetTex,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });

  trailPoints = new THREE.Points(trailGeo, mat);
  trailPoints.frustumCulled = false;
  trailPoints.visible = true;
  if (view.ship) {
    view.ship.add(trailPoints);
  } else {
    view.scene.add(trailPoints);
  }
}

function spawnTrailParticleWithColor(pos, vel, type, life, maxLife, spdRatio) {
  if (!trailPoints) initShipTrailEmitter();
  const idx = trailCursor;
  trailCursor = (trailCursor + 1) % TRAIL_MAX;

  trailPosArr[idx * 3] = pos.x;
  trailPosArr[idx * 3 + 1] = pos.y;
  trailPosArr[idx * 3 + 2] = pos.z;

  trailVel[idx].copy(vel);
  trailLife[idx] = life;
  trailMaxLife[idx] = maxLife;
  trailActive[idx] = 1;
  trailType[idx] = type;

  // 诞生瞬间根据精确子步进时间计算黑体辐射光谱，与前一帧存量粒子实现数学级无缝衔接
  const progress = Math.max(0, life / maxLife);
  const col = getPlumeColor(progress, type, spdRatio);
  const alphaBase = 0.92 + spdRatio * 0.08;
  const fadeZone = 0.28;
  const alpha = (progress > fadeZone ? 1.0 : (progress / fadeZone)) * alphaBase;
  trailColArr[idx * 3] = col.r * alpha;
  trailColArr[idx * 3 + 1] = col.g * alpha;
  trailColArr[idx * 3 + 2] = col.b * alpha;
}

const AUX_NOZZLES_T3 = Object.freeze([
  { pos: [-0.72, -0.06, 0.85], isLeft: true },
  { pos: [0.72, -0.06, 0.85], isLeft: false }
]);
const AUX_NOZZLES_T5 = Object.freeze([
  { pos: [-0.72, -0.06, 0.85], isLeft: true },
  { pos: [0.72, -0.06, 0.85], isLeft: false },
  { pos: [-0.46, 0.36, 1.30], isLeft: true },
  { pos: [0.46, 0.36, 1.30], isLeft: false }
]);
const EMPTY_AUX_NOZZLES = Object.freeze([]);

export function updateShipTrail(dt, t) {
  if (!trailPoints) initShipTrailEmitter();
  // 确保尾喷粒子挂载于战机本体，杜绝机动机身位移脱节
  if (view.ship && trailPoints.parent !== view.ship) {
    view.ship.add(trailPoints);
  }

  // 航速动力学归一化参数：26 (开局低速巡航) -> 72 (极速全加力暴烈状态)
  const spdRatio = Math.max(0, Math.min(1, (run.speed - 26) / 46));

  // 粒子发光体量尺寸：开局 0.28 (短粗饱满) -> 极速 0.34 (雄浑火炬)，双发之间保持 0.30 单位清晰间距
  trailPoints.material.size = 0.28 + spdRatio * 0.06;

  // 接入 run.timeScale 支持子弹时间慢动作流速
  const effDt = dt * (run.timeScale !== undefined ? run.timeScale : 1.0);
  const dragFactor = Math.exp(-2.0 * effDt);

  // ── 阶段 1：先更新上一帧存量粒子的物理位移与热力学衰减 ──
  // 核心逻辑颠覆：先更新后发射，杜绝同一帧内新粒子被向后推离导致喷口出现空隙断层！
  let hasActive = false;
  for (let i = 0; i < TRAIL_MAX; i++) {
    if (!trailActive[i]) continue;
    trailLife[i] -= effDt;
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
    v.x *= dragFactor;
    v.y *= dragFactor;
    // 阻尼适度加大，使尾流在短距离内快速降速并羽化消散，形成短粗有力轮廓
    v.z *= dragFactor;

    trailPosArr[i * 3] += v.x * effDt;
    trailPosArr[i * 3 + 1] += v.y * effDt;
    trailPosArr[i * 3 + 2] += v.z * effDt;

    const progress = Math.max(0, trailLife[i] / trailMaxLife[i]);
    const col = getPlumeColor(progress, trailType[i], spdRatio);
    // 喷口爆发区全饱和，低速柔和羽化，高速烈焰贯穿
    const alphaBase = 0.92 + spdRatio * 0.08;
    const fadeZone = 0.28;
    const alpha = (progress > fadeZone ? 1.0 : (progress / fadeZone)) * alphaBase;
    trailColArr[i * 3] = col.r * alpha;
    trailColArr[i * 3 + 1] = col.g * alpha;
    trailColArr[i * 3 + 2] = col.b * alpha;
  }

  // ── 阶段 2：在喷口喉部发射当前帧新粒子，紧密无隙填充从喷口到位移前沿的整个空间 ──
  if (run.state === 'playing' && view.ship && view.ship.visible) {
    // 左右变轨动力学系数（-1 到 +1）
    const steer = Math.max(-1, Math.min(1, run.latVel / (10 + run.speed * 0.16)));
    const p = view.ship.userData;
    const thrusters = (p && p.thrusters) || null;
    const nozzleRadius = 0.062;

    // 单发单帧基础发射量：开局 6 颗/发 -> 极速 9 颗/发，形成短粗致密火炬
    const baseCount = 6.0 + spdRatio * 3.0;

    // 主引擎喷口（左右各一，本体局部坐标系）
    for (let k = 0; k < 2; k++) {
      const isLeft = k === 0;
      // 变轨机动推力加力：内侧引擎维持 100% 满额基准密度，外侧发动机爆发增压
      const steerBoost = isLeft ? Math.max(0, steer * 0.35) : Math.max(0, -steer * 0.35);
      const spawnCount = Math.round(baseCount * (1.0 + steerBoost * 0.35));
      const thrusterObj = thrusters ? thrusters[k] : null;

      // 喷管推力矢量偏转角（与 ship-pose.js 中的 thruster.group.rotation.y = -steer * 0.22 严格同步）
      const tvcAngle = thrusterObj && thrusterObj.group ? thrusterObj.group.rotation.y : (-steer * 0.22);
      const cosTvc = Math.cos(tvcAngle);
      const sinTvc = Math.sin(tvcAngle);

      // 喷管基准局部坐标 (x: ±0.3, y: 0, z: 1.02)
      const baseX = thrusterObj ? thrusterObj.x : (isLeft ? -0.3 : 0.3);
      const baseY = 0;
      const baseZ = 1.02;

      // 偏转后喷口面局部中心 (圆柱高 0.28，后沿面偏移 0.14)
      const nozzleCenX = baseX + sinTvc * 0.14;
      const nozzleCenY = baseY;
      const nozzleCenZ = baseZ + cosTvc * 0.14;

      // 喷射初速收敛：短促高能排气（开局 16 m/s -> 极速 26 m/s，外侧爆发达 30 m/s）
      const speedBase = (16.0 + spdRatio * 10.0) * (1.0 + steerBoost * 0.18);
      const frameTravel = speedBase * Math.min(effDt, 0.035);

      for (let s = 0; s < spawnCount; s++) {
        // 真机双层物理发射结构：中心白炽马赫针 (Core) + 外围膨胀烈焰火炬 (Sheath)
        const isCore = Math.random() < (0.35 + spdRatio * 0.15);
        let r, coneSpread, type;

        if (isCore) {
          // 超音速白炽马赫内芯（轴向聚焦、短粗高亮白炽光核）
          r = nozzleRadius * 0.30 * Math.sqrt(Math.random());
          coneSpread = 0.005 + 0.008 * (r / nozzleRadius);
          type = 1;
        } else {
          // 气动膨胀烈焰外羽（自然张开成短粗锥形火炬）
          r = nozzleRadius * (0.30 + 0.60 * Math.sqrt(Math.random()));
          coneSpread = 0.012 + 0.018 * (r / nozzleRadius);
          type = 0;
        }

        // 子帧均匀微插值：从 0 (当前瞬间喷口出口) 连续延伸至 1 (上一帧位移前沿)
        const frac = (s + Math.random()) / spawnCount;
        const angle = Math.random() * Math.PI * 2;

        // 喷口圆盘法向微分散
        const discX = Math.cos(angle) * r;
        const discY = Math.sin(angle) * r;

        // 旋转对齐到偏转喷管局部坐标轴
        const spawnX = nozzleCenX + cosTvc * discX;
        const spawnY = nozzleCenY + discY;
        const spawnZ = nozzleCenZ - sinTvc * discX;

        // 数学级无隙子帧连续流体插值：严格从喷口喉部 0 距离均匀覆盖到 frameTravel
        const axialDist = frac * frameTravel;
        _vNozzleLocal.set(
          spawnX + sinTvc * axialDist,
          spawnY,
          spawnZ + cosTvc * axialDist
        );

        // 喷射初速：内芯有额外 12% 动能超音速贯穿
        const coreBoost = isCore ? 1.12 : 1.0;
        const jetSpeed = (speedBase * coreBoost) + (Math.random() - 0.5) * 1.5;

        _vDir.set(
          sinTvc * jetSpeed + cosTvc * (discX / nozzleRadius) * jetSpeed * coneSpread,
          (discY / nozzleRadius) * jetSpeed * coneSpread,
          cosTvc * jetSpeed - sinTvc * (discX / nozzleRadius) * jetSpeed * coneSpread
        );

        // 粒子寿命大幅压缩：开局 0.062s (延伸约 1.0m) -> 极速 0.090s (延伸约 2.3m)，实现短粗精悍
        const maxLife = (0.062 + spdRatio * 0.028) * (0.94 + Math.random() * 0.12);
        const curLife = Math.max(0.01, maxLife - frac * effDt);
        spawnTrailParticleWithColor(_vNozzleLocal, _vDir, type, curLife, maxLife, spdRatio);
        hasActive = true;
      }
    }

    // 辅助升级引擎（T3 翼下引擎 & T5 背部推进器，均为飞船本体局部坐标）
    const auxNozzles = run.tier >= 5 ? AUX_NOZZLES_T5 : (run.tier >= 3 ? AUX_NOZZLES_T3 : EMPTY_AUX_NOZZLES);

    const auxCount = Math.max(1, Math.round(1.0 + spdRatio * 1.5));
    for (let k = 0; k < auxNozzles.length; k++) {
      const n = auxNozzles[k];
      const steerBoost = n.isLeft ? Math.max(0, steer * 0.25) : Math.max(0, -steer * 0.25);
      const speedAux = (14.0 + spdRatio * 10.0) * (1.0 + steerBoost * 0.15);
      const frameTravelAux = speedAux * Math.min(effDt, 0.035);

      for (let s = 0; s < auxCount; s++) {
        const frac = (s + Math.random()) / auxCount;
        const angle = Math.random() * Math.PI * 2;
        const r = 0.030 * Math.sqrt(Math.random());
        _vNozzleLocal.set(
          n.pos[0] + Math.cos(angle) * r,
          n.pos[1] + Math.sin(angle) * r,
          n.pos[2] + frac * frameTravelAux
        );
        _vDir.set(
          (Math.random() - 0.5) * 1.0,
          (Math.random() - 0.5) * 1.0,
          speedAux
        );
        const maxLife = (0.055 + spdRatio * 0.025) * (0.92 + Math.random() * 0.16);
        const curLife = Math.max(0.01, maxLife - frac * effDt);
        spawnTrailParticleWithColor(_vNozzleLocal, _vDir, 0, curLife, maxLife, spdRatio);
        hasActive = true;
      }
    }
  }

  trailPosAttr.needsUpdate = true;
  trailColAttr.needsUpdate = true;
  trailPoints.visible = hasActive || (run.state === 'playing');
}

// ── 飞船三维结构残骸池（Zero-GC 预分配，20 块真实部件几何） ──
export const shipWreckagePool = [];
const WRECKAGE_COUNT = 20;
let wreckageInitialized = false;

const carbonArmorMat = new THREE.MeshBasicMaterial({ color: 0x121224 });
const plateMat = new THREE.MeshBasicMaterial({ color: 0x1b1b36 });
const cyanGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, fog: false });
const canopyGlassMat = new THREE.MeshBasicMaterial({
  color: 0x66ffff,
  transparent: true,
  opacity: 0.88,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false
});
const hotCoreMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false
});
const enginePodMat = new THREE.MeshBasicMaterial({ color: 0x222238 });

export function initShipWreckage() {
  if (wreckageInitialized) return;
  wreckageInitialized = true;

  const defs = [
    { geo: new THREE.ConeGeometry(0.36, 1.3, 4), mat: carbonArmorMat, radius: 0.18, offset: [0, 0.05, -0.7], rot: [-Math.PI / 2, 0, 0] },
    { geo: new THREE.TetrahedronGeometry(0.22), mat: canopyGlassMat, radius: 0.12, offset: [0, 0.28, -0.2], rot: [0.2, 0, 0] },
    { geo: new THREE.OctahedronGeometry(0.20), mat: canopyGlassMat, radius: 0.12, offset: [0, 0.30, 0.05], rot: [-0.3, 0.4, 0] },
    { geo: new THREE.BoxGeometry(0.42, 0.24, 0.42), mat: plateMat, radius: 0.16, offset: [0, 0.18, -0.05], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.92, 0.07, 0.68), mat: carbonArmorMat, radius: 0.14, offset: [-0.62, 0.02, 0.22], rot: [0, 0.15, -0.1] },
    { geo: new THREE.BoxGeometry(0.72, 0.05, 0.44), mat: plateMat, radius: 0.12, offset: [-1.28, 0.06, 0.42], rot: [0, 0.25, -0.2] },
    { geo: new THREE.BoxGeometry(0.32, 0.18, 0.30), mat: cyanGlowMat, radius: 0.10, offset: [-1.75, 0.16, 0.58], rot: [0, 0, 0.5] },
    { geo: new THREE.BoxGeometry(0.92, 0.07, 0.68), mat: carbonArmorMat, radius: 0.14, offset: [0.62, 0.02, 0.22], rot: [0, -0.15, 0.1] },
    { geo: new THREE.BoxGeometry(0.72, 0.05, 0.44), mat: plateMat, radius: 0.12, offset: [1.28, 0.06, 0.42], rot: [0, -0.25, 0.2] },
    { geo: new THREE.BoxGeometry(0.32, 0.18, 0.30), mat: cyanGlowMat, radius: 0.10, offset: [1.75, 0.16, 0.58], rot: [0, 0, -0.5] },
    { geo: new THREE.BoxGeometry(0.44, 0.04, 0.24), mat: carbonArmorMat, radius: 0.10, offset: [-0.42, 0.08, -0.46], rot: [0.1, 0.2, 0] },
    { geo: new THREE.BoxGeometry(0.44, 0.04, 0.24), mat: carbonArmorMat, radius: 0.10, offset: [0.42, 0.08, -0.46], rot: [0.1, -0.2, 0] },
    { geo: new THREE.BoxGeometry(0.09, 0.56, 0.88), mat: plateMat, radius: 0.18, offset: [0, 0.34, 0.44], rot: [0, 0, 0] },
    { geo: new THREE.CylinderGeometry(0.12, 0.15, 0.76, 8), mat: enginePodMat, radius: 0.16, offset: [-0.34, 0.02, 0.94], rot: [Math.PI / 2, 0, 0.15] },
    { geo: new THREE.CylinderGeometry(0.12, 0.15, 0.76, 8), mat: enginePodMat, radius: 0.16, offset: [0.34, 0.02, 0.94], rot: [Math.PI / 2, 0, -0.15] },
    { geo: new THREE.BoxGeometry(0.50, 0.22, 0.98), mat: carbonArmorMat, radius: 0.18, offset: [0, -0.02, 0.36], rot: [0, 0, 0] },
    { geo: new THREE.OctahedronGeometry(0.24), mat: hotCoreMat, radius: 0.14, offset: [0, 0.12, 0.48], rot: [0.4, 0.4, 0] },
    { geo: new THREE.BoxGeometry(0.38, 0.05, 0.56), mat: plateMat, radius: 0.12, offset: [-0.36, 0.14, 0.16], rot: [0, 0, -0.3] },
    { geo: new THREE.BoxGeometry(0.38, 0.05, 0.56), mat: plateMat, radius: 0.12, offset: [0.36, 0.14, 0.16], rot: [0, 0, 0.3] },
    { geo: new THREE.BoxGeometry(0.68, 0.16, 0.26), mat: cyanGlowMat, radius: 0.14, offset: [0, -0.06, 1.12], rot: [0, 0, 0] }
  ];

  for (let i = 0; i < WRECKAGE_COUNT; i++) {
    const d = defs[i];
    const mesh = new THREE.Mesh(d.geo, d.mat);
    mesh.visible = false;
    view.scene.add(mesh);

    shipWreckagePool.push({
      mesh,
      baseRadius: d.radius,
      defaultOffset: new THREE.Vector3(...d.offset),
      defaultRot: new THREE.Euler(...d.rot),
      vel: new THREE.Vector3(),
      rotVel: new THREE.Vector3(),
      active: false,
      bounces: 0,
      grounded: false
    });
  }
}

export function spawnShipWreckage(ship, speed = 30, latVel = 0) {
  if (!wreckageInitialized) initShipWreckage();
  const shipPos = ship.position;
  const shipRot = ship.rotation;
  const spdNorm = Math.min(2.2, Math.max(0.8, speed / 28));

  for (let i = 0; i < shipWreckagePool.length; i++) {
    const part = shipWreckagePool[i];
    part.active = true;
    part.bounces = 0;
    part.grounded = false;

    const worldOffset = part.defaultOffset.clone().applyEuler(shipRot);
    part.mesh.position.copy(shipPos).add(worldOffset);

    part.mesh.rotation.set(
      shipRot.x + part.defaultRot.x,
      shipRot.y + part.defaultRot.y,
      shipRot.z + part.defaultRot.z
    );

    const isLeft = part.defaultOffset.x < -0.15;
    const isRight = part.defaultOffset.x > 0.15;
    const isFront = part.defaultOffset.z < -0.1;
    const isRear = part.defaultOffset.z > 0.6;
    const isCore = i === 1 || i === 2 || i === 16;

    let vx = (Math.random() - 0.5) * 4.5 + latVel * 0.35;
    if (isLeft) vx -= (6.5 + Math.random() * 8.5) * spdNorm;
    else if (isRight) vx += (6.5 + Math.random() * 8.5) * spdNorm;

    let vy = (3.5 + Math.random() * 6.5) * spdNorm;
    if (isFront) vy += 4.5;
    if (isCore) vy += 5.5;

    let vz = (Math.random() - 0.5) * 5.0;
    if (isFront) vz += (5.0 + Math.random() * 6.5) * spdNorm;
    else if (isRear) vz -= (4.5 + Math.random() * 7.5) * spdNorm;

    part.vel.set(vx, vy, vz);

    part.rotVel.set(
      (Math.random() - 0.5) * 28 * spdNorm,
      (Math.random() - 0.5) * 26 * spdNorm,
      (Math.random() - 0.5) * 30 * spdNorm
    );

    part.mesh.visible = true;
  }
}

export function updateShipWreckage(pdt) {
  if (!wreckageInitialized) return;
  const floorY = 0.08;

  for (let i = 0; i < shipWreckagePool.length; i++) {
    const p = shipWreckagePool[i];
    if (!p.active) continue;

    if (!p.grounded) {
      p.vel.y -= 13.5 * pdt;
      const airDrag = Math.exp(-1.35 * pdt);
      p.vel.x *= airDrag;
      p.vel.z *= airDrag;

      p.mesh.position.x += p.vel.x * pdt;
      p.mesh.position.y += p.vel.y * pdt;
      p.mesh.position.z += p.vel.z * pdt;

      p.mesh.rotation.x += p.rotVel.x * pdt;
      p.mesh.rotation.y += p.rotVel.y * pdt;
      p.mesh.rotation.z += p.rotVel.z * pdt;

      const groundContactY = floorY + p.baseRadius * 0.45;
      if (p.mesh.position.y <= groundContactY) {
        p.mesh.position.y = groundContactY;
        if (Math.abs(p.vel.y) > 1.35 && p.bounces < 2) {
          p.vel.y = -p.vel.y * 0.32;
          p.vel.x *= 0.62;
          p.vel.z *= 0.62;
          p.rotVel.multiplyScalar(0.55);
          p.bounces++;
          burst(p.mesh.position, 0xffaa00, 0.16, 0.22, 0.55, 6);
        } else {
          p.vel.y = 0;
          p.grounded = true;
        }
      }
    } else {
      const groundFriction = Math.exp(-4.6 * pdt);
      p.vel.x *= groundFriction;
      p.vel.z *= groundFriction;

      p.mesh.position.x += p.vel.x * pdt;
      p.mesh.position.z += p.vel.z * pdt;

      p.rotVel.multiplyScalar(Math.exp(-5.8 * pdt));
      p.mesh.rotation.x += p.rotVel.x * pdt;
      p.mesh.rotation.y += p.rotVel.y * pdt;
      p.mesh.rotation.z += p.rotVel.z * pdt;

      const hSpeedSq = p.vel.x * p.vel.x + p.vel.z * p.vel.z;
      if (hSpeedSq > 1.8 && Math.random() < 0.12) {
        burst(p.mesh.position, 0xffbb22, 0.14, 0.16, 0.35, 3);
      } else if (hSpeedSq < 0.03) {
        p.vel.set(0, 0, 0);
        p.rotVel.set(0, 0, 0);
      }
    }
  }
}

export function resetShipWreckage() {
  if (!wreckageInitialized) return;
  for (let i = 0; i < shipWreckagePool.length; i++) {
    const p = shipWreckagePool[i];
    p.active = false;
    p.grounded = false;
    p.bounces = 0;
    p.vel.set(0, 0, 0);
    p.rotVel.set(0, 0, 0);
    p.mesh.visible = false;
  }
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

  for (let i = 0; i < shardPool.length; i++) {
    const s = shardPool[i];
    s.active = false;
    s.mesh.visible = false;
  }

  for (let i = 0; i < orbShardPool.length; i++) {
    const s = orbShardPool[i];
    s.active = false;
    s.mesh.visible = false;
  }

  resetShipWreckage();

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

// ── 复合爆炸宏（包含机体物理炸裂与等离子过载大爆炸） ──
export function explode(pos, ship = null, speed = 30, latVel = 0) {
  if (ship) {
    spawnShipWreckage(ship, speed, latVel);
  }
  // 核心聚变反应堆大爆炸：纯白高光等离子 + 电离青蓝激波 + 烈焰橙红飞溅
  burst(pos, 0xffffff, 0.35, 0.55, 1.6, 40);
  burst(pos, 0x00ffff, 0.28, 0.65, 1.4, 48);
  burst(pos, 0xff5500, 0.26, 0.85, 1.3, 56);
  spawnShockwave(pos, 0xffffff, 2.2);
  spawnShockwave({ x: pos.x, y: pos.y + 0.2, z: pos.z - 0.5 }, 0x00ffff, 1.8);
}

export function shieldBreakFx() {
  spawnShockwave(view.ship.position, 0x00ffff, 1.4);
  burst(view.ship.position, 0x00ffff, 0.25, 0.45, 1.2, 40);
  ui.flash('#00ffff', 0.18, 250);
  ui.toast('护盾破碎!', '#00ffff');
  run.shakeTime = Math.max(run.shakeTime, 0.45);
  playSound('shieldBreak');
}
