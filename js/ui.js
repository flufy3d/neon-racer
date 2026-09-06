import * as THREE from 'three';

export const COMBO_COLORS = ['#00ffff', '#7fff00', '#ffee00', '#ff8800', '#ff22aa', '#ff2244'];
export const SHIELD_RECHARGE = 30;
const TIERS_UI = ['初始形态', '引擎过载', '能量护盾', '磁力场', '超载核心', '量子跃迁'];
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
  abEls: [$('ab1'), $('ab2'), $('ab3'), $('ab4'), $('ab5')]
};
export { els };

let cameraRef = null;
export function initUI(camera) {
  cameraRef = camera;
}

export function multOf(c) { return Math.min(COMBO_COLORS.length, 1 + Math.floor(c / 4)); }
export function comboColor(mult) { return COMBO_COLORS[Math.min(COMBO_COLORS.length - 1, mult - 1)]; }

const tmpV = new THREE.Vector3();
export function floatLabel(text, worldPos, color = '#00ffff', size = 20) {
  tmpV.copy(worldPos).project(cameraRef);
  if (tmpV.z > 1) return;
  const el = document.createElement('div');
  el.className = 'float-label';
  el.textContent = text;
  el.style.left = ((tmpV.x * 0.5 + 0.5) * innerWidth) + 'px';
  el.style.top = ((-tmpV.y * 0.5 + 0.5) * innerHeight) + 'px';
  el.style.color = color;
  el.style.textShadow = `0 0 10px ${color}`;
  el.style.fontSize = size + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 750);
}

export function flash(color, strength, ms = 350) {
  const f = els.flashEl;
  f.style.background = color;
  f.style.transition = 'none';
  f.style.opacity = strength;
  setTimeout(() => { f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0; }, 30);
}

export function toast(text, color = '#ffd700') {
  els.toastEl.textContent = text;
  els.toastEl.style.color = color;
  els.toastEl.style.textShadow = `0 0 18px ${color}, 0 0 50px ${color}`;
  els.toastEl.classList.remove('show');
  void els.toastEl.offsetWidth;
  els.toastEl.classList.add('show');
}

export function updateHUD(s) {
  els.scoreEl.textContent = 'SCORE ' + (Math.floor(s.dist) + s.bonus);
  els.speedEl.textContent = Math.round(s.speed * 3.6);
  els.distStat.textContent = Math.floor(s.dist) + ' m';
  els.orbStat.textContent = '◆ ' + s.orbCount;
  els.maxComboEl.textContent = '×' + multOf(Math.max(s.maxCombo, 1)) + ' · ' + s.maxCombo + ' 连';
  els.tierNameEl.textContent = 'TIER ' + s.tier + ' · ' + TIERS_UI[s.tier];
  els.tierNameEl.style.color = '#' + s.tierColorHex;
  if (s.tier >= MAX_TIER) {
    els.tierBar.style.width = '100%';
    els.tierNext.textContent = '已达最高形态';
  } else {
    const lo = s.tier === 0 ? 0 : TIER_THRESHOLDS[s.tier - 1];
    const hi = TIER_THRESHOLDS[s.tier];
    els.tierBar.style.width = Math.min(100, (s.orbCount - lo) / (hi - lo) * 100) + '%';
    els.tierNext.textContent = `下一形态 ${hi} 球`;
  }
  els.abEls.forEach((el, i) => {
    const active = s.tier >= i + 1;
    el.classList.toggle('locked', !active);
    el.classList.toggle('ready', active && (i === 1 ? s.shieldReady : i === 4 ? s.airJumpReady : true));
  });
  els.shieldState.textContent = s.tier < 2 ? '' : s.shieldReady ? '[就绪]' : `[充能 ${s.charge}/${SHIELD_RECHARGE}]`;
  els.jumpState.textContent = s.tier < MAX_TIER ? '' : s.airJumpReady ? '[就绪]' : '[已用]';
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
  pendingSummary = null;
  resultEls.screen.classList.remove('resultsActive');
  resultEls.panel.classList.remove('scoreLocked');
}

export function milestoneBanner(zoneName, distText, color = '#00ffff') {
  const el = document.createElement('div');
  el.className = 'milestone-banner';
  el.innerHTML = `<div style="font-size:12px;letter-spacing:4px;opacity:0.85;margin-bottom:4px;">${distText}</div><div style="font-size:22px;font-weight:900;letter-spacing:5px;text-shadow:0 0 16px ${color};">${zoneName}</div>`;
  el.style.position = 'fixed';
  el.style.top = '18%';
  el.style.left = '50%';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.textAlign = 'center';
  el.style.color = color;
  el.style.pointerEvents = 'none';
  el.style.zIndex = '99';
  el.style.fontFamily = 'monospace, sans-serif';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  el.style.opacity = '1';
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -70%)';
    setTimeout(() => el.remove(), 600);
  }, 1600);
}

export function evolutionBanner(tier, title, color = '#00ffff') {
  const el = document.createElement('div');
  el.className = 'evolution-banner';
  el.innerHTML = `
    <div style="font-size:11px;font-weight:700;letter-spacing:6px;opacity:0.9;margin-bottom:6px;text-transform:uppercase;color:#ffffff;text-shadow:0 0 10px ${color};">
      ◆ QUANTUM UPGRADE // 形态升阶 ◆
    </div>
    <div style="font-size:24px;font-weight:900;letter-spacing:4px;color:${color};text-shadow:0 0 20px ${color}, 0 0 45px ${color};">
      ${title}
    </div>
  `;
  el.style.position = 'fixed';
  el.style.top = '22%';
  el.style.left = '50%';
  el.style.transform = 'translate(-50%, -50%) scale(0.85)';
  el.style.textAlign = 'center';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '99';
  el.style.fontFamily = '"Orbitron", monospace, sans-serif';
  el.style.transition = 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
  el.style.opacity = '0';
  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%, -50%) scale(1.06)';
    setTimeout(() => {
      if (el.parentNode) el.style.transform = 'translate(-50%, -50%) scale(1.0)';
    }, 180);
  });

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -85%) scale(0.95)';
    setTimeout(() => el.remove(), 500);
  }, 1600);
}
