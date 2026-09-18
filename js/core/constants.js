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

export const TIER_NAMES = ['', '引擎过载 · 鸭翼展开!', '能量护盾 · 装甲环绕!', '磁力场 · 磁叉伸展!', '量子跃迁 · 空中二段跳!!', '超载核心 · 终极双倍得分!!!'];

export const DOUBLE_JUMP_TIER = 4;

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

// 悬挂闸门：顶部垂帘式能量闸，悬浮/滞空一律撞毁，唯有滑铲才能通过
export const GATE_PASS_SCORE = 35;      // 滑铲穿闸基础分（实际得分 = 基础分 × GATE_SLIDE_MULT）
export const GATE_SLIDE_MULT = 2;       // 滑铲姿态穿闸的奖励倍率
export const GATE_INTRO_DIST = 260;     // 闸门登场里程（先让玩家熟悉基础节奏）
export const GATE_CHANCE = 0.35;        // 非低障障碍中闸门的替换概率
export const GATE_LOW_CLEAR = 8;        // 同车道 low→gate 安全余量（米）；实际窗口 = 0.7×车速 + 此值，覆盖跳跃滞空距离

// 滑铲：下甩/↓ 触发的贴地滑行动作，穿过悬挂闸门的正确姿势
export const SLIDE_DURATION = 0.75;     // 滑铲持续秒数
export const SLIDE_FASTFALL_V = -26;    // 滞空时触发的俯冲下降速度
export const SLIDE_DROP_Y = 0.16;       // 滑铲时机体压低量（刚性姿态，不做任何形变）
export const SLIDE_ROLL_DUR = 0.8;      // 滑铲刚性桶滚一周秒数（略长于滑铲时长，收尾自然回正）
export const SLIDE_WING_FOLD = 1.2;     // 滑铲收翼上折弧度（收紧回转半径，贴地滚转不扫到地面）
export const SLIDE_PITCH = 0.13;        // 滑铲桶滚时机首下压弧度（螺旋下潜姿态）

// 护甲核心：绿色特殊拾取物，吃到直接装备一层应急护甲（任意形态可用，抵挡一次撞击）
export const ARMOR_PICKUP_SCORE = 80;   // 装备护甲的得分
export const ARMOR_FULL_SCORE = 150;    // 护甲已在身时的替代得分
export const ARMOR_INTRO_DIST = 150;    // 护甲核心登场里程
export const ARMOR_MIN_GAP = 500;       // 两次护甲核心的最小间隔里程
export const ARMOR_CHANCE = 0.2;        // 满足间隔后每个 pattern 的投放概率

// Rush Wave：周期性冲刺浪潮
export const RUSH_FIRST_AT = 50;        // 首次触发（存活秒数；让基础速度先稳定下来）
export const RUSH_PERIOD = 45;          // 上一轮结束后到下一轮的间隔
export const RUSH_DURATION = 11;        // 每轮持续秒数
export const RUSH_BOOST = 13;           // 速度加成 m/s（平滑逼近）
export const RUSH_GAP_MULT = 0.78;      // 浪潮期生成间距倍率
export const RUSH_SCORE_MULT = 2;       // 浪潮期得分倍率

