import { beep, crashSound, ensureAudio, startEngine, stopEngine } from '../audio.js';
import { MILESTONE_ZONES, TIER_COLORS } from '../core/constants.js';
import { $ } from '../core/dom.js';
import { lists, run, view } from '../core/state.js';
import { explode, particlePool } from '../entities/particles.js';
import { poseShip } from '../entities/ship-pose.js';
import { applyShipTier } from '../entities/ship.js';
import { lowCoreMat, lowEdgeMat, wallCoreMat, wallEdgeMat } from '../scene/materials.js';
import { BG_BASE, currentLowCoreCol, currentLowEdgeCol, currentWallCoreCol, currentWallEdgeCol } from '../scene/palette.js';
import { meteors } from '../scene/sky.js';
import * as ui from '../ui.js';
import { updateHUD } from './hud.js';
import { activePointers, keys } from './input.js';

function resetGame() {
  for (const o of [...lists.obstacles, ...lists.orbs, ...lists.pillars, ...lists.streaks, ...lists.roadside, ...lists.arches, ...lists.warpBeacons]) view.scene.remove(o);
  for (const p of particlePool) {
    p.active = false;
    p.pts.visible = false;
  }
  lists.obstacles = []; lists.orbs = []; lists.pillars = []; lists.roadside = []; lists.arches = []; lists.warpBeacons = []; lists.particles = []; lists.streaks = [];
  if (view.singularityHalo) {
    view.singularityHalo.material.opacity = 0;
    view.singularityHalo.visible = false;
  }
  for (const sf of lists.sideFibres) {
    sf.visible = false;
    sf.material.opacity = 0;
  }
  run.lastArchDist = 0; run.currentZoneIndex = 0;
  BG_BASE.setHex(MILESTONE_ZONES[0].bgHex);
  if (view.scene && view.scene.fog) view.scene.fog.color.setHex(MILESTONE_ZONES[0].fogHex);
  currentWallEdgeCol.setHex(MILESTONE_ZONES[0].wallEdgeHex);
  currentLowEdgeCol.setHex(MILESTONE_ZONES[0].lowEdgeHex);
  currentWallCoreCol.setHex(MILESTONE_ZONES[0].wallCoreHex);
  currentLowCoreCol.setHex(MILESTONE_ZONES[0].lowCoreHex);
  wallCoreMat.color.setHex(MILESTONE_ZONES[0].wallCoreHex);
  lowCoreMat.color.setHex(MILESTONE_ZONES[0].lowCoreHex);
  wallEdgeMat.color.setHex(MILESTONE_ZONES[0].wallEdgeHex);
  lowEdgeMat.color.setHex(MILESTONE_ZONES[0].lowEdgeHex);
  run.vy = 0; run.grounded = true;
  keys.left = keys.right = false;
  run.speed = 26; run.maxSpeed = 26; run.dist = 0; run.spawnDist = 0; run.orbCount = 0; run.elapsed = 0; run.shakeTime = 0;
  run.combo = 0; run.comboTimer = 0; run.score = 0; run.streakTimer = 0; run.fovKick = 0;
  run.beatTimer = 0; run.beatGlow = 0; run.timeScale = 1; run.lastSpeedMark = 26; run.camRoll = 0; run.camY = 4.6;
  run.shieldReady = false; run.invuln = 0; run.orbCountAtShieldEvent = 0;
  run.maxCombo = 0;
  run.latVel = 0; run.stabilizerEngaged = false; run.dualHoldTime = 0; activePointers.clear();
  run.lastGuidedLane = null; run.lastGuidedDist = -Infinity;
  run.validPrevLanes = new Set([0, 1, 2]); run.lastPatternDist = -Infinity;
  for (const s of lists.shockwaves) view.scene.remove(s.m);
  lists.shockwaves = [];
  for (const met of meteors) {
    met.active = false;
    met.mesh.visible = false;
    met.timer = 1.2 + Math.random() * 2;
  }
  ui.els.vig.style.opacity = 0;
  ui.els.comboBox.style.opacity = 0;
  run.tier = 0;
  run.airJumps = 0; run.airFlip = 0; run.morphRoll = 0; run.shipBank = 0; run.shipMorph = 0;
  applyShipTier();
  poseShip(0, 0);
  view.camera.fov = 70;
  view.camera.updateProjectionMatrix();
  view.ship.position.set(0, 0.95, 0);
  view.ship.rotation.set(0, 0, 0);
  view.ship.visible = true;
  if (view.groundGlow) {
    view.groundGlow.visible = true;
    view.groundGlow.position.set(0, 0.02, 0.35);
    view.groundGlow.scale.set(1, 1, 1);
    if (view.groundGlowMat) view.groundGlowMat.opacity = 0.45;
  }
  updateHUD();
}

export function updateFsBtn() {
  const btn = $('fsBtn');
  if (btn) btn.style.display = (run.state === 'playing' && !run.paused) ? 'none' : 'flex';
}

export function startGame() {
  ensureAudio();
  if (run.overTimerId) { clearTimeout(run.overTimerId); run.overTimerId = null; }
  ui.resetRunSummary();
  resetGame();
  run.beatCount = 0;
  startEngine();
  run.state = 'playing'; run.paused = false;
  updateFsBtn();
  $('startScreen').classList.add('hidden');
  $('overScreen').classList.add('hidden');
}

export function gameOver() {
  run.state = 'over';
  updateFsBtn();
  crashSound();
  explode(view.ship.position);
  view.ship.visible = false;
  if (view.groundGlow) view.groundGlow.visible = false;
  run.shakeTime = 0.9;
  ui.flash('#ffffff', 0.5, 500);
  ui.els.comboBox.style.opacity = 0;
  ui.els.vig.style.opacity = 0;
  stopEngine();
  run.timeScale = 0.25;
  const sc = Math.floor(run.dist) + run.score;
  const isRecord = sc > run.best;
  if (isRecord) {
    run.best = sc;
    localStorage.setItem('neonRacerBest', run.best);
  }
  ui.els.bestEl.textContent = run.best;
  ui.prepareRunSummary({
    score: sc, distanceMeters: run.dist, orbCount: run.orbCount, maxCombo: run.maxCombo,
    topSpeedKmh: run.maxSpeed * 3.6, elapsed: run.elapsed, tier: run.tier, isRecord,
    tierColorHex: TIER_COLORS[run.tier].toString(16).padStart(6, '0')
  });
  run.overTimerId = setTimeout(() => {
    if (run.state === 'over') {
      $('overScreen').classList.remove('hidden');
      ui.playRunSummary(index => beep(420 + index * 105, 0.055, 'square', 0.045));
    }
  }, 900);
}

export function showPaused() {
  $('pauseScreen').classList.remove('hidden');
  updateFsBtn();
}

