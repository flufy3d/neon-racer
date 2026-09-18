import { playSound } from '../../audio.js';
import { CENTER_X, DOUBLE_JUMP_TIER, GRAVITY, MAX_TIER, SLIDE_DROP_Y, SLIDE_PITCH, STABILIZER_ACCEL, STABILIZER_GAIN, TRACK_HALF } from '../../core/constants.js';
import { run, view } from '../../core/state.js';
import { burst, spawnShockwave } from '../../entities/particles.js';
import { updateGroundGlow } from '../../scene/ground.js';
import * as ui from '../../ui.js';
import { activePointers, keys } from '../input.js';
import * as THREE from 'three';

const landPos = new THREE.Vector3();
const belly = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

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
view.ship.rotation.x = -run.airFlip - run.slideK * SLIDE_PITCH;

// 滑铲姿态系数：目标 0/1 平滑过渡，驱动贴地压低与收翼变形
run.slideK += ((run.slideTimer > 0 ? 1 : 0) - run.slideK) * Math.min(1, dt * 12);
if (run.slideK < 0.004) run.slideK = 0;
if (run.slideTimer > 0) {
  run.slideTimer -= dt;
  if (run.slideTimer <= 0) run.slideTimer = 0;
  // 贴地掠行火花：从机腹与翼尖高频溅射（白炽 + 形态青交替），地面擦出火星
  if (Math.random() < dt * 90) {
    belly.set(view.ship.position.x, 0.1, view.ship.position.z + 0.25);
    burst(belly, Math.random() < 0.5 ? 0xffffff : 0x66ffcc, 0.15, 0.22, 0.5, 6, 0.75);
  }
}

if (!run.grounded) {
  run.vy += GRAVITY * dt;
  view.ship.position.y += run.vy * dt;
  if (view.ship.position.y <= 0.95) {
    view.ship.position.y = 0.95; run.grounded = true; run.vy = 0;
    run.airJumps = run.tier >= DOUBLE_JUMP_TIER ? 1 : 0;
    landPos.set(view.ship.position.x, 0.08, 0.5);
    burst(landPos, 0x66ccff, 0.28, 0.35, 0.65, 24);
    spawnShockwave(landPos, 0x00ffff, 0.45);
    playSound('land');
    run.shakeTime = Math.max(run.shakeTime, 0.12);
  }
} else {
  // 贴地掠行姿态：大幅压低贴近地面，保留细颤表现气垫摩擦
  view.ship.position.y = 0.95 - SLIDE_DROP_Y * run.slideK
    + Math.sin(t * (3.2 + run.slideK * 22)) * (0.07 - run.slideK * 0.05);
}
// 起跳瞬时拉伸自然回弹；滑铲只做刚性滚转，不再压扁/拉伸机体
view.ship.scale.lerp(ONE, Math.min(1, dt * 9));

if (run.invuln > 0) {
  run.invuln -= dt;
  view.ship.visible = Math.floor(t * 18) % 2 === 0;
  if (run.invuln <= 0) view.ship.visible = true;
}
updateGroundGlow();


}

