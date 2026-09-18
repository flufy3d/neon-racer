import { run, view } from '../core/state.js';

export function updateGroundGlow() {
  if (!view.groundGlow) return;
  view.groundGlow.position.x = view.ship.position.x;
  view.groundGlow.position.z = view.ship.position.z + 0.35;
  const h = Math.max(0, view.ship.position.y - 0.95);
  // 贴地掠行时地效光垫增亮放大，机腹下方形成气垫辉光
  const scaleFactor = 1 + h * 0.4 + run.slideK * 0.22;
  view.groundGlow.scale.set(scaleFactor, scaleFactor, 1);
  view.groundGlowMat.opacity = Math.max(0.06, 0.45 - h * 0.16 + run.slideK * 0.2);
  view.groundGlow.visible = view.ship.visible && run.state !== 'over';
}

