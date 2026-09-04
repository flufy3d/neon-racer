export const LANES = [-2.5, 0, 2.5];

export const CENTER_X = LANES[1];

export const GRAVITY = -38, JUMP_V = 13;

export const COMBO_WINDOW = 2.5;

export const TRACK_HALF = 2.5;

const MIN_OUTER_SWAP_TIME = 0.32;

export const STABILIZER_ACCEL = 340;

export const STABILIZER_GAIN = 16;

export const SWIPE_JUMP = 40;

export const SWIPE_AIRJUMP = 30;

export const TOASTS = { 5: '手感来了!', 10: '连击狂潮!', 15: '火力全开!', 20: '超神操作!', 30: '登峰造极!!' };

export const TIER_COLORS = [0x00ffff, 0x66ff22, 0xffee00, 0xff8822, 0xff22cc, 0xb066ff];

export const TIER_NAMES = ['', '引擎过载 · 鸭翼展开!', '能量护盾 · 装甲环绕!', '磁力场 · 磁叉伸展!', '超载核心 · 双倍得分!!', '量子跃迁 · 空中二段跳!!!'];

export const MAX_TIER = TIER_COLORS.length - 1;

export const MILESTONE_ZONES = [
  { dist: 0,    name: 'ZONE 1 · 赛博黎明', color: '#00ffff', bgHex: 0x05050f, fogHex: 0x05050f, archFreq: 0,
    wallEdgeHex: 0xff1155, wallCoreHex: 0xff0055, lowEdgeHex: 0xffaa00, lowCoreHex: 0xffaa00 },
  { dist: 400,  name: 'ZONE 2 · 霓虹拱门', color: '#ff00aa', bgHex: 0x0e051a, fogHex: 0x0e051a, archFreq: 110,
    wallEdgeHex: 0xff00aa, wallCoreHex: 0xff0088, lowEdgeHex: 0x00ffff, lowCoreHex: 0x00ddff },
  { dist: 1200, name: 'ZONE 3 · 跃迁信标', color: '#ffaa00', bgHex: 0x180812, fogHex: 0x180812, archFreq: 85,
    wallEdgeHex: 0xffaa00, wallCoreHex: 0xff8800, lowEdgeHex: 0xff00ff, lowCoreHex: 0xee00ee },
  { dist: 2500, name: 'ZONE 4 · 极光奇点', color: '#00ff88', bgHex: 0x041614, fogHex: 0x041614, archFreq: 65,
    wallEdgeHex: 0x00ff88, wallCoreHex: 0x00dd66, lowEdgeHex: 0xffee00, lowCoreHex: 0xffcc00 },
  { dist: 4000, name: 'ZONE 5 · 量子深空', color: '#b066ff', bgHex: 0x120428, fogHex: 0x120428, archFreq: 50,
    wallEdgeHex: 0xb066ff, wallCoreHex: 0x9944ff, lowEdgeHex: 0x00ffcc, lowCoreHex: 0x00ddbb }
];

export const PARTICLE_POOL_SIZE = 24;

export const MAX_PARTICLES_PER_BURST = 240;

