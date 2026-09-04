import { beep } from '../audio.js';
import { JUMP_V, MAX_TIER, SWIPE_AIRJUMP, SWIPE_JUMP, TIER_COLORS } from '../core/constants.js';
import { $ } from '../core/dom.js';
import { run, view } from '../core/state.js';
import { burst, spawnShockwave } from '../entities/particles.js';
import * as ui from '../ui.js';
import { updateHUD } from './hud.js';
import { startGame, updateFsBtn } from './session.js';
import * as THREE from 'three';

export const activePointers = new Map();

export const keys = { left: false, right: false };

function jump() {
  if (run.state !== 'playing' || run.paused) return;
  if (run.grounded) {
    run.vy = JUMP_V;
    run.grounded = false;
    run.airJumps = run.tier >= MAX_TIER ? 1 : 0;
    view.ship.scale.set(0.8, 1.35, 0.8);
    beep(500, 0.15, 'sine', 0.1);
    setTimeout(() => beep(750, 0.12, 'sine', 0.08), 70);
  } else if (run.airJumps > 0) {
    // T5 量子跃迁: 空中二段跳
    run.airJumps--;
    run.vy = JUMP_V * 0.88;
    run.airFlip = Math.PI * 2;
    view.ship.scale.set(1.22, 0.74, 1.22);
    const at = new THREE.Vector3(view.ship.position.x, view.ship.position.y - 0.35, view.ship.position.z);
    spawnShockwave(at, TIER_COLORS[MAX_TIER], 0.5);
    burst(at, TIER_COLORS[MAX_TIER], 0.2, 0.45, 0.8, 28);
    ui.floatLabel('量子跃迁', view.ship.position, '#c08cff', 16);
    beep(760, 0.12, 'triangle', 0.11);
    setTimeout(() => beep(1180, 0.14, 'triangle', 0.09), 60);
    updateHUD();
  }
}

addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
    e.preventDefault();
    if (run.state === 'playing') jump();
    else startGame();
  } else if (e.code === 'Enter' && run.state !== 'playing') startGame();
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
    $('pauseScreen').classList.add('hidden');
    updateFsBtn();
  }
  if (e.pointerType !== 'touch' || run.state !== 'playing' || run.paused) return;
  activePointers.set(e.pointerId, {
    x: e.clientX,
    startX: e.clientX,
    baseY: e.clientY,
    isJump: false,
    jumpTriggered: false,
    origShipX: view.ship ? view.ship.position.x : 0
  });
});

addEventListener('pointermove', e => {
  const p = activePointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  const dy = p.baseY - e.clientY;
  const dx = Math.abs(e.clientX - p.startX);
  if (dy > 12 && dy > dx * 0.8) {
    if (!p.isJump && !hasOtherActiveSteering(e.pointerId) && p.origShipX !== undefined) {
      view.ship.position.x = p.origShipX;
      run.latVel = 0;
    }
    p.isJump = true;
  }
  const need = run.grounded ? SWIPE_JUMP : SWIPE_AIRJUMP;
  if (e.clientY > p.baseY) {
    p.baseY = e.clientY;
  } else if (dx > dy * 1.2) {
    if (!p.jumpTriggered && dx >= 16) {
      p.isJump = false;
      p.origShipX = view.ship ? view.ship.position.x : 0;
    } else {
      p.origShipX = undefined;
    }
    p.baseY = e.clientY;
    p.startX = e.clientX;
  } else if (dy >= need && dy > dx * 1.1 && (run.grounded || run.airJumps > 0)) {
    if (!p.isJump && !hasOtherActiveSteering(e.pointerId) && p.origShipX !== undefined) {
      view.ship.position.x = p.origShipX;
    }
    p.isJump = true;
    p.jumpTriggered = true;
    if (!hasOtherActiveSteering(e.pointerId)) run.latVel = 0;
    jump();
    p.baseY = e.clientY;
    p.startX = e.clientX;
    p.origShipX = undefined;
  }
});

const releasePointer = e => {
  const p = activePointers.get(e.pointerId);
  if (p) {
    const dy = p.baseY - e.clientY;
    const dx = Math.abs(e.clientX - p.startX);
    const need = run.grounded ? SWIPE_JUMP : SWIPE_AIRJUMP;
    if (dy >= need && dy > dx * 1.1 && (run.grounded || run.airJumps > 0)) {
      if (!p.isJump && !hasOtherActiveSteering(e.pointerId) && p.origShipX !== undefined) {
        view.ship.position.x = p.origShipX;
      }
      p.isJump = true;
      p.jumpTriggered = true;
      jump();
      p.origShipX = undefined;
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
    updateFsBtn();
    clearInputState();
  }
});

window.addEventListener('blur', () => {
  if (run.state === 'playing') {
    run.paused = true;
    updateFsBtn();
    clearInputState();
  }
});

window.addEventListener('pagehide', clearInputState);

addEventListener('keydown', () => {
  if (run.paused && run.state === 'playing') { run.paused = false; $('pauseScreen').classList.add('hidden'); updateFsBtn(); }
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

