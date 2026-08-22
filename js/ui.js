import * as THREE from 'three';

export const COMBO_COLORS = ['#00ffff', '#7fff00', '#ffee00', '#ff8800', '#ff22aa', '#ff2244'];
export const SHIELD_RECHARGE = 30;
const TIERS_UI = ['初始形态', '引擎过载', '能量护盾', '磁力场', '究极形态'];
const TIER_THRESHOLDS = [15, 35, 65, 100];

const $ = id => document.getElementById(id);
const els = {
  scoreEl: $('score'), bestEl: $('best'), speedEl: $('speed'),
  comboBox: $('comboBox'), comboText: $('comboText'), comboBar: $('comboBar'),
  toastEl: $('toast'), vig: $('vig'), flashEl: $('flash'),
  distStat: $('distStat'), orbStat: $('orbStat'), tierNameEl: $('tierName'),
  tierBar: $('tierBar'), tierNext: $('tierNext'), maxComboEl: $('maxCombo'),
  shieldState: $('shieldState'), abEls: [$('ab1'), $('ab2'), $('ab3'), $('ab4')]
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
  if (s.tier >= 4) {
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
    el.classList.toggle('ready', active && i === 0 ? true : active && i === 1 ? s.shieldReady : false);
  });
  els.shieldState.textContent = s.tier < 2 ? '' : s.shieldReady ? '[就绪]' : `[充能 ${s.charge}/${SHIELD_RECHARGE}]`;
}
