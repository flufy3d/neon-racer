import { playSound } from '../../audio.js';
import { lists, run, view } from '../../core/state.js';
import { burst, shatterObstacle, shieldBreakFx } from '../../entities/particles.js';
import { applyShipTier } from '../../entities/ship.js';
import { streakGeo, streakMat } from '../../scene/materials.js';
import * as ui from '../../ui.js';
import { addScore, bumpScore } from '../hud.js';
import { triggerSlowMo } from '../loop.js';
import { gameOver } from '../session.js';
import * as THREE from 'three';

export function updateScenery(dt, t, move) {
for (let i = lists.pillars.length - 1; i >= 0; i--) {
  lists.pillars[i].position.z += move;
  if (lists.pillars[i].position.z > 12) { view.scene.remove(lists.pillars[i]); lists.pillars.splice(i, 1); }
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

run.streakTimer -= dt;
if (run.speed > 40 && run.streakTimer <= 0) {
  run.streakTimer = 0.05 + Math.random() * 0.07;
  const s = new THREE.Mesh(streakGeo, streakMat);
  s.scale.set(1, 1, 4 + Math.random() * 5);
  s.position.set((Math.random() - 0.5) * 18, Math.random() * 7 + 0.5, -120);
  lists.streaks.push(s);
  view.scene.add(s);
}
for (let i = lists.streaks.length - 1; i >= 0; i--) {
  const st = lists.streaks[i];
  st.position.z += move * 1.6;
  if (st.position.z > 12) { view.scene.remove(st); lists.streaks.splice(i, 1); }
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
  if (o.position.z > 12) { view.scene.remove(o); lists.obstacles.splice(i, 1); continue; }
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
          view.scene.remove(o);
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
        view.scene.remove(o);
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

