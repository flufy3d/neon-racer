// Original, procedural scores. Steps are sixteenth notes; each song is 32 bars.
export const TRACKS = [
  {
    id: 'neon', name: '霓虹疾驰', tonic: 57, scale: [0, 2, 3, 5, 7, 8, 10],
    roots: [33, 29, 36, 31], lead: 'lead',
    motifs: [
      [0, -1, 2, 4, -1, 2, 1, -1, 0, 4, 6, -1, 4, 2, 1, -1],
      [2, -1, 4, 6, 7, -1, 6, 4, 2, -1, 1, 2, 4, -1, 1, -1],
      [7, 6, 4, -1, 2, 4, 6, -1, 7, -1, 9, 7, 6, 4, 2, -1],
      [4, -1, 2, -1, 1, 2, 0, -1, 4, -1, 2, 1, 0, -1, -1, -1]
    ]
  },
  {
    id: 'yufeng', name: '御风行', tonic: 62, scale: [0, 2, 4, 7, 9],
    roots: [38, 43, 38, 45], lead: 'zither',
    motifs: [
      [0, -1, 1, 2, 3, -1, 2, -1, 1, 0, -1, 1, 3, 2, -1, -1],
      [3, -1, 4, 5, 4, 3, -1, 2, 1, -1, 2, 3, 1, 0, -1, -1],
      [5, 4, 3, -1, 2, 3, 4, -1, 5, -1, 6, 5, 3, 2, 1, -1],
      [3, -1, 2, 1, 0, -1, 1, -1, 2, 1, 0, -1, 0, -1, -1, -1]
    ]
  },
  {
    id: 'pulse', name: '极速脉冲', tonic: 52, scale: [0, 2, 3, 5, 7, 8, 10],
    roots: [28, 28, 36, 31], lead: 'stab',
    motifs: [
      [0, -1, 4, -1, 2, 0, -1, 6, -1, 4, 2, -1, 0, -1, 1, -1],
      [2, 4, -1, 6, -1, 7, 4, -1, 2, -1, 1, 0, -1, 4, 2, -1],
      [7, -1, 4, 6, -1, 7, 9, -1, 7, 6, -1, 4, 2, -1, 4, -1],
      [4, -1, 2, 0, -1, 1, -1, 2, 0, -1, -1, 4, 1, -1, 0, -1]
    ]
  }
];

export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
export const midiHz = midi => 440 * 2 ** ((midi - 69) / 12);
export const bpmForSpeed = speed => 92 + clamp(speed, 26, 72) * 1.15;
export const intensityFor = ({ speed, tier }) => clamp((clamp(speed, 26, 72) - 26) / 46 * 0.6 + clamp(tier, 0, 5) * 0.1);

export function scaleNote(track, degree) {
  const n = track.scale.length;
  return track.tonic + track.scale[((degree % n) + n) % n] + Math.floor(degree / n) * 12;
}

export function pickupNote(track, combo) {
  return scaleNote(track, Math.min(9, Math.max(0, Math.floor(combo) - 1))) + (track.id === 'pulse' ? 12 : 0);
}

export function takeNextTrack(storage, fallback = 0) {
  let index = fallback;
  try {
    const saved = storage?.getItem('neonRacerNextTrack');
    if (saved !== null && saved !== undefined && /^[0-2]$/.test(saved)) index = Number(saved);
  } catch { /* Storage may be disabled; keep rotating in memory. */ }
  const next = (index + 1) % TRACKS.length;
  try { storage?.setItem('neonRacerNextTrack', String(next)); } catch { /* Optional persistence. */ }
  return { track: TRACKS[index], next };
}

export function scoreStep(track, step, { intensity = 0, combo = 0, zone = 0, fill = false } = {}) {
  const bar = Math.floor(step / 16) % 32;
  const tick = step % 16;
  const section = Math.floor(bar / 8);
  const breakdown = section === 3 && bar % 8 < 4;
  const energy = clamp(intensity) * (breakdown ? 0.55 : 1);
  const root = track.roots[Math.floor(bar / 2) % 4];
  const notes = [];
  const add = (kind, midi, beats, gain, pan = 0) => notes.push({ kind, midi, beats, gain, pan });

  // Every theme is identifiable immediately, including at T0.
  const kicks = track.id === 'pulse' ? [0, 6, 10] : track.id === 'yufeng' ? [0, 8] : [0, 4, 8, 12];
  if (kicks.includes(tick) && (!breakdown || tick === 0 || tick === 8)) add('kick', 0, 0.5, 0.42);
  if ((tick === 4 || tick === 12) && (!breakdown || tick === 12)) add('snare', 0, 0.4, 0.12 + energy * 0.05);
  if (tick % 4 === 2 || (energy > 0.42 && tick % 2 === 0) || (energy > 0.78 && tick % 2 === 1)) {
    add('hat', 0, tick === 14 ? 0.28 : 0.12, tick % 4 === 2 ? 0.048 : 0.022, tick % 4 < 2 ? -0.3 : 0.3);
  }
  if (track.id === 'pulse' && energy > 0.25 && [3, 11, 15].includes(tick)) add('snare', 0, 0.2, 0.045, -0.15);
  if (track.id === 'yufeng' && (tick === 0 || (energy > 0.3 && tick === 10))) add('taiko', root + 12, 0.8, 0.12);

  const bassTicks = track.id === 'pulse' ? [0, 3, 6, 10, 14] : [0, 8];
  if (bassTicks.includes(tick) || (energy > 0.35 && tick === 14)) {
    add('bass', root + (tick === 14 ? 12 : 0), track.id === 'pulse' ? 0.42 : 1.1, 0.135);
  }
  if (tick === 0 && (bar % 2 === 0 || energy > 0.25)) {
    // Open fifths keep the Chinese score strictly pentatonic.
    const chord = track.id === 'yufeng' ? [12, 19, 24] : [12, (root % 12 === 0 || root % 12 === 5 || root % 12 === 7) ? 16 : 15, 19];
    chord.forEach((n, i) => add('pad', root + n + 12, breakdown ? 3.5 : 2.5, 0.022 + energy * 0.012, (i - 1) * 0.45));
  }

  const motif = track.motifs[(section + (zone >= 2 && bar % 4 >= 2 ? 1 : 0)) % 4];
  if (tick % 2 === 0) {
    const degree = motif[(bar % 2) * 8 + tick / 2];
    if (degree >= 0 && (!breakdown || tick % 4 === 0)) {
      const midi = scaleNote(track, degree) + (track.id === 'pulse' ? 12 : 0);
      add(track.lead, midi, track.id === 'yufeng' ? 1.1 : 0.38, track.id === 'yufeng' ? 0.095 : 0.065, -0.12);
      if (track.id === 'yufeng' && tick % 4 === 0 && (bar % 4 >= 2 || energy > 0.32)) {
        add('flute', midi + (energy > 0.72 ? 12 : 0), 1.35, 0.045, 0.25);
      }
    }
  }
  if (energy > 0.55 && tick % 4 === 3) {
    add(track.id === 'yufeng' ? 'zither' : 'bell', scaleNote(track, [0, 2, 4, 2][Math.floor(tick / 4)]) + 12, 0.3, 0.028, 0.35);
  }
  if (combo > 0.12 && tick === 7) add('bell', scaleNote(track, 4) + 12, 0.35, 0.035 * combo, -0.35);
  if ((bar % 8 === 7 || fill) && tick >= 12 && (tick % 2 === 0 || energy > 0.65)) {
    add(track.id === 'yufeng' ? 'taiko' : 'snare', root + 19, 0.3, 0.07 + (tick - 12) * 0.008, (tick - 14) * 0.15);
  }
  return notes;
}
