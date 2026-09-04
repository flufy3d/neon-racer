import { MAX_TIER, TIER_COLORS } from '../core/constants.js';
import { run } from '../core/state.js';
import * as ui from '../ui.js';

export function addScore(base) {
  const g = base * (run.tier >= 4 ? 2 : 1);
  run.score += g;
  return g;
}

export function calcTier() {
  let t = 0;
  for (let i = 0; i < ui.TIER_THRESHOLDS.length; i++) if (run.orbCount >= ui.TIER_THRESHOLDS[i]) t = i + 1;
  return t;
}

export function updateHUD() {
  ui.updateHUD({
    dist: run.dist, bonus: run.score, speed: run.speed, orbCount: run.orbCount, maxCombo: run.maxCombo, tier: run.tier,
    airJumpReady: run.tier >= MAX_TIER && (run.grounded || run.airJumps > 0),
    shieldReady: run.shieldReady, charge: run.orbCount - run.orbCountAtShieldEvent,
    tierColorHex: TIER_COLORS[run.tier].toString(16).padStart(6, '0')
  });
}

export function bumpScore() {
  ui.els.scoreEl.classList.remove('bump');
  void ui.els.scoreEl.offsetWidth;
  ui.els.scoreEl.classList.add('bump');
}

