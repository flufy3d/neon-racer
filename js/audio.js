import { TRACKS, clamp, intensityFor, pickupNote, scaleNote, scoreStep, takeNextTrack } from './audio/score.js';
import { AudioRack } from './audio/synth.js';
import { MusicTransport } from './audio/transport.js';

let audioCtx = null;
let rack = null;
let transport = new MusicTransport();
let status = 'idle';
let track = TRACKS[0];
let nextTrack = 0;
let timer = null;
let speed = 26, tier = 0, zone = 0, combo = 0;
let intensity = 0, comboAccent = 0;
let arrangement = { intensity: 0, zone: 0, fill: false };
let pendingFill = false;
let pendingBar = null;
let lastTick = 0;
const eventTimes = new Map();
const clockTime = () => audioCtx ? audioCtx.currentTime : performance.now() / 1000;

export function ensureAudio() {
  if (!audioCtx) {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context) audioCtx = new Context();
    } catch { /* Silent gameplay remains available. */ }
  }
  if (audioCtx && audioCtx.state !== 'running') {
    audioCtx.resume().catch(() => { /* Retry on the next user gesture. */ });
  }
  return audioCtx;
}

function stopScheduler() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function replaceRack(engine = false) {
  rack?.dispose();
  rack = audioCtx ? new AudioRack(audioCtx) : null;
  if (engine) rack?.startEngine(speed, combo);
}

function tick() {
  if (status !== 'playing') return;
  const now = clockTime();
  const dt = clamp(now - lastTick, 0, 0.25);
  lastTick = now;
  intensity += (intensityFor({ speed, tier }) - intensity) * (1 - Math.exp(-dt * 2));
  comboAccent += (clamp(combo / 20) - comboAccent) * (1 - Math.exp(-dt * 3));
  transport.setSpeed(speed);
  transport.advance(now, ({ step, time, beatDuration }) => {
    // Keep a scheduled bar snapshot so pausing before its downbeat can replay
    // that transition; arrangement changes only happen on bar boundaries.
    if (step % 16 === 0) {
      if (pendingBar?.step !== step) {
        pendingBar = { step, state: { intensity, zone, fill: pendingFill } };
        pendingFill = false;
      }
      arrangement = pendingBar.state;
    }
    if (!rack) return;
    for (const note of scoreStep(track, step, { ...arrangement, combo: comboAccent })) {
      rack.note(note, time, beatDuration);
    }
  });
}

export function startAudioRun() {
  stopScheduler();
  ensureAudio();
  let storage;
  try { storage = window.localStorage; } catch { /* Private/blocked storage. */ }
  const choice = takeNextTrack(storage, nextTrack);
  track = choice.track; nextTrack = choice.next;
  speed = 26; tier = zone = combo = intensity = comboAccent = 0;
  arrangement = { intensity: 0, zone: 0, fill: false };
  pendingFill = false; pendingBar = null; eventTimes.clear();
  transport = new MusicTransport();
  replaceRack(true);
  status = 'playing';
  lastTick = clockTime(); transport.start(lastTick);
  tick(); timer = setInterval(tick, 25);
}

export function updateAudioState(state) {
  if (status !== 'playing') return;
  speed = clamp(state.speed, 26, 72);
  const newTier = clamp(state.tier, 0, 5), newZone = clamp(state.zone, 0, 4);
  if (newTier !== tier || newZone !== zone) pendingFill = true;
  tier = newTier; zone = newZone; combo = clamp(state.combo, 0, 1000);
  rack?.updateEngine(speed, combo);
}

export function pauseAudioRun() {
  if (status !== 'playing') return;
  transport.pause(clockTime());
  status = 'paused'; stopScheduler();
  rack?.dispose(); rack = null;
}

export function resumeAudioRun() {
  if (status !== 'paused') return;
  ensureAudio();
  replaceRack(true); rack?.updateEngine(speed, combo);
  eventTimes.clear();
  status = 'playing'; lastTick = clockTime();
  transport.start(lastTick);
  tick(); timer = setInterval(tick, 25);
}

export function endAudioRun() {
  if (status !== 'playing' && status !== 'paused') return;
  transport.pause(clockTime()); stopScheduler();
  status = 'over';
  replaceRack(); eventTimes.clear();
  playSound('crash');
}

export function getAudioBeat() {
  return transport.visual(clockTime());
}

// Read-only inspection for timing, rotation and lifecycle verification.
export function getAudioSnapshot() {
  return {
    status, track: track.id, trackName: track.name, nextTrack,
    bpm: transport.bpm, step: transport.step, beat: getAudioBeat(),
    intensity, comboAccent, zone, arrangement: { ...arrangement },
    voices: rack?.voices.size || 0, engine: Boolean(rack?.engine),
    scheduler: timer !== null, contextState: audioCtx?.state || 'unavailable'
  };
}

export function playSound(event, value = 0) {
  if (!rack || status === 'paused' || status === 'idle') return;
  if (status === 'over' && event !== 'crash' && event !== 'summary') return;
  const t = audioCtx.currentTime + 0.005;
  const cooldown = event === 'pickup' ? 0.035 : event === 'nearMiss' ? 0.09 : 0.05;
  if (t - (eventTimes.get(event) ?? -Infinity) < cooldown) return;
  eventTimes.set(event, t);
  const tone = (kind, midi, offset = 0, beats = 0.2, gain = 0.12, pan = 0) =>
    rack.note({ kind, midi, beats, gain, pan }, t + offset, 1, 'sfx');
  const voice = options => rack.voice({ time: t, duration: 0.2, bus: 'sfx', ...options });
  const chime = (degrees, spacing = 0.075, kind = 'bell', gain = 0.09) => {
    degrees.forEach((degree, i) => tone(kind, scaleNote(track, degree), i * spacing, 0.28, gain));
  };
  switch (event) {
    case 'pickup':
      tone(track.id === 'yufeng' ? 'zither' : 'bell', pickupNote(track, value), 0, 0.17, 0.1);
      if (value > 0 && value % 8 === 0) {
        tone('bell', pickupNote(track, value), 0.075, 0.28, 0.07);
        rack.duck(t, 0.8, 0.22);
      }
      break;
    case 'comboBreak':
      voice({ type: 'triangle', frequency: 310, endFrequency: 155, gain: 0.055, cutoff: 1000 });
      break;
    case 'jump':
    case 'airJump': {
      const air = event === 'airJump';
      voice({ frequency: air ? 440 : 190, endFrequency: air ? 1100 : 550, gain: 0.085, duration: 0.22, cutoff: 2400 });
      voice({ noise: true, filterType: 'bandpass', cutoff: 650, endCutoff: 3200, gain: 0.06, duration: 0.19 });
      if (air) chime([2, 4, 7], 0.045, 'bell', 0.05);
      break;
    }
    case 'land':
      voice({ frequency: 120, endFrequency: 48, gain: 0.15, duration: 0.16 });
      voice({ noise: true, cutoff: 700, gain: 0.08, duration: 0.1 });
      break;
    case 'nearMiss': {
      const side = clamp(value / 3.6, -1, 1);
      voice({ noise: true, filterType: 'bandpass', cutoff: 1800, endCutoff: 420, q: 0.8,
        attack: 0.055, gain: 0.18, duration: 0.27, pan: side * 0.35, endPan: side });
      break;
    }
    case 'perfectJump': chime([2, 4], 0.07, 'bell', 0.085); break;
    case 'lock': chime([0, 4], 0.035, 'bell', 0.05); break;
    case 'shieldReady':
      chime([0, 2, 4, 7], 0.06, 'bell', 0.08);
      voice({ frequency: 220, endFrequency: 620, gain: 0.06, duration: 0.32 });
      break;
    case 'shieldBreak':
      rack.duck(t, 0.5, 0.45);
      voice({ noise: true, filterType: 'bandpass', cutoff: 3600, endCutoff: 500, gain: 0.24, duration: 0.35 });
      voice({ frequency: 640, endFrequency: 95, type: 'triangle', gain: 0.16, duration: 0.3 });
      tone('bell', scaleNote(track, 4), 0.025, 0.12, 0.065, -0.5);
      tone('bell', scaleNote(track, 2), 0.08, 0.17, 0.05, 0.5);
      break;
    case 'evolve':
      pendingFill = true;
      rack.duck(t, 0.48, 0.7);
      chime([0, 2, 4, 7], 0.085, track.lead, 0.11);
      voice({ noise: true, filterType: 'bandpass', cutoff: 300, endCutoff: 4000, attack: 0.17, gain: 0.1, duration: 0.48 });
      tone('taiko', 45, 0, 0.3, 0.12);
      break;
    case 'zone':
      pendingFill = true;
      chime([0, 4, 7], 0.1, track.lead, 0.085);
      break;
    case 'speed':
      chime([0, 2, 4], 0.08, 'lead', 0.06);
      break;
    case 'crash':
      voice({ frequency: 155, endFrequency: 30, gain: 0.5, duration: 0.65 });
      voice({ noise: true, cutoff: 4000, endCutoff: 180, gain: 0.36, duration: 0.75 });
      voice({ noise: true, filterType: 'bandpass', cutoff: 2700, gain: 0.2, duration: 0.12, pan: -0.2 });
      voice({ time: t + 0.06, noise: true, filterType: 'bandpass', cutoff: 1200, gain: 0.13, duration: 0.38, pan: 0.3 });
      break;
    case 'shatter':
      rack?.duck(t, 0.45, 0.4);
      voice({ frequency: 240, endFrequency: 40, gain: 0.4, duration: 0.5 });
      voice({ noise: true, cutoff: 5500, endCutoff: 350, gain: 0.32, duration: 0.42 });
      voice({ noise: true, filterType: 'bandpass', cutoff: 3400, endCutoff: 900, gain: 0.25, duration: 0.28 });
      break;
    case 'summary': tone('bell', scaleNote(track, clamp(Math.floor(value), 0, 9)), 0, 0.1, 0.055); break;
  }
}
