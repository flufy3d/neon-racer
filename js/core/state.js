// 运行时状态只有一个所有者，分三组，边界清晰：
//
//   view  —— 渲染单例。initScene() 装配一次，之后只读不换。
//   lists —— 场景里的活动实体集合。
//   run   —— 一局游戏里逐帧变化的标量。
//
// 用对象而不是模块顶层 let，是因为 ES module 的 import 绑定是只读的：
// 想让多个模块写同一份状态，就必须让状态有一个显式的宿主。

export const view = {
  scene: undefined, camera: undefined, renderer: undefined, composer: undefined, clock: undefined,
  bloomPass: undefined, railMat: undefined, grid: undefined, ship: undefined, shipGlowMat: undefined,
  groundGlow: undefined, groundGlowMat: undefined, sky: undefined,
  cyberSun: undefined, singularityHalo: undefined
};

export const lists = {
  obstacles: [], orbs: [], pillars: [], roadside: [], arches: [],
  warpBeacons: [], sideFibres: [], particles: [], streaks: [], shockwaves: []
};

export const run = {
  lastArchDist: 0, currentZoneIndex: 0, state: 'menu', paused: false,
  vy: 0, grounded: true,
  speed: 26, maxSpeed: 26, dist: 0, spawnDist: 0, orbCount: 0, elapsed: 0, score: 0,
  shakeTime: 0, best: +(localStorage.getItem('neonRacerBest') || 0),
  combo: 0, comboTimer: 0, maxCombo: 0, streakTimer: 0, fovKick: 0,
  beatGlow: 0, beatCount: 0, timeScale: 1, slowMoTimer: 0, lastSpeedMark: 26, camRoll: 0, camY: 4.6,
  overTimerId: null, shieldReady: false, invuln: 0, orbCountAtShieldEvent: 0, tier: 0,
  shipMorph: 0, morphRoll: 0, shipBank: 0, airFlip: 0, airJumps: 0, latVel: 0,
  stabilizerEngaged: false, dualHoldTime: 0, lastGuidedLane: null, lastGuidedDist: -Infinity,
  validPrevLanes: new Set([0, 1, 2]), lastPatternDist: -Infinity, showPending: false
};
