import { playSound } from '../../audio.js';
import { CENTER_X, GRAVITY, MAX_TIER, STABILIZER_ACCEL, STABILIZER_GAIN, TRACK_HALF } from '../../core/constants.js';
import { run, view } from '../../core/state.js';
import { burst, spawnShockwave } from '../../entities/particles.js';
import { updateGroundGlow } from '../../scene/ground.js';
import * as ui from '../../ui.js';
import { activePointers, keys } from '../input.js';
import * as THREE from 'three';

const landPos = new THREE.Vector3();

export function updateShipControl(dt, t, move) {
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
    run.dualHoldTime += dt;
    if (run.dualHoldTime >= 0.08) {
      stabilizing = true;
      dir = 0;
      if (!run.stabilizerEngaged) {
        run.stabilizerEngaged = true;
        run.latVel *= 0.25;
        ui.floatLabel('中线锁定', view.ship.position, '#66ffff', 14);
        playSound('lock');
      }
    }
  } else {
    run.dualHoldTime = 0;
    run.stabilizerEngaged = false;
    dir += s;
  }
} else {
  run.dualHoldTime = 0;
  run.stabilizerEngaged = false;
}
dir = Math.max(-1, Math.min(1, dir));
const maxV = (5 + run.speed * 0.27) * (1 + run.tier * 0.08);
if (stabilizing) {
  const error = CENTER_X - view.ship.position.x;
  const targetVel = Math.max(-maxV, Math.min(maxV, error * STABILIZER_GAIN));
  const step = STABILIZER_ACCEL * dt;
  run.latVel += Math.max(-step, Math.min(step, targetVel - run.latVel));
  if (Math.abs(error) < 0.012 && Math.abs(run.latVel) < 0.45) {
    view.ship.position.x = CENTER_X;
    run.latVel = 0;
  }
} else if (dir !== 0) {
  run.latVel += dir * 150 * dt;
} else {
  const decel = 175 * dt;
  run.latVel = Math.abs(run.latVel) <= decel ? 0 : run.latVel - Math.sign(run.latVel) * decel;
}
run.latVel = Math.max(-maxV, Math.min(maxV, run.latVel));
const nx = view.ship.position.x + run.latVel * dt;
if ((nx <= -TRACK_HALF && run.latVel < 0) || (nx >= TRACK_HALF && run.latVel > 0)) run.latVel = 0;
view.ship.position.x = Math.max(-TRACK_HALF, Math.min(TRACK_HALF, nx));
const bankTarget = Math.max(-0.45, Math.min(0.45, -run.latVel * 0.02));
run.shipBank += (bankTarget - run.shipBank) * Math.min(1, dt * 10);
view.ship.rotation.z = run.shipBank + run.morphRoll;
view.ship.rotation.x = -run.airFlip;

if (!run.grounded) {
  run.vy += GRAVITY * dt;
  view.ship.position.y += run.vy * dt;
  if (view.ship.position.y <= 0.95) {
    view.ship.position.y = 0.95; run.grounded = true; run.vy = 0;
    run.airJumps = run.tier >= MAX_TIER ? 1 : 0;
    landPos.set(view.ship.position.x, 0.08, 0.5);
    burst(landPos, 0x66ccff, 0.28, 0.35, 0.65, 24);
    spawnShockwave(landPos, 0x00ffff, 0.45);
    playSound('land');
    run.shakeTime = Math.max(run.shakeTime, 0.12);
  }
} else {
  view.ship.position.y = 0.95 + Math.sin(t * 3.2) * 0.07;
}
view.ship.scale.x += (1 - view.ship.scale.x) * Math.min(1, dt * 9);
view.ship.scale.y += (1 - view.ship.scale.y) * Math.min(1, dt * 9);
view.ship.scale.z += (1 - view.ship.scale.z) * Math.min(1, dt * 9);

if (run.invuln > 0) {
  run.invuln -= dt;
  view.ship.visible = Math.floor(t * 18) % 2 === 0;
  if (run.invuln <= 0) view.ship.visible = true;
}
updateGroundGlow();


}

