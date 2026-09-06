import { playSound } from '../../audio.js';
import { lists, run, view } from '../../core/state.js';
import { burst, shatterObstacle, shieldBreakFx } from '../../entities/particles.js';
import { releasePooledObstacle } from '../../entities/obstacles.js';
import { applyShipTier } from '../../entities/ship.js';
import { pillarGeo, pillarMat, streakGeo, streakMat } from '../../scene/materials.js';
import * as ui from '../../ui.js';
import { addScore, bumpScore } from '../hud.js';
import { triggerSlowMo } from '../loop.js';
import { gameOver } from '../session.js';
import * as THREE from 'three';

const STREAK_MAX = 40;
let streakInstancedMesh = null;
const _streakDummy = new THREE.Object3D();
const streakActive = new Uint8Array(STREAK_MAX);
const streakX = new Float32Array(STREAK_MAX);
const streakY = new Float32Array(STREAK_MAX);
const streakZ = new Float32Array(STREAK_MAX);
const streakScaleZ = new Float32Array(STREAK_MAX);

export function initStreakInstancedMesh(scene) {
  if (streakInstancedMesh) return;
  streakInstancedMesh = new THREE.InstancedMesh(streakGeo, streakMat, STREAK_MAX);
  streakInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _streakDummy.position.set(0, -999, 0);
  _streakDummy.scale.set(0, 0, 0);
  _streakDummy.updateMatrix();
  for (let i = 0; i < STREAK_MAX; i++) {
    streakInstancedMesh.setMatrixAt(i, _streakDummy.matrix);
  }
  streakInstancedMesh.instanceMatrix.needsUpdate = true;
  scene.add(streakInstancedMesh);
}

export function resetStreaks() {
  streakActive.fill(0);
  if (streakInstancedMesh) {
    _streakDummy.position.set(0, -999, 0);
    _streakDummy.scale.set(0, 0, 0);
    _streakDummy.updateMatrix();
    for (let i = 0; i < STREAK_MAX; i++) {
      streakInstancedMesh.setMatrixAt(i, _streakDummy.matrix);
    }
    streakInstancedMesh.instanceMatrix.needsUpdate = true;
  }
}

const PILLAR_MAX = 16;
let pillarInstancedMesh = null;
const _pillarDummy = new THREE.Object3D();
const pillarActive = new Uint8Array(PILLAR_MAX);
const pillarX = new Float32Array(PILLAR_MAX);
const pillarZ = new Float32Array(PILLAR_MAX);

export function initPillarInstancedMesh(scene) {
  if (pillarInstancedMesh) return;
  pillarInstancedMesh = new THREE.InstancedMesh(pillarGeo, pillarMat, PILLAR_MAX);
  pillarInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  _pillarDummy.position.set(0, -999, 0);
  _pillarDummy.scale.set(0, 0, 0);
  _pillarDummy.updateMatrix();
  for (let i = 0; i < PILLAR_MAX; i++) {
    pillarInstancedMesh.setMatrixAt(i, _pillarDummy.matrix);
  }
  pillarInstancedMesh.instanceMatrix.needsUpdate = true;
  scene.add(pillarInstancedMesh);
}

export function spawnPillarInstance(z) {
  if (!pillarInstancedMesh) return;
  for (let i = 0; i < PILLAR_MAX; i++) {
    if (!pillarActive[i]) {
      pillarActive[i] = 1;
      pillarX[i] = Math.random() < 0.5 ? -7.5 : 7.5;
      pillarZ[i] = z;
      _pillarDummy.position.set(pillarX[i], 2.5, z);
      _pillarDummy.scale.set(1, 1, 1);
      _pillarDummy.updateMatrix();
      pillarInstancedMesh.setMatrixAt(i, _pillarDummy.matrix);
      pillarInstancedMesh.instanceMatrix.needsUpdate = true;
      break;
    }
  }
}

export function resetPillars() {
  pillarActive.fill(0);
  if (pillarInstancedMesh) {
    _pillarDummy.position.set(0, -999, 0);
    _pillarDummy.scale.set(0, 0, 0);
    _pillarDummy.updateMatrix();
    for (let i = 0; i < PILLAR_MAX; i++) {
      pillarInstancedMesh.setMatrixAt(i, _pillarDummy.matrix);
    }
    pillarInstancedMesh.instanceMatrix.needsUpdate = true;
  }
}

export function updateScenery(dt, t, move) {
if (pillarInstancedMesh) {
  let needsUpdate = false;
  for (let i = 0; i < PILLAR_MAX; i++) {
    if (pillarActive[i]) {
      pillarZ[i] += move;
      if (pillarZ[i] > 12) {
        pillarActive[i] = 0;
        _pillarDummy.position.set(0, -999, 0);
        _pillarDummy.scale.set(0, 0, 0);
        _pillarDummy.updateMatrix();
        pillarInstancedMesh.setMatrixAt(i, _pillarDummy.matrix);
      } else {
        _pillarDummy.position.set(pillarX[i], 2.5, pillarZ[i]);
        _pillarDummy.scale.set(1, 1, 1);
        _pillarDummy.updateMatrix();
        pillarInstancedMesh.setMatrixAt(i, _pillarDummy.matrix);
      }
      needsUpdate = true;
    }
  }
  if (needsUpdate) {
    pillarInstancedMesh.instanceMatrix.needsUpdate = true;
  }
}
for (let i = lists.roadside.length - 1; i >= 0; i--) {
  const rs = lists.roadside[i];
  rs.position.z += move;
  if (rs.userData.ring) {
    rs.userData.ring.rotation.z += dt * 1.8;
    rs.userData.ring.rotation.x = Math.sin(t * 2.2 + rs.userData.phase) * 0.35;
  }
  if (rs.userData.core) {
    rs.userData.core.rotation.y += dt * 2.5;
    rs.userData.core.rotation.x += dt * 1.2;
  }
  if (rs.position.z > 15) { view.scene.remove(rs); lists.roadside.splice(i, 1); }
}
for (let i = lists.arches.length - 1; i >= 0; i--) {
  lists.arches[i].position.z += move;
  if (lists.arches[i].position.z > 15) { view.scene.remove(lists.arches[i]); lists.arches.splice(i, 1); }
}
for (let i = lists.warpBeacons.length - 1; i >= 0; i--) {
  const wb = lists.warpBeacons[i];
  wb.position.z += move;
  if (wb.userData.core) {
    wb.userData.core.scale.setScalar(0.9 + Math.sin(t * 6 + wb.userData.phase) * 0.15);
  }
  if (wb.position.z > 15) { view.scene.remove(wb); lists.warpBeacons.splice(i, 1); }
}

if (!streakInstancedMesh && view.scene) {
  initStreakInstancedMesh(view.scene);
}

run.streakTimer -= dt;
if (run.speed > 40 && run.streakTimer <= 0) {
  run.streakTimer = 0.05 + Math.random() * 0.07;
  for (let i = 0; i < STREAK_MAX; i++) {
    if (!streakActive[i]) {
      streakActive[i] = 1;
      streakX[i] = (Math.random() - 0.5) * 18;
      streakY[i] = Math.random() * 7 + 0.5;
      streakZ[i] = -120;
      streakScaleZ[i] = 4 + Math.random() * 5;
      break;
    }
  }
}

if (streakInstancedMesh) {
  let needsUpdate = false;
  for (let i = 0; i < STREAK_MAX; i++) {
    if (streakActive[i]) {
      streakZ[i] += move * 1.6;
      if (streakZ[i] > 12) {
        streakActive[i] = 0;
        _streakDummy.position.set(0, -999, 0);
        _streakDummy.scale.set(0, 0, 0);
        _streakDummy.updateMatrix();
        streakInstancedMesh.setMatrixAt(i, _streakDummy.matrix);
      } else {
        _streakDummy.position.set(streakX[i], streakY[i], streakZ[i]);
        _streakDummy.scale.set(1, 1, streakScaleZ[i]);
        _streakDummy.updateMatrix();
        streakInstancedMesh.setMatrixAt(i, _streakDummy.matrix);
      }
      needsUpdate = true;
    }
  }
  if (needsUpdate) {
    streakInstancedMesh.instanceMatrix.needsUpdate = true;
  }
}


}

export function updateObstacles(dt, t, move) {
for (let i = lists.obstacles.length - 1; i >= 0; i--) {
  const o = lists.obstacles[i];
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
  if (o.position.z > 12) { releasePooledObstacle(o); lists.obstacles.splice(i, 1); continue; }
  if (!o.userData.passed && prevZ <= 1.0 && o.position.z >= -1.0) {
    o.userData.passed = true;
    const dx = Math.abs(o.position.x - view.ship.position.x);
    const hitTop = o.userData.type === 'wall' ? 3.2 : 0.76;
    const bottom = view.ship.position.y - 0.35;
    const crashing = dx < 1.85 && bottom < hitTop;
    if (crashing) {
      if (run.invuln <= 0) {
        if (run.shieldReady && run.tier >= 2) {
          run.shieldReady = false;
          run.orbCountAtShieldEvent = run.orbCount;
          run.invuln = 1.3;
          applyShipTier();
          shieldBreakFx();
          playSound('shatter');
          shatterObstacle(o);
          triggerSlowMo(0.14, 0.65);
          run.fovKick += 6.5;
          ui.floatLabel('SHATTER! 强行突破', o.position, '#ff0055', 22);
          run.shakeTime = Math.max(run.shakeTime, 0.5);
          releasePooledObstacle(o);
          lists.obstacles.splice(i, 1);
          continue;
        } else {
          gameOver();
          break;
        }
      } else {
        // 无敌冲刺状态迎面撞上障碍物，强行击碎消除，绝不穿模！
        playSound('shatter');
        shatterObstacle(o);
        triggerSlowMo(0.28, 0.22);
        run.fovKick += 2.0;
        ui.floatLabel('碾碎!', o.position, '#00ffff', 18);
        run.shakeTime = Math.max(run.shakeTime, 0.32);
        releasePooledObstacle(o);
        lists.obstacles.splice(i, 1);
        continue;
      }
    }
    if (!crashing) {
      if (o.userData.type === 'low' && dx < 1.85 && !run.grounded) {
        const g = addScore(40);
        ui.floatLabel('完美跳跃 +' + g, o.position, '#ffffff', 19);
        run.fovKick += 2.5;
        playSound('perfectJump');
        burst(o.position, 0xffffff, 0.32, 0.45, 0.9, 28);
        burst(o.position, 0x00ffff, 0.28, 0.65, 1.1, 32);
        bumpScore();
      } else if (dx >= 1.85 && dx < 3.6) {
        const g = addScore(30);
        ui.floatLabel('擦身而过 +' + g, o.position, '#aaffff', 16);
        run.fovKick += 1.5;
        playSound('nearMiss', o.position.x - view.ship.position.x);
      }
    }
  }
}


}

