import * as THREE from 'three';

export const COMBO_COLORS = ['#00ffff', '#38ffff', '#70ffff', '#ffd700', '#ffea38', '#fff6aa'];
export const SHIELD_RECHARGE = 30;
const TIERS_UI = ['初始形态', '引擎过载', '能量护盾', '磁力场', '量子跃迁', '超载核心'];
export const TIER_THRESHOLDS = [18, 45, 85, 140, 215];
const MAX_TIER = TIER_THRESHOLDS.length;

const $ = id => document.getElementById(id);
const els = {
  scoreEl: $('score'), bestEl: $('best'), speedEl: $('speed'),
  comboBox: $('comboBox'), comboText: $('comboText'), comboBar: $('comboBar'),
  toastEl: $('toast'), vig: $('vig'), flashEl: $('flash'),
  distStat: $('distStat'), orbStat: $('orbStat'), tierNameEl: $('tierName'),
  tierBar: $('tierBar'), tierNext: $('tierNext'), maxComboEl: $('maxCombo'),
  shieldState: $('shieldState'), jumpState: $('jumpState'),
  abEls: [$('ab1'), $('ab2'), $('ab3'), $('ab4'), $('ab5')],
  armorRow: $('abArmor'), armorState: $('armorState'),
  rushTag: $('rushTag'), rushText: $('rushText')
};
export { els };

let cameraRef = null;
export function initUI(camera) {
  cameraRef = camera;
}

export function multOf(c) { return Math.min(COMBO_COLORS.length, 1 + Math.floor(c / 4)); }
export function comboColor(mult) { return COMBO_COLORS[Math.min(COMBO_COLORS.length - 1, mult - 1)]; }

const tmpV = new THREE.Vector3();

// 浮动标签统一管理：限流（同屏上限）+ 合并（短窗口同文案叠加 ×N）+ 顶部 HUD 安全区避让
const activeLabels = [];
const LABEL_MAX = 5;
const LABEL_MERGE_MS = 420;
const LABEL_LIFE_MS = 750;

function removeLabel(rec) {
  clearTimeout(rec.timer);
  rec.el.remove();
  const i = activeLabels.indexOf(rec);
  if (i >= 0) activeLabels.splice(i, 1);
}

export function floatLabel(text, worldPos, color = '#00ffff', size = 20) {
  const now = performance.now();
  const merged = activeLabels.find(l => l.text === text && now - l.bornAt < LABEL_MERGE_MS);
  if (merged) {
    merged.count++;
    merged.el.textContent = text + ' ×' + merged.count;
    merged.bornAt = now;
    merged.el.style.animation = 'none';
    void merged.el.offsetWidth;
    merged.el.style.animation = '';
    clearTimeout(merged.timer);
    merged.timer = setTimeout(() => removeLabel(merged), LABEL_LIFE_MS);
    return;
  }
  tmpV.copy(worldPos).project(cameraRef);
  if (tmpV.z > 1) return;
  while (activeLabels.length >= LABEL_MAX) removeLabel(activeLabels[0]);
  const el = document.createElement('div');
  el.className = 'float-label';
  el.textContent = text;
  el.style.left = ((tmpV.x * 0.5 + 0.5) * innerWidth) + 'px';
  let top = (-tmpV.y * 0.5 + 0.5) * innerHeight;
  // 避开顶部 HUD/横幅带（顶部 32%），并在同高度附近自动错位，防止多条标签压在一起
  top = Math.max(top, innerHeight * 0.32);
  top = Math.min(top, innerHeight * 0.88);
  for (const l of activeLabels) {
    if (Math.abs(l.top - top) < 24) top = l.top + 26;
  }
  el.style.top = top + 'px';
  el.style.color = color;
  el.style.textShadow = `0 0 10px ${color}`;
  el.style.fontSize = size + 'px';
  document.body.appendChild(el);
  const rec = { el, text, bornAt: now, top, count: 1, timer: 0 };
  rec.timer = setTimeout(() => removeLabel(rec), LABEL_LIFE_MS);
  activeLabels.push(rec);
}

export function flash(color, strength, ms = 350) {
  const f = els.flashEl;
  f.style.background = color;
  f.style.transition = 'none';
  f.style.opacity = strength;
  setTimeout(() => { f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0; }, 30);
}

let lastToastText = '';
let lastToastAt = 0;
export function toast(text, color = '#ffd700') {
  const now = performance.now();
  // 限流：短窗口内完全相同的文案不重播（速度提升/护盾充能等周期性提示防刷屏）
  if (text === lastToastText && now - lastToastAt < 700) return;
  lastToastText = text;
  lastToastAt = now;
  els.toastEl.textContent = text;
  els.toastEl.style.color = color;
  els.toastEl.style.textShadow = `0 0 18px ${color}, 0 0 50px ${color}`;
  els.toastEl.classList.remove('show');
  void els.toastEl.offsetWidth;
  els.toastEl.classList.add('show');
}

let lastScore = -1;
let lastSpeed = -1;
let lastDist = -1;
let lastOrbCount = -1;
let lastMaxCombo = -1;
let lastTier = -1;
let lastTierColorHex = '';
let lastTierProgress = '';
let lastTierBarWidth = '';
let lastTierNextText = '';
let lastTierAb = -1;
let lastShieldReadyAb = null;
let lastAirJumpReadyAb = null;
let lastShieldText = null;
let lastJumpText = null;
let lastArmorReady = null;
let lastRushOn = false;
let lastRushText = '';

export function resetHUDCache() {
  lastScore = -1;
  lastSpeed = -1;
  lastDist = -1;
  lastOrbCount = -1;
  lastMaxCombo = -1;
  lastTier = -1;
  lastTierColorHex = '';
  lastTierProgress = '';
  lastTierBarWidth = '';
  lastTierNextText = '';
  lastTierAb = -1;
  lastShieldReadyAb = null;
  lastAirJumpReadyAb = null;
  lastShieldText = null;
  lastJumpText = null;
  lastArmorReady = null;
  lastRushOn = false;
  lastRushText = '';
  els.rushTag.classList.remove('on');
}

export function updateHUD(s) {
  const scoreVal = Math.floor(s.dist) + s.bonus;
  if (scoreVal !== lastScore) {
    lastScore = scoreVal;
    els.scoreEl.textContent = 'SCORE ' + scoreVal;
  }
  const speedVal = Math.round(s.speed * 3.6);
  if (speedVal !== lastSpeed) {
    lastSpeed = speedVal;
    els.speedEl.textContent = speedVal;
  }
  const distVal = Math.floor(s.dist);
  if (distVal !== lastDist) {
    lastDist = distVal;
    els.distStat.textContent = distVal + ' m';
  }
  if (s.orbCount !== lastOrbCount) {
    lastOrbCount = s.orbCount;
    els.orbStat.textContent = '◆ ' + s.orbCount;
  }
  if (s.maxCombo !== lastMaxCombo) {
    lastMaxCombo = s.maxCombo;
    els.maxComboEl.textContent = '×' + multOf(Math.max(s.maxCombo, 1)) + ' · ' + s.maxCombo + ' 连';
  }
  if (s.tier !== lastTier || s.tierColorHex !== lastTierColorHex) {
    lastTier = s.tier;
    lastTierColorHex = s.tierColorHex;
    els.tierNameEl.textContent = 'TIER ' + s.tier + ' · ' + TIERS_UI[s.tier];
    els.tierNameEl.style.color = '#' + s.tierColorHex;
  }
  if (s.tier >= MAX_TIER) {
    if (lastTierProgress !== 'max') {
      lastTierProgress = 'max';
      els.tierBar.style.width = '100%';
      els.tierNext.textContent = '已达最高形态';
    }
  } else {
    const lo = s.tier === 0 ? 0 : TIER_THRESHOLDS[s.tier - 1];
    const hi = TIER_THRESHOLDS[s.tier];
    const w = Math.min(100, (s.orbCount - lo) / (hi - lo) * 100) + '%';
    const nextText = `下一形态 ${hi} 球`;
    if (w !== lastTierBarWidth) {
      lastTierBarWidth = w;
      els.tierBar.style.width = w;
    }
    if (nextText !== lastTierNextText) {
      lastTierNextText = nextText;
      els.tierNext.textContent = nextText;
    }
    lastTierProgress = '';
  }
  if (s.tier !== lastTierAb || s.shieldReady !== lastShieldReadyAb || s.airJumpReady !== lastAirJumpReadyAb) {
    lastTierAb = s.tier;
    lastShieldReadyAb = s.shieldReady;
    lastAirJumpReadyAb = s.airJumpReady;
    els.abEls.forEach((el, i) => {
      const active = s.tier >= i + 1;
      el.classList.toggle('locked', !active);
      el.classList.toggle('ready', active && (i === 1 ? s.shieldReady : i === 3 ? s.airJumpReady : true));
    });
  }
  const shieldText = s.tier < 2 ? '' : s.shieldReady ? '[就绪]' : `[充能 ${s.charge}/${SHIELD_RECHARGE}]`;
  if (shieldText !== lastShieldText) {
    lastShieldText = shieldText;
    els.shieldState.textContent = shieldText;
  }
  const jumpText = s.tier < 4 ? '' : s.airJumpReady ? '[就绪]' : '[已用]';
  if (jumpText !== lastJumpText) {
    lastJumpText = jumpText;
    els.jumpState.textContent = jumpText;
  }
  if (s.armorReady !== lastArmorReady) {
    lastArmorReady = s.armorReady;
    els.armorRow.classList.toggle('locked', !s.armorReady);
    els.armorState.textContent = s.armorReady ? '[就绪]' : '';
  }
  const rushOn = s.rushTimer > 0;
  if (rushOn !== lastRushOn) {
    lastRushOn = rushOn;
    els.rushTag.classList.toggle('on', rushOn);
  }
  if (rushOn) {
    const rushText = 'RUSH WAVE ×2 · ' + Math.ceil(s.rushTimer) + 's';
    if (rushText !== lastRushText) {
      lastRushText = rushText;
      els.rushText.textContent = rushText;
    }
  }
}

const resultEls = {
  screen: $('overScreen'), panel: document.querySelector('.resultPanel'),
  score: $('finalScore'), distance: $('finalDistance'), orbs: $('finalOrbs'),
  combo: $('finalCombo'), speed: $('finalSpeed'), time: $('finalTime'),
  tier: $('finalTier'), record: $('newRecord')
};

let resultRun = 0;
let resultTimers = [];
let resultFrames = [];
let pendingSummary = null;

function cancelResultAnimations() {
  resultRun++;
  for (const timer of resultTimers) clearTimeout(timer);
  for (const frame of resultFrames) cancelAnimationFrame(frame);
  resultTimers = [];
  resultFrames = [];
}

function formatRunTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, seconds - mins * 60);
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
}

function animateResultValue(el, target, duration, delay, formatter, run, onStart) {
  const timer = setTimeout(() => {
    if (run !== resultRun) return;
    if (onStart) onStart();
    const started = performance.now();
    const frame = now => {
      if (run !== resultRun) return;
      const progress = Math.min(1, (now - started) / duration);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      el.textContent = formatter(target * eased);
      if (progress < 1) resultFrames.push(requestAnimationFrame(frame));
      else el.textContent = formatter(target);
    };
    resultFrames.push(requestAnimationFrame(frame));
  }, delay);
  resultTimers.push(timer);
}

export function prepareRunSummary(summary) {
  cancelResultAnimations();
  pendingSummary = summary;
  resultEls.screen.classList.remove('resultsActive');
  resultEls.panel.classList.remove('scoreLocked');
  resultEls.score.textContent = '0';
  resultEls.distance.textContent = '0.00';
  resultEls.orbs.textContent = '0';
  resultEls.combo.textContent = '0';
  resultEls.speed.textContent = '0';
  resultEls.time.textContent = '00:00.0';
  resultEls.tier.textContent = `TIER ${summary.tier} · ${TIERS_UI[summary.tier]}`;
  resultEls.tier.style.color = '#' + summary.tierColorHex;
  resultEls.record.hidden = !summary.isRecord;
}

export function playRunSummary(onStatStart) {
  if (!pendingSummary) return;
  cancelResultAnimations();
  const run = resultRun;
  const s = pendingSummary;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  resultEls.screen.classList.remove('resultsActive');
  void resultEls.screen.offsetWidth;
  resultEls.screen.classList.add('resultsActive');

  const stats = [
    [resultEls.score, s.score, 880, 160, n => Math.round(n).toLocaleString('zh-CN')],
    [resultEls.distance, s.distanceMeters / 1000, 680, 390, n => n.toFixed(2)],
    [resultEls.orbs, s.orbCount, 540, 500, n => Math.round(n).toLocaleString('zh-CN')],
    [resultEls.combo, s.maxCombo, 560, 610, n => Math.round(n).toLocaleString('zh-CN')],
    [resultEls.speed, s.topSpeedKmh, 650, 720, n => Math.round(n).toLocaleString('zh-CN')],
    [resultEls.time, s.elapsed, 560, 830, formatRunTime]
  ];

  if (reducedMotion) {
    for (const [el, target, , , formatter] of stats) el.textContent = formatter(target);
    resultEls.panel.classList.add('scoreLocked');
    return;
  }

  stats.forEach(([el, target, duration, delay, formatter], index) => {
    animateResultValue(el, target, duration, delay, formatter, run,
      () => { if (onStatStart) onStatStart(index); });
  });
  resultTimers.push(setTimeout(() => {
    if (run === resultRun) resultEls.panel.classList.add('scoreLocked');
  }, 1100));
}

export function resetRunSummary() {
  cancelResultAnimations();
  clearBanners();
  pendingSummary = null;
  resultEls.screen.classList.remove('resultsActive');
  resultEls.panel.classList.remove('scoreLocked');
}

// ── 大横幅仲裁队列 ──
// 升阶 / 里程碑 / Rush / 成就共用同一条横幅位，同一时刻只播放一条，其余排队：
// 避免高强度时刻多条横幅叠罗汉，也避免连续成就解锁时后一条把前一条顶掉。
const bannerQueue = [];
const BANNER_QUEUE_CAP = 5;
let bannerActive = false;
let bannerEpoch = 0;

function playBanner(spec) {
  bannerActive = true;
  const epoch = bannerEpoch;
  const el = document.createElement('div');
  el.className = spec.className;
  el.style.setProperty(spec.colorVar, spec.color);
  el.innerHTML = spec.html;
  document.body.appendChild(el);

  if (spec.rise) {
    requestAnimationFrame(() => {
      if (epoch !== bannerEpoch) return;
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%, -50%) scale(1.06)';
      setTimeout(() => {
        if (epoch === bannerEpoch && el.parentNode) el.style.transform = 'translate(-50%, -50%) scale(1.0)';
      }, 180);
    });
  }

  setTimeout(() => {
    if (epoch !== bannerEpoch) { el.remove(); return; }
    el.style.opacity = '0';
    el.style.transform = spec.rise ? 'translate(-50%, -85%) scale(0.95)' : 'translate(-50%, -70%)';
    setTimeout(() => {
      el.remove();
      if (epoch === bannerEpoch) playNextBanner();
    }, 520);
  }, spec.duration);
}

function playNextBanner() {
  const spec = bannerQueue.shift();
  if (!spec) { bannerActive = false; return; }
  playBanner(spec);
}

function enqueueBanner(spec) {
  // 同类横幅去重：队列中尚未播放的同类型横幅被最新一条替换（成就按 id 区分，各自排队不丢失）
  const dup = bannerQueue.findIndex(q => q.kind === spec.kind);
  if (dup >= 0) bannerQueue.splice(dup, 1);
  bannerQueue.push(spec);
  while (bannerQueue.length > BANNER_QUEUE_CAP) bannerQueue.shift();
  if (!bannerActive) playNextBanner();
}

export function clearBanners() {
  bannerEpoch++;
  bannerQueue.length = 0;
  bannerActive = false;
  document.querySelectorAll('.milestone-banner, .evolution-banner, .achieve-banner').forEach(e => e.remove());
}

export function milestoneBanner(zoneName, distText, color = '#00ffff') {
  enqueueBanner({
    kind: 'milestone', className: 'milestone-banner', colorVar: '--zone-col', color, duration: 1600,
    html: `<div class="milestone-dist">${distText}</div><div class="milestone-zone">${zoneName}</div>`
  });
}

export function rushBanner() {
  enqueueBanner({
    kind: 'rush', className: 'milestone-banner rush-banner', colorVar: '--zone-col', color: '#ff8822', duration: 1600,
    html: `<div class="milestone-dist">RUSH WAVE</div><div class="milestone-zone">冲刺浪潮 · 得分 ×2</div>`
  });
}

export function evolutionBanner(tier, title, color = '#00ffff') {
  enqueueBanner({
    kind: 'evolution', className: 'evolution-banner', colorVar: '--tier-col', color, rise: true, duration: 1600,
    html: `
    <div class="evolution-tag">
      ◆ QUANTUM UPGRADE // 形态升阶 ◆
    </div>
    <div class="evolution-title">
      ${title}
    </div>
  `});
}

// 成就解锁横幅：与 evolution/milestone 共用队列，def = { id, icon, name, desc }
export function achievementBanner(def, color = '#ffd700') {
  enqueueBanner({
    kind: 'ach:' + def.id, className: 'achieve-banner', colorVar: '--ach-col', color, rise: true, duration: 1800,
    html: `
    <div class="achieve-tag">
      ◆ 成就解锁 // ACHIEVEMENT ◆
    </div>
    <div class="achieve-title">
      <span class="achieve-icon" aria-hidden="true">${def.icon}</span>${def.name}
    </div>
    <div class="achieve-desc">${def.desc}</div>
  `});
}

