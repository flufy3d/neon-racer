import { run, view } from '../core/state.js';
import { updateAmbient, updateMenu } from './phases/ambient.js';
import { updateShipControl } from './phases/control.js';
import { updateRunFeedbackAndCamera, updateTransientFx } from './phases/feedback.js';
import { updateComboAndOrbs } from './phases/pickups.js';
import { updateRunProgress } from './phases/progress.js';
import { updateObstacles, updateScenery } from './phases/world.js';

export function triggerSlowMo(scale = 0.14, duration = 0.62) {
  run.slowMoTimer = duration;
  run.slowMoMaxDuration = duration;
  run.targetTimeScale = scale;
}

function advanceFrame(dt, t) {

  updateAmbient(dt, t);
  if (run.state === 'menu') updateMenu(dt, t);

  // Sample this once: gameOver() must not skip later work in an entered playing frame.
  const enteredPlaying = run.state === 'playing' && !run.paused;
  if (enteredPlaying) {
    // 黑客帝国 S 型子弹时间平滑流速曲线（优雅凝结 -> 悬浮特写 -> 弓弦弹射回升）
    if (run.slowMoTimer > 0) {
      run.slowMoTimer -= dt;
      if (run.slowMoTimer <= 0) {
        run.slowMoTimer = 0;
        run.slowMoMaxDuration = 0;
      } else {
        const p = 1 - run.slowMoTimer / (run.slowMoMaxDuration || 0.62);
        let desired = 1.0;
        const target = run.targetTimeScale || 0.14;
        if (p < 0.15) {
          // 优雅凝结，拒绝急刹阻滞
          desired = 1.0 - (1.0 - target) * (p / 0.15);
        } else if (p < 0.65) {
          // 悬浮慢动作特写窗口
          desired = target + (p - 0.15) * 0.08;
        } else {
          // 弓弦弹射加速恢复极速
          const rebound = (p - 0.65) / 0.35;
          const startVal = target + 0.50 * 0.08;
          desired = startVal + (1.0 - startVal) * Math.pow(rebound, 2.2);
        }
        run.timeScale = Math.max(0.08, Math.min(1.0, desired));
      }
    } else {
      run.timeScale += (1.0 - run.timeScale) * Math.min(1, dt * 6.0);
      if (Math.abs(1.0 - run.timeScale) < 0.005) run.timeScale = 1.0;
    }

    const simDt = dt * run.timeScale;
    const move = updateRunProgress(simDt);
    // 关键：战机操控使用真实 dt，手感敏捷自由如 Neo 躲子弹，彻底消除操作阻滞粘滞感！
    updateShipControl(dt, t, move);
    updateScenery(simDt, t, move);
    updateObstacles(simDt, t, move);
    updateComboAndOrbs(simDt, t, move);
    updateRunFeedbackAndCamera(dt, t, move);
  }
  updateTransientFx(dt, t);
  view.composer.render();
}

export function animate() {
  requestAnimationFrame(animate);
  advanceFrame(Math.min(view.clock.getDelta(), 0.05), view.clock.elapsedTime);
}

