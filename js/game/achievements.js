// 成就系统：数据驱动的单一定义表，三条判定路径共享同一张表——
//   1. achEvent()   离散事件（滑铲过闸/完美跳/擦身/护甲/浪潮），来自各玩法埋点
//   2. achTick()    连续指标（里程/极速/连击/总分/存活时长/形态），每 0.2s 模拟时巡检
//   3. onGameEnd()  跨局累计（总局数/累计里程/累计吃球/破纪录），gameOver 结算时判定
// 解锁走 1.4s 间隔的播报队列（横幅 + 闪屏 + 专属音效），持久化在 localStorage。

import { $ } from '../core/dom.js';
import { run } from '../core/state.js';
import { playSound } from '../audio.js';
import * as ui from '../ui.js';

const STORE_KEY = 'neonRacerAchv';

export const RARITY = {
  common: { col: '#00edff', label: 'COMMON' },
  rare:   { col: '#ffd700', label: 'RARE' },
  epic:   { col: '#ff2b91', label: 'EPIC' }
};

// scope: 'run' 单局内判定 / 'total' 跨局累计判定
// event 型挂在 run.ach 计数器上；metric 型按指标巡检（eager = 事件瞬间立即判定，不等 0.2s 巡检）
export const ACHIEVEMENTS = [
  { id: 'first500',   icon: '⟁', name: '初次启程',   desc: '单局行驶 500 m',            rarity: 'common', scope: 'run',   metric: 'dist',      target: 500 },
  { id: 'dist2000',   icon: '⌖', name: '城际穿越',   desc: '单局行驶 2000 m',           rarity: 'common', scope: 'run',   metric: 'dist',      target: 2000 },
  { id: 'dist5000',   icon: '✵', name: '洲际旅人',   desc: '单局行驶 8000 m',           rarity: 'rare',   scope: 'run',   metric: 'dist',      target: 8000 },
  { id: 'combo10',    icon: '◇', name: '连击上道',   desc: '单局连击达到 ×10',          rarity: 'common', scope: 'run',   metric: 'maxCombo',  target: 10, eager: true },
  { id: 'combo20',    icon: '❖', name: '连击大师',   desc: '单局连击达到 ×20',          rarity: 'common', scope: 'run',   metric: 'maxCombo',  target: 20, eager: true },
  { id: 'combo30',    icon: '✦', name: '登峰造极',   desc: '单局连击达到 ×60',          rarity: 'rare',   scope: 'run',   metric: 'maxCombo',  target: 60, eager: true },
  { id: 'speed200',   icon: '⌁', name: '音速冲击',   desc: '极速达到 200 km/h',         rarity: 'common', scope: 'run',   metric: 'speedKmh',  target: 200 },
  { id: 'speed250',   icon: '✹', name: '极速领域',   desc: '极速达到 259 km/h',         rarity: 'rare',   scope: 'run',   metric: 'speedKmh',  target: 259 },
  { id: 'gate1',      icon: '⬡', name: '滑铲初体验', desc: '首次滑铲穿过悬挂闸门',       rarity: 'common', scope: 'run',   event: 'gateSlide',  target: 1 },
  { id: 'gate5',      icon: '◈', name: '闸门舞者',   desc: '单局滑铲穿越悬挂闸门 10 次', rarity: 'rare',   scope: 'run',   event: 'gateSlide',  target: 10 },
  { id: 'perfect5',   icon: '✧', name: '完美主义者', desc: '单局完美跳跃越过低障 10 次', rarity: 'rare',   scope: 'run',   event: 'perfectJump', target: 10 },
  { id: 'near10',     icon: '≪', name: '贴地飞行',   desc: '单局与障碍擦身而过 10 次',   rarity: 'common', scope: 'run',   event: 'nearMiss',   target: 10 },
  { id: 'armor1',     icon: '⬥', name: '武装起来',   desc: '首次拾取应急护甲核心',       rarity: 'common', scope: 'run',   event: 'armorEquip', target: 1 },
  { id: 'armorBlock', icon: '⬢', name: '铁壁',       desc: '护甲抵挡一次撞击',           rarity: 'rare',   scope: 'run',   event: 'armorBlock', target: 1 },
  { id: 'rush1',      icon: '⚑', name: '浪潮冲浪者', desc: '存活完一整轮冲刺浪潮',       rarity: 'common', scope: 'run',   event: 'rushSurvived', target: 1 },
  { id: 'tier5',      icon: '❂', name: '完全体',     desc: '达到最终形态 TIER 5',        rarity: 'epic',   scope: 'run',   metric: 'tier',      target: 5, eager: true },
  { id: 'score10k',   icon: '❊', name: '单局破两万', desc: '单局总分突破 20000',         rarity: 'rare',   scope: 'run',   metric: 'totalScore', target: 20000 },
  { id: 'marathon',   icon: '◷', name: '马拉松',     desc: '单局存活 5 分钟',            rarity: 'rare',   scope: 'run',   metric: 'elapsed',   target: 300 },
  { id: 'runs10',     icon: '⟡', name: '常客',       desc: '累计完成 10 局',             rarity: 'common', scope: 'total', metric: 'runs',      target: 10 },
  { id: 'totalDist',  icon: '✪', name: '里程传奇',   desc: '累计行驶里程 50 KM',         rarity: 'epic',   scope: 'total', metric: 'dist', target: 50000 },
  { id: 'totalOrbs',  icon: '◆', name: '吃球狂人',   desc: '累计收集 2500 颗能量球',     rarity: 'rare',   scope: 'total', metric: 'orbs', target: 2500 },
  { id: 'record1',    icon: '★', name: '破纪录者',   desc: '刷新一次最高分纪录',         rarity: 'epic',   scope: 'total', event: 'record',     target: 1 }
];
const defById = Object.fromEntries(ACHIEVEMENTS.map(d => [d.id, d]));

// —— 持久化（读写全程 try/catch，兼容隐私模式）——
let unlocked = {};
let totals = { runs: 0, dist: 0, orbs: 0 };
try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    unlocked = data.u || {};
    totals = { runs: 0, dist: 0, orbs: 0, ...data.s };
  }
} catch {}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ u: unlocked, s: totals })); } catch {}
}

export function unlockedCount() { return Object.keys(unlocked).length; }
export function isUnlocked(id) { return !!unlocked[id]; }
export function getTotals() { return totals; }

// —— 解锁播报队列：同帧多个解锁按 1.4s 间隔顺序亮相 ——
const queue = [];
let showing = false;

function unlock(def) {
  if (unlocked[def.id]) return;
  unlocked[def.id] = 1;
  save();
  queue.push(def);
  pump();
}

function pump() {
  if (showing || !queue.length) return;
  showing = true;
  const def = queue.shift();
  const col = RARITY[def.rarity].col;
  ui.achievementBanner(def, col);
  ui.flash(col, 0.08, 320);
  playSound('achievement', def.rarity === 'epic' ? 2 : def.rarity === 'rare' ? 1 : 0);
  setTimeout(() => { showing = false; pump(); }, 1400);
}

// —— 判定表按类型预分桶：避免每次事件 / 巡检都 filter 出新数组 ——
const RUN_EVENT_DEFS = {};
for (const d of ACHIEVEMENTS) {
  if (d.scope === 'run' && d.event) (RUN_EVENT_DEFS[d.event] ||= []).push(d);
}
const RUN_EAGER_DEFS = ACHIEVEMENTS.filter(d => d.scope === 'run' && d.eager);
const RUN_METRIC_DEFS = ACHIEVEMENTS.filter(d => d.scope === 'run' && d.metric);
const TOTAL_METRIC_DEFS = ACHIEVEMENTS.filter(d => d.scope === 'total' && d.metric);

// —— 指标快照（复用同一对象，避免每次事件分配）——
const _metrics = { dist: 0, speedKmh: 0, maxCombo: 0, totalScore: 0, elapsed: 0, tier: 0 };
function liveMetrics() {
  _metrics.dist = run.dist;
  _metrics.speedKmh = run.maxSpeed * 3.6;
  _metrics.maxCombo = run.maxCombo;
  _metrics.totalScore = Math.floor(run.dist) + run.score;
  _metrics.elapsed = run.elapsed;
  _metrics.tier = run.tier;
  return _metrics;
}

function evalDefs(defs, valueOf) {
  for (const def of defs) {
    if (!unlocked[def.id] && valueOf(def) >= def.target) unlock(def);
  }
}

// —— 路径 1：离散事件（玩法埋点调用）——
export function achEvent(type) {
  if (run.state !== 'playing' || !run.ach) return;
  if (run.ach[type] !== undefined) {
    run.ach[type]++;
    evalDefs(RUN_EVENT_DEFS[type] || [], () => run.ach[type]);
  }
  // 连击/形态等随事件即时判定，不等巡检
  const metrics = liveMetrics();
  evalDefs(RUN_EAGER_DEFS, d => metrics[d.metric]);
}

// —— 路径 2：连续指标巡检（主循环每 0.2s 模拟时调用）——
let tickAcc = 0;
export function achTick(dt) {
  if (run.state !== 'playing' || !run.ach) { tickAcc = 0; return; }
  tickAcc += dt;
  if (tickAcc < 0.2) return;
  tickAcc = 0;
  const metrics = liveMetrics();
  evalDefs(RUN_METRIC_DEFS, d => metrics[d.metric]);
}

// —— 路径 3：跨局累计（gameOver 结算时调用）——
export function onGameEnd(isRecord) {
  totals.runs++;
  totals.dist += run.dist;
  totals.orbs += run.orbCount;
  evalDefs(TOTAL_METRIC_DEFS, d => totals[d.metric]);
  if (isRecord) unlock(defById.record1);
  save();
}

// —— 单局计数器（resetGame 时归零）——
export function resetRunCounters() {
  run.ach = { gateSlide: 0, perfectJump: 0, nearMiss: 0, armorEquip: 0, armorBlock: 0, rushSurvived: 0 };
  tickAcc = 0;
}

// —— 档案面板进度值（未解锁卡片的 x/y）——
function progressOf(def) {
  if (def.scope === 'total') return totals[def.metric] ?? 0;
  if (def.event) return run.ach ? run.ach[def.event] : 0;
  return liveMetrics()[def.metric] ?? 0;
}

// —— 档案面板 ——
let open = false;

export function isArchiveOpen() { return open; }

function renderArchive() {
  const grid = $('achGrid');
  grid.innerHTML = '';
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const def = ACHIEVEMENTS[i];
    const rar = RARITY[def.rarity];
    const got = isUnlocked(def.id);
    const card = document.createElement('article');
    card.className = 'achCard ' + (got ? 'on' : 'off');
    card.style.setProperty('--ach-col', rar.col);
    card.style.setProperty('--i', i);
    const prog = got ? def.target : Math.min(progressOf(def), def.target);
    const showBar = def.target > 1;
    const barText = showBar ? `${Math.floor(got ? def.target : prog)} / ${def.target}` : (got ? '已达成' : '未达成');
    card.innerHTML = `
      <div class="achIcon" aria-hidden="true">${def.icon}</div>
      <div class="achBody">
        <div class="achName">${def.name}<span class="achRarity">${rar.label}</span></div>
        <div class="achDesc">${def.desc}</div>
        ${showBar ? `<div class="achProg"><div class="achProgBar" style="width:${Math.min(100, prog / def.target * 100)}%"></div></div>` : ''}
        <div class="achProgText">${barText}</div>
      </div>
      <div class="achState" aria-hidden="true">${got ? '✓' : ''}</div>`;
    grid.appendChild(card);
  }
  $('achCount').textContent = `${unlockedCount()} / ${ACHIEVEMENTS.length} UNLOCKED`;
}

export function openArchive() {
  if (open) return;
  open = true;
  renderArchive();
  $('achieveScreen').classList.remove('hidden');
}

export function closeArchive() {
  if (!open) return;
  open = false;
  $('achieveScreen').classList.add('hidden');
}

// 面板按钮与关闭交互（与 input.js 的 onclick 模式一致，模块加载即绑定）
$('achBtn').onclick = () => openArchive();
$('achBtn2').onclick = () => openArchive();
$('achClose').onclick = () => closeArchive();
$('achieveScreen').addEventListener('pointerdown', e => {
  if (e.target === $('achieveScreen')) closeArchive();
});
addEventListener('keydown', e => {
  if (e.key === 'Escape') closeArchive();
});
