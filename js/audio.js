let audioCtx = null;
let engineOsc = null, engineGain = null;

export function ensureAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
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

function kick() {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(42, audioCtx.currentTime + 0.12);
  g.gain.setValueAtTime(0.28, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.14);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + 0.15);
}

function hat() {
  if (!audioCtx) return;
  const len = audioCtx.sampleRate * 0.04;
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = audioCtx.createBufferSource();
  s.buffer = buf;
  const f = audioCtx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 6500;
  const g = audioCtx.createGain(); g.gain.value = 0.055;
  s.connect(f); f.connect(g); g.connect(audioCtx.destination);
  s.start();
}

const BASS_LINE = [55, 55, 65.41, 49];
export function playBeat(count) {
  if (!audioCtx) return;
  kick();
  if (count % 2 === 1) hat();
  if (count % 4 === 0) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), fl = audioCtx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = BASS_LINE[(count >> 2) % BASS_LINE.length];
    fl.type = 'lowpass'; fl.frequency.value = 320;
    g.gain.setValueAtTime(0.085, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.38);
    o.connect(fl); fl.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.4);
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
