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
  tierColorHex: ''
};

export function updateHUD() {
  hudState.dist = run.dist;
  hudState.bonus = run.score;
  hudState.speed = run.speed;
  hudState.orbCount = run.orbCount;
  hudState.maxCombo = run.maxCombo;
  hudState.tier = run.tier;
  hudState.airJumpReady = run.tier >= MAX_TIER && (run.grounded || run.airJumps > 0);
  hudState.shieldReady = run.shieldReady;
  hudState.charge = run.orbCount - run.orbCountAtShieldEvent;
  hudState.tierColorHex = TIER_COLOR_HEXES[run.tier] || 'ffffff';
  ui.updateHUD(hudState);
}

export function bumpScore() {
  ui.els.scoreEl.classList.remove('bump');
  void ui.els.scoreEl.offsetWidth;
  ui.els.scoreEl.classList.add('bump');
}
