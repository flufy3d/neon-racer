import { MILESTONE_ZONES, TIER_COLORS } from '../core/constants.js';
import { getAudioSnapshot } from '../audio.js';
import { lists, run, view } from '../core/state.js';
import { makeLow, makeOrb, makeOverheadArch, makeRoadsideRelay, makeWall, makeWarpBeacon } from '../entities/obstacles.js';
import { updateGroundGlow } from '../scene/ground.js';
import { lowCoreMat, lowEdgeMat, wallCoreMat, wallEdgeMat } from '../scene/materials.js';

window.__neon = {
  get audio() { return getAudioSnapshot(); },
  get scene() { return view.scene; },
  get camera() { return view.camera; },
  get renderer() { return view.renderer; },
  get composer() { return view.composer; },
  get bloomPass() { return view.bloomPass; },
  get ship() { return view.ship; },
  get view() { return view; },
  get run() { return run; },
  get lists() { return lists; },
  get state() { return run.state; },
  get tier() { return run.tier; },
  get groundGlow() { return view.groundGlow; },
  get groundGlowMat() { return view.groundGlowMat; },
  updateGroundGlow,
  makeWall,
  makeLow,
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
  MILESTONE_ZONES,
  TIER_COLORS
};

