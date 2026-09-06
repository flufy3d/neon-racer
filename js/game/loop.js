import { run, view } from '../core/state.js';
import { updateAmbient, updateMenu } from './phases/ambient.js';
import { updateShipControl } from './phases/control.js';
import { updateRunFeedbackAndCamera, updateTransientFx } from './phases/feedback.js';
import { updateComboAndOrbs } from './phases/pickups.js';
import { updateRunProgress } from './phases/progress.js';
import { updateObstacles, updateScenery } from './phases/world.js';

export function triggerSlowMo(scale = 0.18, duration = 0.45) {
  run.timeScale = Math.min(run.timeScale, scale);
  run.slowMoTimer = Math.max(run.slowMoTimer, duration);
}

function advanceFrame(dt, t) {

  updateAmbient(dt, t);
  if (run.state === 'menu') updateMenu(dt, t);

  // Sample this once: gameOver() must not skip later work in an entered playing frame.
  const enteredPlaying = run.state === 'playing' && !run.paused;
  if (enteredPlaying) {
    // 慢动作计时器按真实时间倒计时，结束后平滑恢复正常时空流速
    if (run.slowMoTimer > 0) {
      run.slowMoTimer -= dt;
      if (run.slowMoTimer <= 0) run.slowMoTimer = 0;
    } else {
      run.timeScale += (1.0 - run.timeScale) * Math.min(1, dt * 5.0);
      if (Math.abs(1.0 - run.timeScale) < 0.005) run.timeScale = 1.0;
    }

    const simDt = dt * run.timeScale;
    const move = updateRunProgress(simDt);
    updateShipControl(simDt, t, move);
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

