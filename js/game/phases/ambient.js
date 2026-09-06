import { lists, run, view } from '../../core/state.js';
import { updateShipMorph } from '../../entities/ship-pose.js';
import { updateGroundGlow } from '../../scene/ground.js';
import { updateSky } from '../../scene/sky.js';

export function updateAmbient(dt, t) {
  view.grid.position.z = (view.grid.position.z + (run.state === 'playing' ? run.speed : 8) * dt) % 4;
updateSky(dt);
const isZone5 = run.currentZoneIndex >= 4;
for (const sf of lists.sideFibres) {
  sf.visible = isZone5;
  if (isZone5) {
    sf.material.opacity = 0.5 + Math.sin(t * 14 + sf.position.x) * 0.35;
  }
}

run.morphRoll *= Math.exp(-dt * 3.4);
if (Math.abs(run.morphRoll) < 0.004) run.morphRoll = 0;
run.airFlip *= Math.exp(-dt * 4.6);
if (Math.abs(run.airFlip) < 0.004) run.airFlip = 0;
updateShipMorph(dt, t);


}

export function updateMenu(dt, t) {
view.ship.position.x = Math.sin(t) * 2.5;
run.shipBank = -Math.cos(t) * 0.35;
view.ship.rotation.set(0, 0, run.shipBank);
view.ship.position.y = 0.95 + Math.sin(t * 3) * 0.1;
view.camera.lookAt(view.ship.position.x * 0.4, 1, -12);
if (view.cyberSun) view.cyberSun.position.x = view.ship.position.x * 2.31;
updateGroundGlow();

}

