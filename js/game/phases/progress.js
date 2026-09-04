import { beep } from '../../audio.js';
import { MILESTONE_ZONES } from '../../core/constants.js';
import { lists, run, view } from '../../core/state.js';
import { makeOverheadArch, makePillar, makeRoadsideRelay, makeRoadsideStructure, makeWarpBeacon } from '../../entities/obstacles.js';
import { spawnPattern } from '../../entities/spawner.js';
import * as ui from '../../ui.js';

export function updateRunProgress(dt) {
run.elapsed += dt;
run.speed = Math.min(72, 26 + run.elapsed * 0.55);
run.maxSpeed = Math.max(run.maxSpeed, run.speed);
const move = run.speed * dt;
run.dist += move;
run.spawnDist += move;

const gap = Math.max(15, 26 - run.elapsed * 0.25);
while (run.spawnDist >= gap) {
  const overshoot = run.spawnDist - gap;
  run.spawnDist -= gap;
  spawnPattern(overshoot, gap);
}

if ((run.dist % 14) < move) {
  const p = makePillar(-150);
  lists.pillars.push(p);
  view.scene.add(p);
}
if ((run.dist % 24) < move) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const relayChance = run.currentZoneIndex === 0 ? 0 : (run.currentZoneIndex === 1 ? 0.35 : 0.55);
  const rs = Math.random() < relayChance ? makeRoadsideRelay(side, -150) : makeRoadsideStructure(side, -150);
  lists.roadside.push(rs);
  view.scene.add(rs);
}
if (run.currentZoneIndex >= 2 && (run.dist % 45) < move) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const wb = makeWarpBeacon(side, -150);
  lists.warpBeacons.push(wb);
  view.scene.add(wb);
}

while (run.currentZoneIndex + 1 < MILESTONE_ZONES.length && run.dist >= MILESTONE_ZONES[run.currentZoneIndex + 1].dist) {
  run.currentZoneIndex++;
  const zInfo = MILESTONE_ZONES[run.currentZoneIndex];
  ui.milestoneBanner(zInfo.name, `已行驶 ${Math.floor(run.dist)} M`, zInfo.color);
  beep(880, 0.16, 'sine', 0.12);
  setTimeout(() => beep(1320, 0.22, 'sine', 0.12), 110);
}

const curZone = MILESTONE_ZONES[run.currentZoneIndex];
if (curZone.archFreq > 0 && (run.dist - run.lastArchDist >= curZone.archFreq)) {
  run.lastArchDist = run.dist;
  const arch = makeOverheadArch(-150);
  lists.arches.push(arch);
  view.scene.add(arch);
}


  return move;
}

