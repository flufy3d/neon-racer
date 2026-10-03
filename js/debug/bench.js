// 测帧率用的自动驾驶（?bench=1）：一局固定跑 BENCH_RUN_SEC 秒，用于在电视盒子等设备上稳态测帧率。
// - 转向直接写 keys，跳跃 / 滑铲派发合成键盘事件（与真实键盘走同一条输入路径，input.js 不感知）
// - 自动驾驶漏判的碰撞由 world.js 兜底忽略（不触发护盾 / 坠毁特效），保证整局时长稳定
// - 不写最高分和成就存档（见 session.js / achievements.js）
// - 按状态（menu / playing / over）每 5 秒向 console 输出帧率，长帧单独输出，便于从 logcat 取数
import { LANES } from '../core/constants.js';
import { lists, run, view } from '../core/state.js';
import { keys } from '../game/input.js';
import { gameOver } from '../game/session.js';

const BENCH_RUN_SEC = 60;
const WINDOW_MS = 5000;
const LONG_FRAME_MS = 150;

let runTime = 0;
export let benchSavedCrashes = 0;

function press(code) {
  dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

function laneOf(x) {
  return x < -1.25 ? 0 : x > 1.25 ? 2 : 1;
}

// 每条车道在前方时间窗内的代价：墙必须换道；低障 / 闸门可跳 / 铲过，轻微惩罚；能量球加分。
const laneCost = new Float32Array(3);

function autopilot() {
  const ship = view.ship;
  const speed = Math.max(run.speed, 1);
  const cur = laneOf(ship.position.x);
  for (let i = 0; i < 3; i++) laneCost[i] = Math.abs(i - cur) * 0.6;
  let jumpNeeded = false;
  let slideNeeded = false;
  for (const o of lists.obstacles) {
    const z = o.position.z;
    if (z > 1.5) continue;
    const tti = -z / speed;
    if (tti > 1.1) continue;
    const lane = laneOf(o.position.x);
    const type = o.userData.type;
    if (type === 'wall') laneCost[lane] += 100;
    else laneCost[lane] += 1.5;
    if (Math.abs(o.position.x - ship.position.x) < 1.85) {
      if (type === 'low' && tti > 0.04 && tti < 0.34) jumpNeeded = true;
      if (type === 'gate' && tti < 0.5) slideNeeded = true;
    }
  }
  for (const o of lists.orbs) {
    const tti = -o.z / speed;
    if (tti > 0 && tti < 1.0) laneCost[laneOf(o.x)] -= 1;
  }
  let best = cur;
  for (let i = 0; i < 3; i++) if (laneCost[i] < laneCost[best]) best = i;

  // 提前松键，靠减速度（175 m/s²）停在车道中心附近
  const dx = LANES[best] - ship.position.x;
  const brake = run.latVel * run.latVel / 350 + 0.12;
  keys.right = dx > brake;
  keys.left = dx < -brake;

  if (jumpNeeded && run.grounded) press('ArrowUp');
  else if (slideNeeded && run.slideTimer <= 0) press('ArrowDown');
}

// ── 帧率统计 ──
let winStart = 0, winFrames = 0, winWorst = 0, winSlow = 0, winJank = 0, winState = '';
let lastT = 0;

function stats(now) {
  if (!lastT) { lastT = winStart = now; winState = run.state; return; }
  const d = now - lastT;
  lastT = now;
  if (run.state !== winState || d > 2000) {
    // 状态切换（或后台恢复）时丢弃不完整窗口，保证每个窗口只含一种状态
    winStart = now; winFrames = 0; winWorst = 0; winSlow = 0; winJank = 0; winState = run.state;
    return;
  }
  winFrames++;
  if (d > winWorst) winWorst = d;
  if (d > 1000 / 30) winSlow++;
  if (d > 50) winJank++;
  if (d > LONG_FRAME_MS) {
    console.log(`[bench] long ${d.toFixed(0)}ms state=${run.state} run=${runTime.toFixed(1)}s dist=${run.dist.toFixed(0)}`);
  }
  if (now - winStart >= WINDOW_MS) {
    const c = view.renderer.domElement;
    console.log(`[bench] state=${winState} fps=${(winFrames * 1000 / (now - winStart)).toFixed(1)} worst=${winWorst.toFixed(0)}ms` +
      ` slow=${winSlow}/${winFrames} jank(>50ms)=${winJank} canvas=${c.width}x${c.height}`);
    winStart = now; winFrames = 0; winWorst = 0; winSlow = 0; winJank = 0;
  }
}

export function benchTick(dt) {
  stats(performance.now());
  if (run.state !== 'playing') { runTime = 0; return; }
  if (run.paused) return;
  runTime += dt;
  if (runTime >= BENCH_RUN_SEC) {
    console.log(`[bench] run done ${runTime.toFixed(1)}s dist=${run.dist.toFixed(0)} orbs=${run.orbCount} tier=${run.tier} saved=${benchSavedCrashes}`);
    keys.left = keys.right = false;
    gameOver();
    return;
  }
  autopilot();
}

export function benchSaveCrash() {
  benchSavedCrashes++;
}
