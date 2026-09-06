import { playSound } from '../../audio.js';
import { COMBO_WINDOW, MAX_TIER, TIER_COLORS, TIER_NAMES, TOASTS } from '../../core/constants.js';
import { lists, run, view } from '../../core/state.js';
import { burst, shatterOrb, spawnShockwave } from '../../entities/particles.js';
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
    const cbCol = ui.comboColor(mult);

    // 能量球专属 3D 水晶破片碎裂系统（四面体/八面体/微晶片在空中剧烈翻滚炸裂，随战机冲刺向后流逝）
    shatterOrb(o.position);

    // 三重物理本色火花爆发：
    // 1. 白炽核心高能裂解（纯白 #ffffff）
    burst(o.position, 0xffffff, 0.26, 0.35, 0.75, 12);
    // 2. 内环电离等离子星芒（青蓝 0x00ffff）
    burst(o.position, 0x00ffff, 0.22, 0.38, 0.85, 14);
    // 3. 外环聚变能场爆散（琥珀金 0xffd700）
    burst(o.position, 0xffd700, 0.20, 0.42, 0.95, 10 + Math.min(8, mult * 2));

    // 连击 >= 2 扩散纯净青/金能量光环
    if (mult >= 2) spawnShockwave(o.position, mult % 2 === 0 ? 0x00ffff : 0xffd700, 0.75);
    ui.floatLabel('+' + gainAmt + (mult > 1 ? ' ×' + mult : ''), o.position, cbCol, 17 + mult * 3);
    ui.flash(cbCol, mult >= 3 ? 0.04 : 0.02, 180);
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
      spawnShockwave(view.ship.position, 0x00ffff, 0.8);
    }
    const nt = calcTier();
    if (nt > run.tier) {
      run.tier = nt;
      applyShipTier();
      run.morphRoll = Math.PI * 2;
      if (run.tier >= MAX_TIER) run.airJumps = 1;
      if (run.tier >= 2 && !run.shieldReady) { run.shieldReady = true; run.orbCountAtShieldEvent = run.orbCount; }

      // 彻底消除慢动作停顿阻滞，保持 100% 极速冲刺心流！
      // 瞬时超曲速推背感广角爆发（Hyper-Warp Impulse）
      run.fovKick += 8.5;
      run.shakeTime = Math.max(run.shakeTime, 0.28);

      const colHex = '#' + TIER_COLORS[run.tier].toString(16).padStart(6, '0');
      ui.flash(colHex, 0.12, 280);
      ui.evolutionBanner(run.tier, TIER_NAMES[run.tier], colHex);
      playSound('evolve');

      // 双重正交量子激波脉冲环（机身扫描 + 尾部推进）
      spawnShockwave(view.ship.position, TIER_COLORS[run.tier], 1.8);
      spawnShockwave({ x: view.ship.position.x, y: view.ship.position.y + 0.3, z: view.ship.position.z - 0.8 }, 0xffffff, 1.4);

      // 双波超新星晶体星芒爆发
      for (let k = 0; k < 2; k++) {
        setTimeout(() => {
          burst(view.ship.position, k === 0 ? 0xffffff : TIER_COLORS[run.tier], 0.30, 0.6, 1.2, 36);
        }, k * 90);
      }
    }
    updateHUD();
  }
}

updateHUD();


}

