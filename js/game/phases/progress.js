import { getBeatGrid, playSound } from '../../audio.js';
import { MILESTONE_ZONES, RUSH_BOOST, RUSH_DURATION, RUSH_GAP_MULT, RUSH_PERIOD } from '../../core/constants.js';
import { lists, run, view } from '../../core/state.js';
import { makeOverheadArch, makeRoadsideRelay, makeRoadsideStructure, makeWarpBeacon } from '../../entities/obstacles.js';
import { spawnPillarInstance } from './world.js';
import { spawnPattern } from '../../entities/spawner.js';
import { achEvent } from '../achievements.js';
import * as ui from '../../ui.js';

// Rush Wave 冲刺浪潮：速度涌增 + 生成加密 + 得分加成的周期性高潮段
function updateRush(dt) {
  if (run.rushTimer > 0) {
    run.rushTimer -= dt;
    if (run.rushTimer <= 0) {
      run.rushTimer = 0;
      run.rushNextAt = run.elapsed + RUSH_PERIOD;
      ui.toast('浪潮退去 · 平流层喘息', '#66ccff');
      playSound('rushEnd');
      // 活着撑到浪潮自然退去 = 完整存活一轮
      achEvent('rushSurvived');
      // 张力释放：浪潮结束后 7 秒稀疏平流层
      run.calmTimer = 7;
    }
  } else if (run.elapsed >= run.rushNextAt && run.slowMoTimer <= 0) {
    run.rushTimer = RUSH_DURATION;
    ui.rushBanner();
    playSound('rushStart');
    run.fovKick += 6;
    run.shakeTime = Math.max(run.shakeTime, 0.3);
  }
  const target = run.rushTimer > 0 ? RUSH_BOOST : 0;
  run.rushBoost += (target - run.rushBoost) * Math.min(1, dt * (run.rushTimer > 0 ? 1.4 : 0.9));
  if (run.rushTimer === 0 && run.rushBoost < 0.05) run.rushBoost = 0;
}

// 音游化 spawn：障碍"抵达舰体"的时刻锚定在音乐 16 分音符网格上，
// 躲避动作永远落在节拍点。目标网格点在每次生成后立刻锚定（上次落点 + K 步），
// BPM 随车速平滑变化导致的漂移在每次重锚时自动归零。
function spawnStep() {
  // 间距「时间制」：gapTime 即波次抵达间隔（秒），随时间从 1.0s 收紧到 0.45s 底线，
  // 名义间距随车速放大 → 音游取整误差缩回 ±半步，高速不再跌破下限
  const gapTime = Math.max(0.45, 1.0 - run.elapsed * 0.004);
  let gap = Math.max(14, run.speed * gapTime);
  if (run.rushTimer > 0) gap *= RUSH_GAP_MULT;
  // 喘息期：Rush 后 / 升档瞬间的张力释放，波次放宽 35%
  if (run.calmTimer > 0) gap *= 1.35;

  const grid = getBeatGrid();
  if (!grid) {
    // 音乐网格不可用（启动瞬间/无音频环境）：退回纯距离制
    while (run.spawnDist >= gap) {
      const overshoot = run.spawnDist - gap;
      run.spawnDist -= gap;
      spawnPattern(overshoot, gap);
      run.lastSpawnBeat = null;
    }
    return;
  }
  // 子弹时间内暂停生成（模拟时钟与音频时钟失联）；恢复后由重锚逻辑接上
  if (run.slowMoTimer > 0) return;

  const stepDur = grid.beatDur / 4;
  const mPerStep = run.speed * stepDur;

  if (run.rhythmTarget == null) {
    const kSteps = Math.max(1, Math.round(gap / mPerStep));
    // 目标抵达步必须落在"现在 + 旅行步数"之外，否则抵达窗口已成过去式，会连发补帧。
    // 正常链式锚定直接用上次落点（容差 1 步吸收帧抖动）；首锚或窗口错过时重锚到未来整数步。
    const travelSteps = 140 / Math.max(run.speed, 1) / stepDur;
    const minBase = grid.absStep + travelSteps;
    const base = (run.lastSpawnBeat != null && run.lastSpawnBeat > minBase - 1)
      ? run.lastSpawnBeat
      : Math.ceil(minBase);
    run.rhythmTarget = base + kSteps;
    run.rhythmK = kSteps;
    return;
  }

  // 障碍生成于 z=-140，抵达舰体 z=0 需 140/speed 秒；到点即刻生成
  const targetTime = grid.timeAtStep(run.rhythmTarget);
  if (grid.now >= targetTime - 140 / Math.max(run.speed, 1)) {
    spawnPattern(0, run.rhythmK * mPerStep);
    run.lastSpawnBeat = run.rhythmTarget;
    run.rhythmTarget = null;
    run.spawnDist = 0;
  }
}

export function updateRunProgress(dt) {
run.elapsed += dt;
updateRush(dt);
if (run.calmTimer > 0) run.calmTimer = Math.max(0, run.calmTimer - dt);
// 渐近速度曲线：前期爬升快（成长爽感）、后期趋缓（心流通道）；极速 72 只在 Rush 波内触及
run.speed = Math.min(72, 26 + 40 * (1 - Math.exp(-run.elapsed / 95)) + run.rushBoost);
run.maxSpeed = Math.max(run.maxSpeed, run.speed);
const move = run.speed * dt;
run.dist += move;
run.spawnDist += move;

spawnStep();

if ((run.dist % 14) < move) {
  spawnPillarInstance(-150);
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
  playSound('zone');
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
