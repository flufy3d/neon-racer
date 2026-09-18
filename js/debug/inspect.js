import { MILESTONE_ZONES, TIER_COLORS } from '../core/constants.js';
import { getAudioSnapshot, getBeatGrid } from '../audio.js';
import { quality } from '../core/quality.js';
import { lists, run, view } from '../core/state.js';
import { makeArmorCore, makeGate, makeLow, makeOrb, makeOverheadArch, makeRoadsideRelay, makeWall, makeWarpBeacon } from '../entities/obstacles.js';
import { stepFrame } from '../game/loop.js';
import {
  ACHIEVEMENTS, achEvent, achTick, onGameEnd, resetRunCounters,
  openArchive, closeArchive, isArchiveOpen, isUnlocked, unlockedCount, getTotals
} from '../game/achievements.js';
import { applyShipTier } from '../entities/ship.js';
import { updateGroundGlow } from '../scene/ground.js';
import { gateCoreMat, gateEdgeMat, lowCoreMat, lowEdgeMat, wallCoreMat, wallEdgeMat } from '../scene/materials.js';

window.__neon = {
  get audio() { return getAudioSnapshot(); },
  get scene() { return view.scene; },
  get camera() { return view.camera; },
  get renderer() { return view.renderer; },
  get composer() { return view.composer; },
  get bloomPass() { return view.bloomPass; },
  get ship() { return view.ship; },
  get view() { return view; },
  get quality() { return quality; },
  get run() { return run; },
  get lists() { return lists; },
  get state() { return run.state; },
  get tier() { return run.tier; },
  get groundGlow() { return view.groundGlow; },
  get groundGlowMat() { return view.groundGlowMat; },
  updateGroundGlow,
  stepFrame,
  beatGrid: getBeatGrid,
  applyShipTier,
  makeWall,
  makeLow,
  makeGate,
  makeArmorCore,
  makeOrb,
  makeOverheadArch,
  makeRoadsideRelay,
  makeWarpBeacon,
  get warpBeacons() { return lists.warpBeacons; },
  get sky() { return view.sky; },
  get cyberSun() { return view.cyberSun; },
  get singularityHalo() { return view.singularityHalo; },
  get sideFibres() { return lists.sideFibres; },
  get currentZoneIndex() { return run.currentZoneIndex; },
  get wallEdgeMat() { return wallEdgeMat; },
  get lowEdgeMat() { return lowEdgeMat; },
  get wallCoreMat() { return wallCoreMat; },
  get lowCoreMat() { return lowCoreMat; },
  get gateEdgeMat() { return gateEdgeMat; },
  get gateCoreMat() { return gateCoreMat; },
  MILESTONE_ZONES,
  TIER_COLORS,
  // 成就系统测试口：achEvent/achTick/onGameEnd 可直接驱动判定链路
  achEvent,
  achTick,
  achGameEnd: onGameEnd,
  achReset: resetRunCounters,
  achOpen: openArchive,
  achClose: closeArchive,
  get achOpenState() { return isArchiveOpen(); },
  achDefs: ACHIEVEMENTS,
  get achState() {
    return {
      totals: getTotals(),
      count: unlockedCount(),
      unlocked: ACHIEVEMENTS.filter(d => isUnlocked(d.id)).map(d => d.id)
    };
  }
};

