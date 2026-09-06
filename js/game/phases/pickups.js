import { playSound } from '../../audio.js';
import { COMBO_WINDOW, MAX_TIER, TIER_COLORS, TIER_NAMES, TOASTS } from '../../core/constants.js';
import { lists, run, view } from '../../core/state.js';
import { burst, spawnShockwave } from '../../entities/particles.js';
import { applyShipTier } from '../../entities/ship.js';
import * as ui from '../../ui.js';
import { addScore, bumpScore, calcTier, updateHUD } from '../hud.js';

export function updateComboAndOrbs(dt, t, move) {
if (run.combo > 0) {
  run.comboTimer -= dt;
  ui.els.comboBar.style.width = Math.max(0, run.comboTimer / COMBO_WINDOW * 130) + 'px';
  if (run.comboTimer <= 0) {
    run.combo = 0;
    ui.els.comboBox.style.opacity = 0;
    playSound('comboBreak');
  }
}

for (let i = lists.orbs.length - 1; i >= 0; i--) {
  const o = lists.orbs[i];
  const prevZ = o.position.z;
  o.position.z += move;
  o.position.y = o.userData.baseY + Math.sin(t * 4 + o.userData.phase) * 0.15;
  o.rotation.y += dt * 3;
  if (o.userData.innerRing) {
    o.userData.innerRing.rotation.x = t * 2.8 + o.userData.phase;
    o.userData.innerRing.rotation.z = Math.sin(t * 1.8 + o.userData.phase) * 0.4;
  }
  if (o.userData.outerRing) {
    o.userData.outerRing.rotation.y = t * -2.1 + o.userData.phase;
    o.userData.outerRing.rotation.x = Math.cos(t * 1.5 + o.userData.phase) * 0.5;
  } else if (o.userData.ring) {
    o.userData.ring.rotation.x = t * 2 + o.userData.phase;
    o.userData.ring.rotation.y = Math.sin(t * 3 + o.userData.phase) * 0.6;
  }
  if (o.position.z > 10) { view.scene.remove(o); lists.orbs.splice(i, 1); continue; }
  if (run.tier >= 3 && o.position.z < 4 && o.position.z > -16) {
    const md = Math.hypot(o.position.x - view.ship.position.x, o.userData.baseY - view.ship.position.y);
    if (md < 4.5) {
      const pull = Math.min(1, dt * 7);
      o.position.x += (view.ship.position.x - o.position.x) * pull;
      o.userData.baseY += (view.ship.position.y - o.userData.baseY) * pull;
    }
  }
  if (prevZ <= 1.15 && o.position.z >= -1.15 && Math.abs(o.position.x - view.ship.position.x) < 1.15
    && Math.abs(o.position.y - view.ship.position.y) < 1.25) {
    view.scene.remove(o); lists.orbs.splice(i, 1);
    run.orbCount++;
    run.combo++;
    if (run.combo > run.maxCombo) run.maxCombo = run.combo;
    run.comboTimer = COMBO_WINDOW;
    const mult = ui.multOf(run.combo);
    const gainAmt = addScore(25 * mult);
    run.fovKick += 1.5;
    bumpScore();
    playSound('pickup', run.combo);
    burst(o.position, ui.comboColor(mult), 0.18 + mult * 0.03, 0.5, 0.55, 14 + mult * 7);
    ui.floatLabel('+' + gainAmt + (mult > 1 ? ' ×' + mult : ''), o.position, ui.comboColor(mult), 17 + mult * 3);
    ui.flash(ui.comboColor(mult), mult >= 3 ? 0.13 : 0.06);
    ui.els.comboText.textContent = '×' + mult + ' COMBO ' + run.combo;
    ui.els.comboBox.style.color = ui.comboColor(mult);
    ui.els.comboBox.style.opacity = 1;
    ui.els.comboBox.classList.remove('pop');
    void ui.els.comboBox.offsetWidth;
    ui.els.comboBox.classList.add('pop');
    if (TOASTS[run.combo]) ui.toast(TOASTS[run.combo], ui.comboColor(mult));
    if (run.tier >= 2 && !run.shieldReady && run.orbCount - run.orbCountAtShieldEvent >= ui.SHIELD_RECHARGE) {
      run.shieldReady = true;
      applyShipTier();
      ui.toast('护盾已充能', '#66ffff');
      playSound('shieldReady');
      spawnShockwave(view.ship.position, 0x00ffff, 0.6);
    }
    const nt = calcTier();
    if (nt > run.tier) {
      run.tier = nt;
      applyShipTier();
      run.morphRoll = Math.PI * 2;
      if (run.tier >= MAX_TIER) run.airJumps = 1;
      if (run.tier >= 2 && !run.shieldReady) { run.shieldReady = true; run.orbCountAtShieldEvent = run.orbCount; }
      run.timeScale = 0.35;
      run.shakeTime = Math.max(run.shakeTime, 0.45);
      ui.flash('#ffffff', 0.35, 550);
      ui.toast(TIER_NAMES[run.tier], '#' + TIER_COLORS[run.tier].toString(16).padStart(6, '0'));
      playSound('evolve');
      spawnShockwave(view.ship.position, TIER_COLORS[run.tier], 1);
      setTimeout(() => { if (run.state === 'playing') spawnShockwave(view.ship.position, 0xffffff, 0.7); }, 130);
      for (let k = 0; k < 4; k++) {
        setTimeout(() => {
          burst(view.ship.position, k % 2 ? 0xffffff : TIER_COLORS[run.tier], 0.24, 0.9, 1.1, 50);
        }, k * 110);
      }
    }
    updateHUD();
  }
}

updateHUD();


}

