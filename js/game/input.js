import { pauseAudioRun, playSound, resumeAudioRun } from '../audio.js';
import { DOUBLE_JUMP_TIER, JUMP_V, MAX_TIER, SLIDE_DURATION, SLIDE_FASTFALL_V, SWIPE_AIRJUMP, SWIPE_JUMP, TIER_COLORS } from '../core/constants.js';
import { $ } from '../core/dom.js';
import { run, view } from '../core/state.js';
import { burst, spawnShockwave } from '../entities/particles.js';
import * as ui from '../ui.js';
import { updateHUD } from './hud.js';
import { isArchiveOpen } from './achievements.js';
import { startGame, updateFsBtn } from './session.js';
import * as THREE from 'three';

export const activePointers = new Map();

export const keys = { left: false, right: false };

const airJumpPos = new THREE.Vector3();
const slidePos = new THREE.Vector3();

// 滑铲：贴地滑行动作，是穿过悬挂闸门的正确姿势。
// 滞空时触发则先俯冲落地，落地后继续滑完剩余时长。
function slide() {
  if (run.state !== 'playing' || run.paused) return;
  if (run.slideTimer > 0) return;
  run.slideTimer = SLIDE_DURATION;
  if (!run.grounded) {
    run.vy = Math.min(run.vy, SLIDE_FASTFALL_V);
    run.airJumps = 0;
  }
  slidePos.set(view.ship.position.x, 0.12, view.ship.position.z + 0.4);
  spawnShockwave(slidePos, 0x66ffcc, 0.7);
  playSound('slide');
}

function jump() {
  if (run.state !== 'playing' || run.paused) return;
  const now = performance.now();
  if (run.grounded) {
    run.vy = JUMP_V;
    run.grounded = false;
    run.slideTimer = 0;
    run.airJumps = run.tier >= DOUBLE_JUMP_TIER ? 1 : 0;
    run.lastJumpTime = now;
    view.ship.scale.set(0.8, 1.35, 0.8);
    playSound('jump');
  } else if (run.airJumps > 0) {
    // 防误触保护：一段起跳后 120ms 内不触发二段跳，避免快速误触或手势粘连在贴地处浪费
    if (now - (run.lastJumpTime || 0) < 120) return;
    // T4 量子跃迁: 空中二段跳
    run.airJumps--;
    run.vy = JUMP_V * 0.88;
    run.airFlip = Math.PI * 2;
    airJumpPos.set(view.ship.position.x, view.ship.position.y - 0.35, view.ship.position.z);
    spawnShockwave(airJumpPos, TIER_COLORS[DOUBLE_JUMP_TIER], 0.85);
    burst(airJumpPos, 0xffffff, 0.35, 0.45, 1.1, 32);
    burst(airJumpPos, TIER_COLORS[DOUBLE_JUMP_TIER], 0.32, 0.65, 1.3, 44);
    ui.floatLabel('量子跃迁', view.ship.position, '#c08cff', 16);
    playSound('airJump');
    updateHUD();
  }
}

addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    e.preventDefault();
    slide();
  } else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
    e.preventDefault();
    if (run.state === 'playing') jump();
    else if (!isArchiveOpen()) startGame();
  } else if (e.code === 'Enter' && run.state !== 'playing' && !isArchiveOpen()) startGame();
});

addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

function hasOtherActiveSteering(currId = null) {
  if (keys.left || keys.right) return true;
  for (const [id, p] of activePointers.entries()) {
    if (id !== currId && !p.isJump) return true;
  }
  return false;
}

function clearInputState() {
  activePointers.clear();
  run.dualHoldTime = 0;
  run.stabilizerEngaged = false;
  keys.left = false;
  keys.right = false;
}

addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  if (run.paused && run.state === 'playing') {
    run.paused = false;
    resumeAudioRun();
    $('pauseScreen').classList.add('hidden');
    updateFsBtn();
  }
  if (e.pointerType !== 'touch' || run.state !== 'playing' || run.paused) return;
  activePointers.set(e.pointerId, {
    x: e.clientX,
    startX: e.clientX,
    baseY: e.clientY,
    minY: e.clientY,
    startY: e.clientY,
    startTime: performance.now(),
    isJump: false,
    jumpTriggered: false,
    hasJumpedThisTouch: false,
    hasSlid: false,
    maxMoveDist: 0
  });
});

addEventListener('pointermove', e => {
  const p = activePointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  if (e.clientY < p.minY) p.minY = e.clientY;
  const dy = p.baseY - e.clientY;
  const dx = Math.abs(e.clientX - p.startX);
  const totalDist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
  if (totalDist > p.maxMoveDist) p.maxMoveDist = totalDist;

  const now = performance.now();
  const isInitialFlick = (now - p.startTime) < 100;
  if (isInitialFlick && dy > 12 && dy > dx * 1.0) {
    p.isJump = true;
  }
  const need = run.grounded ? SWIPE_JUMP : SWIPE_AIRJUMP;
  if (e.clientY > p.baseY) {
    // 下甩滑铲：以触摸历史最高点为基准，累计下移 ≥24px 且纵向占优即触发（每次触摸一次）
    const downDy = e.clientY - p.minY;
    if (!p.hasSlid && downDy >= 24 && downDy > dx * 1.1) {
      p.hasSlid = true;
      if (!hasOtherActiveSteering(e.pointerId)) run.latVel = 0;
      slide();
    }
    p.baseY = e.clientY;
  } else if (dx > dy * 1.2) {
    if (!p.jumpTriggered && dx >= 16) {
      p.isJump = false;
    }
    p.baseY = e.clientY;
    p.startX = e.clientX;
  } else if (!p.hasJumpedThisTouch && dy >= need && dy > dx * 1.1 && (run.grounded || run.airJumps > 0)) {
    p.isJump = true;
    p.jumpTriggered = true;
    p.hasJumpedThisTouch = true;
    if (!hasOtherActiveSteering(e.pointerId)) run.latVel = 0;
    jump();
    p.baseY = e.clientY;
    p.startX = e.clientX;
  }
});

const releasePointer = e => {
  const p = activePointers.get(e.pointerId);
  if (p) {
    const now = performance.now();
    const dy = p.baseY - e.clientY;
    const dx = Math.abs(e.clientX - p.startX);
    const need = run.grounded ? SWIPE_JUMP : SWIPE_AIRJUMP;
    const totalDist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);

    if (!p.hasJumpedThisTouch && dy >= need && dy > dx * 1.1 && (run.grounded || run.airJumps > 0)) {
      p.isJump = true;
      p.jumpTriggered = true;
      p.hasJumpedThisTouch = true;
      jump();
    } else if (!p.hasJumpedThisTouch && !run.grounded && run.airJumps > 0) {
      // 空中轻点（Tap）二段跳判定：滞空、有跳跃配额、触摸位移微小 (< 18px)、触屏时间极短 (< 240ms)
      if (totalDist < 18 && (now - p.startTime) < 240) {
        p.isJump = true;
        p.jumpTriggered = true;
        p.hasJumpedThisTouch = true;
        jump();
      }
    }
    if (p.isJump && !hasOtherActiveSteering(e.pointerId)) run.latVel = 0;
    activePointers.delete(e.pointerId);
  }
};

addEventListener('pointerup', releasePointer);

addEventListener('pointercancel', releasePointer);

$('startBtn').onclick = startGame;

$('restartBtn').onclick = startGame;

document.addEventListener('visibilitychange', () => {
  if (document.hidden && run.state === 'playing') {
    run.paused = true;
    pauseAudioRun();
    updateFsBtn();
    clearInputState();
  }
});

window.addEventListener('blur', () => {
  if (run.state === 'playing') {
    run.paused = true;
    pauseAudioRun();
    updateFsBtn();
    clearInputState();
  }
});

window.addEventListener('pagehide', () => {
  clearInputState();
  if (run.state === 'playing') {
    run.paused = true;
    pauseAudioRun();
  }
});

addEventListener('keydown', () => {
  if (run.paused && run.state === 'playing') {
    run.paused = false;
    resumeAudioRun();
    $('pauseScreen').classList.add('hidden');
    updateFsBtn();
  }
});

$('fsBtn').onclick = e => {
  e.stopPropagation();
  const d = document, de = d.documentElement;
  try {
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const fn = de.requestFullscreen || de.webkitRequestFullscreen;
      if (fn) { const r = fn.call(de); if (r && r.catch) r.catch(() => ui.toast('请使用分享菜单添加到主屏幕', '#ff8822')); }
    } else {
      const fn = d.exitFullscreen || d.webkitExitFullscreen;
      if (fn) fn.call(d);
    }
  } catch (err) {}
};

