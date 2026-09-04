import { run, view } from '../core/state.js';
import { updateAmbient, updateMenu } from './phases/ambient.js';
import { updateShipControl } from './phases/control.js';
import { updateRunFeedbackAndCamera, updateTransientFx } from './phases/feedback.js';
import { updateComboAndOrbs } from './phases/pickups.js';
import { updateRunProgress } from './phases/progress.js';
import { updateObstacles, updateScenery } from './phases/world.js';

function advanceFrame(dt, t) {

  updateAmbient(dt, t);
  if (run.state === 'menu') updateMenu(dt, t);

  // Sample this once: gameOver() must not skip later work in an entered playing frame.
  const enteredPlaying = run.state === 'playing' && !run.paused;
  if (enteredPlaying) {
    const move = updateRunProgress(dt);
    updateShipControl(dt, t, move);
    updateScenery(dt, t, move);
    updateObstacles(dt, t, move);
    updateComboAndOrbs(dt, t, move);
    updateRunFeedbackAndCamera(dt, t, move);
  }
  updateTransientFx(dt, t);
  view.composer.render();
}

export function animate() {
  requestAnimationFrame(animate);
  advanceFrame(Math.min(view.clock.getDelta(), 0.05), view.clock.elapsedTime);
}

