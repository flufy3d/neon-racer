import { DOUBLE_JUMP_TIER, MAX_TIER, RUSH_SCORE_MULT, TIER_COLORS } from '../core/constants.js';
import { run } from '../core/state.js';
import * as ui from '../ui.js';

export function addScore(base) {
  const g = base * (run.tier >= 5 ? 2 : 1) * (run.rushTimer > 0 ? RUSH_SCORE_MULT : 1);
  run.score += g;
  return g;
}

export function calcTier() {
  let t = 0;
  for (let i = 0; i < ui.TIER_THRESHOLDS.length; i++) if (run.orbCount >= ui.TIER_THRESHOLDS[i]) t = i + 1;
  return t;
}

const TIER_COLOR_HEXES = TIER_COLORS.map(c => c.toString(16).padStart(6, '0'));
const hudState = {
  dist: 0,
  bonus: 0,
  speed: 0,
  orbCount: 0,
  maxCombo: 0,
  tier: 0,
  airJumpReady: false,
  shieldReady: false,
  charge: 0,
  tierColorHex: '',
  rushTimer: 0,
  armorReady: false
};

export function updateHUD() {
  hudState.dist = run.dist;
  hudState.bonus = run.score;
  hudState.speed = run.speed;
  hudState.orbCount = run.orbCount;
  hudState.maxCombo = run.maxCombo;
  hudState.tier = run.tier;
  hudState.airJumpReady = run.tier >= DOUBLE_JUMP_TIER && (run.grounded || run.airJumps > 0);
  hudState.shieldReady = run.shieldReady;
  hudState.charge = run.orbCount - run.orbCountAtShieldEvent;
  hudState.tierColorHex = TIER_COLOR_HEXES[run.tier] || 'ffffff';
  hudState.rushTimer = run.rushTimer;
  hudState.armorReady = run.armorReady;
  ui.updateHUD(hudState);
}

export function bumpScore() {
  // WAAPI 缩放走合成器，替代 remove/offsetWidth/add 的强制同步布局（吃球高频触发）
  ui.els.scoreEl.animate(
    [{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
    { duration: 200, easing: 'ease-out' }
  );
}
