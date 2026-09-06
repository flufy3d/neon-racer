import { getAudioBeat, playSound, updateAudioState } from '../../audio.js';
import { COMBO_WINDOW, MILESTONE_ZONES } from '../../core/constants.js';
import { $ } from '../../core/dom.js';
import { lists, run, view } from '../../core/state.js';
import { updateBurstParticles, updateShipTrail, updateShockwaves, updateShards } from '../../entities/particles.js';
import { archNeonMat, lowCoreMat, lowEdgeMat, towerCapMat, towerSpireMat, wallCoreMat, wallEdgeMat } from '../../scene/materials.js';
import { BG_BASE, WHITE, currentLowCoreCol, currentLowEdgeCol, currentWallCoreCol, currentWallEdgeCol, targetLowCoreCol, targetLowEdgeCol, targetWallCoreCol, targetWallEdgeCol, tmpColB } from '../../scene/palette.js';
import * as ui from '../../ui.js';
import { showPaused } from '../session.js';

export function updateRunFeedbackAndCamera(dt, t, move) {
// Collision handling may already have ended this run earlier in the frame.
// The audio session rejects updates/events after that transition.
updateAudioState({ speed: run.speed, tier: run.tier, combo: run.combo, zone: run.currentZoneIndex });

if (run.speed - run.lastSpeedMark >= 10) {
  run.lastSpeedMark = run.speed;
  ui.toast('速度提升!', '#ff8822');
  run.fovKick += 3;
  playSound('speed');
}

if (run.combo > 0) {
  ui.els.vig.style.setProperty('--vc', ui.comboColor(ui.multOf(run.combo)));
  ui.els.vig.style.opacity = Math.min(0.85, 0.18 + ui.multOf(run.combo) * 0.07) * Math.max(0, run.comboTimer / COMBO_WINDOW);
} else ui.els.vig.style.opacity = 0;

const jumpLift = Math.max(0, view.ship.position.y - 1.02);
const targetCamY = 4.6 + jumpLift * 0.40;
run.camY += (targetCamY - run.camY) * Math.min(1, dt * 12);

// 黑客帝国弧形环切运镜（Camera Orbit Sweep & Dutch Tilt）
let targetSweepX = 0, targetSweepY = 0, targetSweepZ = 0, matrixRoll = 0;
if (run.slowMoTimer > 0 && run.slowMoMaxDuration > 0) {
  const p = 1 - run.slowMoTimer / run.slowMoMaxDuration;
  // 正弦加权包络：慢动作中段达到峰值 1.0，头尾平滑过渡为 0
  const sweepWeight = Math.sin(p * Math.PI);
  // 向开阔侧优美弧形环切
  const sweepSide = (view.ship.position.x >= 0 ? -1 : 1);
  targetSweepX = sweepSide * 2.2 * sweepWeight;
  targetSweepY = -0.75 * sweepWeight; // 视角略微压低仰角抓拍，力量感拉满
  targetSweepZ = -1.3 * sweepWeight;  // 镜头向前微距推移 1.3 米，近距离呈现多面体破片悬浮特写
  matrixRoll = sweepSide * 0.11 * sweepWeight; // 经典好莱坞电影微倾角（Dutch Tilt）
}

run.camSweepX += (targetSweepX - run.camSweepX) * Math.min(1, dt * 10);
run.camSweepY += (targetSweepY - run.camSweepY) * Math.min(1, dt * 10);
run.camSweepZ += (targetSweepZ - run.camSweepZ) * Math.min(1, dt * 10);

view.camera.position.x = view.ship.position.x * 0.35 + run.camSweepX;
view.camera.position.y = run.camY + run.camSweepY;
view.camera.position.z = 8.5 + run.camSweepZ;

const lookTargetX = view.ship.position.x * 0.5 - run.camSweepX * 0.28;
const lookTargetY = 1 + jumpLift * 0.25 - run.camSweepY * 0.25;
view.camera.lookAt(lookTargetX, lookTargetY, -12);

if (view.cyberSun) {
  view.cyberSun.position.x = view.ship.position.x * 2.31;
}
run.camRoll += (-run.latVel * 0.0016 + matrixRoll - run.camRoll) * Math.min(1, dt * 8);
view.camera.rotation.z += run.camRoll;

run.fovKick *= Math.exp(-dt * 5);
view.camera.fov = 70 + ((run.speed - 26) / 46) * 12 + run.fovKick;
view.camera.updateProjectionMatrix();

// 随里程平滑过渡环境基色、远景雾效与障碍物主题配色
const curZoneCfg = MILESTONE_ZONES[run.currentZoneIndex];
tmpColB.setHex(curZoneCfg.bgHex);
BG_BASE.lerp(tmpColB, dt * 1.5);
if (view.scene.fog) view.scene.fog.color.lerp(tmpColB, dt * 1.5);

targetWallEdgeCol.setHex(curZoneCfg.wallEdgeHex);
targetLowEdgeCol.setHex(curZoneCfg.lowEdgeHex);
targetWallCoreCol.setHex(curZoneCfg.wallCoreHex);
targetLowCoreCol.setHex(curZoneCfg.lowCoreHex);
currentWallEdgeCol.lerp(targetWallEdgeCol, dt * 2.0);
currentLowEdgeCol.lerp(targetLowEdgeCol, dt * 2.0);
currentWallCoreCol.lerp(targetWallCoreCol, dt * 2.0);
currentLowCoreCol.lerp(targetLowCoreCol, dt * 2.0);

}

export function updateTransientFx(dt, t) {
const pdt = dt * run.timeScale;
const move = (run.state === 'playing' && !run.paused) ? (run.speed * pdt) : 0;
updateBurstParticles(pdt, move);
updateShockwaves(pdt, move);
updateShards(pdt, move);
updateShipTrail(dt, t);

if (run.state === 'playing' && !run.paused) {
  const beat = getAudioBeat();
  run.beatGlow = beat.glow;
  run.beatCount = beat.count;
} else run.beatGlow *= Math.exp(-dt * 6);
view.grid.material.opacity = 0.72 + run.beatGlow * 0.28;
if (view.bloomPass) view.bloomPass.strength = 1.1 + run.beatGlow * 0.35;
wallCoreMat.opacity = 0.65 + run.beatGlow * 0.35;
lowCoreMat.opacity = 0.65 + run.beatGlow * 0.35;
wallCoreMat.color.copy(currentWallCoreCol);
lowCoreMat.color.copy(currentLowCoreCol);
wallEdgeMat.color.copy(currentWallEdgeCol).lerp(WHITE, run.beatGlow * 0.35);
lowEdgeMat.color.copy(currentLowEdgeCol).lerp(WHITE, run.beatGlow * 0.35);
towerCapMat.color.setHex(0x00ffff).lerp(WHITE, run.beatGlow * 0.35);
towerSpireMat.color.setHex(0xff0088).lerp(WHITE, run.beatGlow * 0.35);
archNeonMat.color.setHex(0xff00aa).lerp(WHITE, run.beatGlow * 0.35);
if (run.state === 'over') run.timeScale += (1 - run.timeScale) * dt * 2;

if (run.shakeTime > 0) {
  run.shakeTime -= dt;
  const s = run.shakeTime * 0.5;
  view.camera.position.x += (Math.random() - 0.5) * s;
  view.camera.position.y += (Math.random() - 0.5) * s;
} else if (run.state !== 'playing') {
  run.camY = 4.6;
  view.camera.position.y = 4.6;
  view.camera.position.x *= 0.9;
}

if (run.paused && !run.showPending) { run.showPending = true; showPaused(); }
if (!run.paused && run.showPending) { run.showPending = false; $('pauseScreen').classList.add('hidden'); }

}

