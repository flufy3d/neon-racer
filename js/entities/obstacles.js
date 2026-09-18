import { LANES } from '../core/constants.js';
import { archBeamGeo, archFrameMat, archNeonGeo, archNeonMat, archPillarGeo, armorCoreGeo, armorCoreMat, armorPillarGeo, armorPillarMat, armorRingGeo, armorRingMat, beaconBaseGeo, beaconBeamMat, beaconCoreGeo, beaconPillarGeo, beaconRingMat, gateBodyMat, gateBottomGeo, gateBoxGeo, gateCableGeo, gateCableMat, gateCoreMat, gateEdgeMat, gateEdgesGeo, gateScanGeo, lowBodyMat, lowBoxGeo, lowCoreMat, lowEdgeMat, lowEdgesGeo, lowGuideGeo, lowScanGeo, orbCoreGeo, orbCoreMat, orbInnerRingGeo, orbOuterRingGeo, orbRingMat1, orbRingMat2, pillarGeo, pillarMat, relayBaseGeo, relayCoreGeo, relayPillarGeo, relayRingGeo, towerBeaconGeo, towerBodyMat, towerCapGeo, towerCapMat, towerGeo1, towerSpireMat, wallBodyMat, wallBoxGeo, wallCoreMat, wallEdgeMat, wallEdgesGeo, wallPylonGeo, wallScanGeo } from '../scene/materials.js';
import { armorHaloMat, orbHaloMat } from '../scene/textures.js';
import * as THREE from 'three';

export function makeWall(lane, z) {
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

export function makeLow(lane, z) {
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

// 悬挂闸门：闸体占据 1.75~4.65 高度，下沿亮条为碰撞警示线，缆索向上没入远景
export function makeGate(lane, z) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(gateBoxGeo, gateBodyMat);
  b.position.y = 3.2;
  const e = new THREE.LineSegments(gateEdgesGeo, gateEdgeMat);
  e.position.y = 3.2;
  const scan = new THREE.Mesh(gateScanGeo, gateCoreMat);
  scan.position.y = 3.2;
  const bottom = new THREE.Mesh(gateBottomGeo, gateCoreMat);
  bottom.position.y = 1.78;
  const cableL = new THREE.Mesh(gateCableGeo, gateCableMat);
  cableL.position.set(-0.9, 5.95, 0);
  const cableR = new THREE.Mesh(gateCableGeo, gateCableMat);
  cableR.position.set(0.9, 5.95, 0);
  g.add(b, e, scan, bottom, cableL, cableR);
  g.position.set(LANES[lane], 0, z);
  g.userData = { type: 'gate', lane, scan, bottom, phase: Math.random() * Math.PI * 2 };
  return g;
}

export function makeOrb(x, y, z) {
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
    spawnX: x,
    baseY: y,
    phase: Math.random() * Math.PI * 2,
    core,
    innerRing,
    outerRing
  };
  g.position.set(x, y, z);
  return g;
}

// ── 能量球渲染：InstancedMesh（核心球 + 内/外陀螺环各 1 次 draw call，
// 光晕用单批 Points 代替逐个 Sprite），全场景能量球合计仅 4 次 draw call。
// 实体状态改为纯数据记录（不再每球一棵 Object3D 子树），pickups 每帧写字段，
// syncOrbInstances() 统一合成实例矩阵。 ──
export const ORB_POOL_CAPACITY = 72;
export const orbPool = [];

let orbCoreMesh = null;
let orbInnerMesh = null;
let orbOuterMesh = null;
let orbHaloPoints = null;
let orbHaloPosArr = null;
let orbHaloPosAttr = null;
const _orbDummy = new THREE.Object3D();

function setOrbInstanceCount(n) {
  orbCoreMesh.count = n;
  orbInnerMesh.count = n;
  orbOuterMesh.count = n;
  orbHaloPoints.geometry.setDrawRange(0, n);
}

export function initOrbPool(scene) {
  if (orbPool.length > 0) return;
  orbCoreMesh = new THREE.InstancedMesh(orbCoreGeo, orbCoreMat, ORB_POOL_CAPACITY);
  orbInnerMesh = new THREE.InstancedMesh(orbInnerRingGeo, orbRingMat1, ORB_POOL_CAPACITY);
  orbOuterMesh = new THREE.InstancedMesh(orbOuterRingGeo, orbRingMat2, ORB_POOL_CAPACITY);
  for (const mesh of [orbCoreMesh, orbInnerMesh, orbOuterMesh]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    if (scene) scene.add(mesh);
  }

  orbHaloPosArr = new Float32Array(ORB_POOL_CAPACITY * 3);
  for (let i = 0; i < ORB_POOL_CAPACITY; i++) {
    orbPool.push({
      active: false,
      x: 0, y: -999, z: 0, baseY: 1.2, phase: 0, yaw: 0,
      innerRx: Math.PI / 2, innerRz: 0,
      outerRy: Math.PI / 4, outerRx: 0
    });
  }
  orbHaloPosAttr = new THREE.BufferAttribute(orbHaloPosArr, 3);
  orbHaloPosAttr.setUsage(THREE.DynamicDrawUsage);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', orbHaloPosAttr);
  orbHaloPoints = new THREE.Points(haloGeo, new THREE.PointsMaterial({
    size: 1.9,
    map: orbHaloMat.map,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  }));
  orbHaloPoints.frustumCulled = false;
  if (scene) scene.add(orbHaloPoints);

  setOrbInstanceCount(0);
}

export function spawnPooledOrb(scene, x, y, z) {
  if (orbPool.length === 0) initOrbPool(scene);
  // 池满时复用最早的一颗（InstancedMesh 容量固定，不能像原实现那样无限新建）
  const o = orbPool.find(item => !item.active) || orbPool[0];
  o.x = x;
  o.y = y;
  o.z = z;
  o.baseY = y;
  o.phase = Math.random() * Math.PI * 2;
  o.yaw = 0;
  o.innerRx = Math.PI / 2;
  o.innerRz = 0;
  o.outerRy = Math.PI / 4;
  o.outerRx = 0;
  o.active = true;
  return o;
}

export function releasePooledOrb(o) {
  o.active = false;
}

export function resetOrbPool() {
  for (const o of orbPool) o.active = false;
  if (orbPool.length > 0) setOrbInstanceCount(0);
}

// 每帧由 pickups 调用：把活动记录紧凑打包进 0..n-1 实例槽位，
// 并把 count / drawRange 收缩到实际数量，避免为 72 个空槽付顶点开销。
export function syncOrbInstances() {
  if (orbPool.length === 0) return;
  let n = 0;
  for (let i = 0; i < orbPool.length; i++) {
    const o = orbPool[i];
    if (!o.active) continue;

    _orbDummy.position.set(o.x, o.y, o.z);
    _orbDummy.rotation.set(0, o.yaw, 0);
    _orbDummy.scale.set(1, 1, 1);
    _orbDummy.updateMatrix();
    orbCoreMesh.setMatrixAt(n, _orbDummy.matrix);

    _orbDummy.rotation.set(o.innerRx, 0, o.innerRz);
    _orbDummy.updateMatrix();
    orbInnerMesh.setMatrixAt(n, _orbDummy.matrix);

    _orbDummy.rotation.set(o.outerRx, o.outerRy, 0);
    _orbDummy.updateMatrix();
    orbOuterMesh.setMatrixAt(n, _orbDummy.matrix);

    orbHaloPosArr[n * 3] = o.x;
    orbHaloPosArr[n * 3 + 1] = o.y;
    orbHaloPosArr[n * 3 + 2] = o.z;
    n++;
  }
  setOrbInstanceCount(n);
  orbCoreMesh.instanceMatrix.needsUpdate = true;
  orbInnerMesh.instanceMatrix.needsUpdate = true;
  orbOuterMesh.instanceMatrix.needsUpdate = true;
  orbHaloPosAttr.clearUpdateRanges();
  orbHaloPosAttr.addUpdateRange(0, n * 3);
  orbHaloPosAttr.needsUpdate = true;
}

// 护甲核心：高饱和绿色大晶体 + 绿色光晕 + 顶天立地光柱，远距离即可与能量球区分
export function makeArmorCore(x, y, z) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(armorCoreGeo, armorCoreMat);
  const halo = new THREE.Sprite(armorHaloMat);
  halo.scale.set(3.2, 3.2, 1);
  core.add(halo);
  const ring = new THREE.Mesh(armorRingGeo, armorRingMat);
  ring.rotation.x = Math.PI / 2;
  const pillar = new THREE.Mesh(armorPillarGeo, armorPillarMat);
  g.add(core, ring, pillar);
  g.userData = { spawnX: x, baseY: y, phase: Math.random() * Math.PI * 2, core, ring, pillar };
  g.position.set(x, y, z);
  return g;
}

export const ARMOR_POOL_CAPACITY = 4;
export const armorPool = [];

export function initArmorPool(scene) {
  if (armorPool.length > 0) return;
  for (let i = 0; i < ARMOR_POOL_CAPACITY; i++) {
    const o = makeArmorCore(0, -999, 0);
    o.visible = false;
    o.userData.active = false;
    armorPool.push(o);
    if (scene) scene.add(o);
  }
}

export function spawnPooledArmor(scene, x, y, z) {
  if (armorPool.length === 0 && scene) initArmorPool(scene);
  let o = armorPool.find(c => !c.userData.active);
  if (!o) {
    o = makeArmorCore(0, -999, 0);
    armorPool.push(o);
    if (scene) scene.add(o);
  }
  o.position.set(x, y, z);
  o.rotation.set(0, 0, 0);
  o.userData.spawnX = x;
  o.userData.baseY = y;
  o.userData.phase = Math.random() * Math.PI * 2;
  o.userData.active = true;
  o.userData.hint = false;
  o.userData.hintShown = false;
  o.userData.hintRinged = false;
  o.visible = true;
  if (o.userData.ring) o.userData.ring.rotation.set(Math.PI / 2, 0, 0);
  return o;
}

export function releasePooledArmor(o) {
  o.visible = false;
  o.userData.active = false;
  o.position.set(0, -999, 0);
}

export function resetArmorPool() {
  for (const o of armorPool) {
    o.visible = false;
    o.userData.active = false;
    o.position.set(0, -999, 0);
  }
}

export const OBSTACLE_POOL_CAPACITY = 24;
export const GATE_POOL_CAPACITY = 14;
export const wallPool = [];
export const lowPool = [];
export const gatePool = [];

export function initObstaclePool(scene) {
  if (wallPool.length === 0) {
    for (let i = 0; i < OBSTACLE_POOL_CAPACITY; i++) {
      const w = makeWall(0, -999);
      w.visible = false;
      w.userData.active = false;
      w.userData.passed = false;
      wallPool.push(w);
      if (scene) scene.add(w);
    }
  }
  if (lowPool.length === 0) {
    for (let i = 0; i < OBSTACLE_POOL_CAPACITY; i++) {
      const l = makeLow(0, -999);
      l.visible = false;
      l.userData.active = false;
      l.userData.passed = false;
      lowPool.push(l);
      if (scene) scene.add(l);
    }
  }
  if (gatePool.length === 0) {
    for (let i = 0; i < GATE_POOL_CAPACITY; i++) {
      const g = makeGate(0, -999);
      g.visible = false;
      g.userData.active = false;
      g.userData.passed = false;
      gatePool.push(g);
      if (scene) scene.add(g);
    }
  }
}

export function spawnPooledObstacle(scene, type, lane, z) {
  const pool = type === 'wall' ? wallPool : type === 'gate' ? gatePool : lowPool;
  if (pool.length === 0 && scene) initObstaclePool(scene);
  let obj = pool.find(o => !o.userData.active);
  if (!obj) {
    obj = type === 'wall' ? makeWall(lane, z) : type === 'gate' ? makeGate(lane, z) : makeLow(lane, z);
    pool.push(obj);
    if (scene) scene.add(obj);
  }
  obj.position.set(LANES[lane], 0, z);
  obj.rotation.set(0, 0, 0);
  obj.scale.set(1, 1, 1);
  obj.userData.lane = lane;
  obj.userData.active = true;
  obj.userData.passed = false;
  obj.userData.phase = Math.random() * Math.PI * 2;
  // 首次登场高亮引导标记（由 spawner 置位，world/pickups 消费）
  obj.userData.hint = false;
  obj.userData.hintShown = false;
  obj.userData.hintRinged = false;

  if (type === 'wall') {
    if (obj.userData.scan) obj.userData.scan.position.y = 1.6;
    if (obj.userData.leftPylon) obj.userData.leftPylon.scale.set(1, 1, 1);
    if (obj.userData.rightPylon) obj.userData.rightPylon.scale.set(1, 1, 1);
  } else if (type === 'gate') {
    if (obj.userData.scan) obj.userData.scan.position.y = 3.2;
    if (obj.userData.bottom) obj.userData.bottom.position.y = 1.78;
  } else if (type === 'low') {
    if (obj.userData.scan) obj.userData.scan.scale.set(1, 1, 1);
    if (obj.userData.guide) obj.userData.guide.scale.set(1, 1, 1);
  }

  obj.visible = true;
  return obj;
}

export function releasePooledObstacle(obj) {
  obj.visible = false;
  obj.userData.active = false;
  obj.userData.passed = false;
  obj.position.set(0, -999, 0);
}

export function resetObstaclePool() {
  for (const w of wallPool) {
    releasePooledObstacle(w);
  }
  for (const l of lowPool) {
    releasePooledObstacle(l);
  }
  for (const g of gatePool) {
    releasePooledObstacle(g);
  }
}

export function makePillar(z) {
  const p = new THREE.Mesh(pillarGeo, pillarMat);
  p.position.set(Math.random() < 0.5 ? -7.5 : 7.5, 2.5, z);
  return p;
}

export function makeRoadsideStructure(side, z) {
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

export function makeRoadsideRelay(side, z) {
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

export function makeOverheadArch(z) {
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

export function makeWarpBeacon(side, z) {
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

