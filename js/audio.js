let audioCtx = null;
let engineOsc = null, engineGain = null;
let delayBus = null;
let musicLevel = 0;

const BASS_LINE = [55, 43.65, 65.41, 49];
const MINOR_TRIAD = [2, 2 * Math.pow(2, 3 / 12), 2 * Math.pow(2, 7 / 12), 4];

function getDelay() {
  if (!delayBus && audioCtx) {
    delayBus = audioCtx.createDelay(0.6);
    delayBus.delayTime.value = 0.29;
    const fb = audioCtx.createGain(); fb.gain.value = 0.34;
    const wet = audioCtx.createGain(); wet.gain.value = 0.22;
    delayBus.connect(fb); fb.connect(delayBus);
    delayBus.connect(wet); wet.connect(audioCtx.destination);
  }
  return delayBus;
}

export function setMusicIntensity(v) {
  musicLevel = Math.max(0, Math.min(1, v));
}

let hatBuffer = null, snareBuffer = null;

function initAudioBuffers() {
  if (!audioCtx || hatBuffer) return;
  const hatLen = Math.floor(audioCtx.sampleRate * 0.04);
  hatBuffer = audioCtx.createBuffer(1, hatLen, audioCtx.sampleRate);
  const hd = hatBuffer.getChannelData(0);
  for (let i = 0; i < hatLen; i++) hd[i] = (Math.random() * 2 - 1) * (1 - i / hatLen);

  const snareLen = Math.floor(audioCtx.sampleRate * 0.16);
  snareBuffer = audioCtx.createBuffer(1, snareLen, audioCtx.sampleRate);
  const sd = snareBuffer.getChannelData(0);
  for (let i = 0; i < snareLen; i++) sd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / snareLen, 2);
}

export function ensureAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (audioCtx && !hatBuffer) initAudioBuffers();
}

export function beep(freq, dur, type = 'square', vol = 0.15) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}

export function crashSound() {
  if (!audioCtx) return;
  const len = audioCtx.sampleRate * 0.5;
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = audioCtx.createBufferSource(); s.buffer = buf;
  const g = audioCtx.createGain(); g.gain.value = 0.4;
  s.connect(g); g.connect(audioCtx.destination); s.start();
}

export function whoosh() {
  if (!audioCtx) return;
  const len = audioCtx.sampleRate * 0.22;
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
  const s = audioCtx.createBufferSource();
  s.buffer = buf;
  const f = audioCtx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
  const g = audioCtx.createGain(); g.gain.value = 0.3;
  s.connect(f); f.connect(g); g.connect(audioCtx.destination);
  s.start();
}

function kick(t) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + 0.15);
}

function hat(t, vol = 0.055) {
  if (!audioCtx) return;
  if (!hatBuffer) initAudioBuffers();
  const s = audioCtx.createBufferSource();
  s.buffer = hatBuffer;
  const f = audioCtx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 6500;
  const g = audioCtx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(audioCtx.destination);
  s.start(t);
}

function snare(t) {
  if (!audioCtx) return;
  if (!snareBuffer) initAudioBuffers();
  const s = audioCtx.createBufferSource();
  s.buffer = snareBuffer;
  const f = audioCtx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.9;
  const g = audioCtx.createGain(); g.gain.value = 0.17;
  s.connect(f); f.connect(g); g.connect(audioCtx.destination);
  s.start(t);
}

function bassNote(freq, t, dur) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain(), fl = audioCtx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = freq;
  fl.type = 'lowpass'; fl.frequency.value = 320;
  g.gain.setValueAtTime(0.085, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(fl); fl.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function pluck(freq, t, dur = 0.16, vol = 0.06) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain(), fl = audioCtx.createBiquadFilter();
  o.type = 'square'; o.frequency.value = freq;
  fl.type = 'lowpass'; fl.frequency.value = 2400;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(fl); fl.connect(g);
  g.connect(audioCtx.destination);
  const dl = getDelay();
  if (dl) g.connect(dl);
  o.start(t); o.stop(t + dur + 0.02);
}

export function playBeat(count, beatDur) {
  if (!audioCtx || !beatDur) return;
  const t0 = audioCtx.currentTime + 0.03;
  const half = beatDur / 2, quarter = beatDur / 4;

  kick(t0);

  if (musicLevel >= 0.18 && count % 4 === 2) snare(t0);

  hat(t0 + half);
  if (musicLevel >= 0.45) {
    hat(t0 + quarter, 0.03);
    hat(t0 + quarter * 3, 0.03);
  }

  const bar = (count >> 2) % BASS_LINE.length;
  const root = BASS_LINE[bar];
  bassNote(root, t0, beatDur * 0.85);
  bassNote(root, t0 + half, beatDur * 0.4);
  if (musicLevel >= 0.32) bassNote(root * 2, t0 + quarter * 3, quarter * 0.9);

  if (musicLevel >= 0.58) {
    const seq = MINOR_TRIAD.concat([MINOR_TRIAD[2], MINOR_TRIAD[0]]);
    for (let i = 0; i < 4; i++) {
      if (i === 0 && musicLevel < 0.7 && count % 2 === 0) continue;
      pluck(root * seq[(count * 2 + i) % seq.length], t0 + i * quarter, quarter * 0.9,
        0.035 + musicLevel * 0.03);
    }
  }

  if (musicLevel >= 0.82 && count % 8 === 6) {
    pluck(root * 4, t0 + quarter * 2, 0.3, 0.05);
    pluck(root * 4 * Math.pow(2, 3 / 12), t0 + quarter * 3, 0.24, 0.04);
  }
}

export function startEngine() {
  if (!audioCtx || engineOsc) return;
  engineOsc = audioCtx.createOscillator();
  engineGain = audioCtx.createGain();
  const f = audioCtx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 300;
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 80;
  engineGain.gain.value = 0.02;
  engineOsc.connect(f); f.connect(engineGain); engineGain.connect(audioCtx.destination);
  engineOsc.start();
}

export function stopEngine() {
  if (!engineOsc) return;
  const osc = engineOsc, gn = engineGain;
  try { gn.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.06); } catch (e) {}
  setTimeout(() => { try { osc.stop(); osc.disconnect(); } catch (e) {} }, 250);
  engineOsc = null; engineGain = null;
}

export function setEnginePitch(freq) {
  if (engineOsc) engineOsc.frequency.value = freq;
}
