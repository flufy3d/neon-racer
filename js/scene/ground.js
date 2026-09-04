import { run, view } from '../core/state.js';

export function updateGroundGlow() {
  if (!view.groundGlow) return;
  view.groundGlow.position.x = view.ship.position.x;
  view.groundGlow.position.z = view.ship.position.z + 0.35;
  const h = Math.max(0, view.ship.position.y - 0.95);
  const scaleFactor = 1 + h * 0.4;
  view.groundGlow.scale.set(scaleFactor, scaleFactor, 1);
  view.groundGlowMat.opacity = Math.max(0.06, 0.45 - h * 0.16);
  view.groundGlow.visible = view.ship.visible && run.state !== 'over';
}

