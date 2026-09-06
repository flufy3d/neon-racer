import { LANES } from '../core/constants.js';
import { archBeamGeo, archFrameMat, archNeonGeo, archNeonMat, archPillarGeo, beaconBaseGeo, beaconBeamMat, beaconCoreGeo, beaconPillarGeo, beaconRingMat, lowBodyMat, lowBoxGeo, lowCoreMat, lowEdgeMat, lowEdgesGeo, lowGuideGeo, lowScanGeo, orbCoreGeo, orbCoreMat, orbInnerRingGeo, orbOuterRingGeo, orbRingMat1, orbRingMat2, pillarGeo, pillarMat, relayBaseGeo, relayCoreGeo, relayPillarGeo, relayRingGeo, towerBeaconGeo, towerBodyMat, towerCapGeo, towerCapMat, towerGeo1, towerSpireMat, wallBodyMat, wallBoxGeo, wallCoreMat, wallEdgeMat, wallEdgesGeo, wallPylonGeo, wallScanGeo } from '../scene/materials.js';
import { orbHaloMat } from '../scene/textures.js';
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
    baseY: y,
    phase: Math.random() * Math.PI * 2,
    core,
    innerRing,
    outerRing
  };
  g.position.set(x, y, z);
  return g;
}

export const ORB_POOL_CAPACITY = 72;
export const orbPool = [];

export function initOrbPool(scene) {
  if (orbPool.length > 0) return;
  for (let i = 0; i < ORB_POOL_CAPACITY; i++) {
    const orb = makeOrb(0, -999, 0);
    orb.visible = false;
    orb.userData.active = false;
    orbPool.push(orb);
    if (scene) scene.add(orb);
  }
}

export function spawnPooledOrb(scene, x, y, z) {
  if (orbPool.length === 0 && scene) initOrbPool(scene);
  let orb = orbPool.find(o => !o.userData.active);
  if (!orb) {
    orb = makeOrb(0, -999, 0);
    orbPool.push(orb);
    if (scene) scene.add(orb);
  }
  orb.position.set(x, y, z);
  orb.rotation.set(0, 0, 0);
  orb.userData.baseY = y;
  orb.userData.phase = Math.random() * Math.PI * 2;
  orb.userData.active = true;
  orb.visible = true;
  if (orb.userData.innerRing) {
    orb.userData.innerRing.rotation.set(Math.PI / 2, 0, 0);
  }
  if (orb.userData.outerRing) {
    orb.userData.outerRing.rotation.set(0, Math.PI / 4, 0);
  }
  return orb;
}

export function releasePooledOrb(orb) {
  orb.visible = false;
  orb.userData.active = false;
  orb.position.set(0, -999, 0);
}

export function resetOrbPool() {
  for (const orb of orbPool) {
    orb.visible = false;
    orb.userData.active = false;
    orb.position.set(0, -999, 0);
  }
}

export const OBSTACLE_POOL_CAPACITY = 24;
export const wallPool = [];
export const lowPool = [];

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
}

export function spawnPooledObstacle(scene, type, lane, z) {
  const pool = type === 'wall' ? wallPool : lowPool;
  if (pool.length === 0 && scene) initObstaclePool(scene);
  let obj = pool.find(o => !o.userData.active);
  if (!obj) {
    obj = type === 'wall' ? makeWall(lane, z) : makeLow(lane, z);
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

  if (type === 'wall') {
    if (obj.userData.scan) obj.userData.scan.position.y = 1.6;
    if (obj.userData.leftPylon) obj.userData.leftPylon.scale.set(1, 1, 1);
    if (obj.userData.rightPylon) obj.userData.rightPylon.scale.set(1, 1, 1);
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

