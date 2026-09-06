import { clamp, midiHz } from './score.js';

const resources = new WeakMap();
const EPSILON = 0.0001;
const MAX_VOICES = 96;

function getResources(ctx) {
  if (resources.has(ctx)) return resources.get(ctx);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  let seed = 0x12345678;
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 0xffffffff * 2 - 1;
  };
  for (let i = 0; i < samples.length; i++) samples[i] = random();
  const room = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 0.8), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = room.getChannelData(ch);
    let filtered = 0;
    for (let i = 0; i < data.length; i++) {
      filtered = filtered * 0.65 + random() * 0.35;
      data[i] = filtered * Math.exp(-i / ctx.sampleRate * 8) * Math.min(1, i / 150);
    }
  }
  const wave = harmonics => ctx.createPeriodicWave(new Float32Array(harmonics.length), new Float32Array(harmonics));
  const result = {
    noise, room,
    zither: wave([0, 1, 0.5, 0.28, 0.2, 0.08, 0.09, 0.035, 0.02]),
    flute: wave([0, 1, 0.19, 0.07, 0.025]),
    bell: wave([0, 1, 0.12, 0.35, 0.015, 0.07])
  };
  resources.set(ctx, result);
  return result;
}

function smooth(param, value, now, time = 0.06) {
  param.setTargetAtTime(value, now, time);
}

export class AudioRack {
  constructor(ctx) {
    this.ctx = ctx;
    this.resources = getResources(ctx);
    this.voices = new Set();
    this.nodes = [];
    this.engine = null;
    this.disposed = false;
    this.master = this.gain(0.8);
    this.music = this.gain(0.8);
    this.sfx = this.gain(0.8);
    this.engineBus = this.gain(0.65);
    this.duckGain = this.gain(1);
    this.compressor = this.keep(ctx.createDynamicsCompressor());
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.16;
    this.music.connect(this.duckGain);
    this.duckGain.connect(this.compressor);
    this.sfx.connect(this.compressor);
    this.engineBus.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    this.reverb = this.keep(ctx.createConvolver());
    this.reverb.buffer = this.resources.room;
    const roomGain = this.gain(0.17);
    this.reverb.connect(roomGain); roomGain.connect(this.music);
    this.echo = this.keep(ctx.createDelay(0.5));
    this.echo.delayTime.value = 0.27;
    const echoFilter = this.keep(ctx.createBiquadFilter());
    echoFilter.type = 'lowpass'; echoFilter.frequency.value = 2300;
    const echoGain = this.gain(0.16);
    const echoPan = this.keep(ctx.createStereoPanner()); echoPan.pan.value = 0.4;
    this.echo.connect(echoFilter); echoFilter.connect(echoGain);
    echoGain.connect(echoPan); echoPan.connect(this.music);
  }

  keep(node) { this.nodes.push(node); return node; }
  gain(value) { const node = this.keep(this.ctx.createGain()); node.gain.value = value; return node; }

  // Each voice owns and releases its entire node chain. Reserve 24 voices
  // for effects. Expired offline voices do not count against later notes.
  voice({ time, duration, frequency = 440, endFrequency, type = 'sine', wave,
    noise = false, gain = 0.1, attack = 0.004, sustain = 0, cutoff = 4500,
    endCutoff, filterType = 'lowpass', q = 0.7, pan = 0, endPan, bus = 'music',
    reverb = 0, echo = 0, vibrato = 0, detune = 0 }) {
    if (this.disposed) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, time);
    const dur = Math.max(0.025, duration);
    let active = this.voices.size;
    // Offline rendering reserves an entire score before playback. Live audio
    // also counts future/ending voices, so dense event chords cannot exhaust
    // resources while their start times are still inside the lookahead.
    if (typeof ctx.startRendering === 'function') {
      active = 0;
      for (const voice of this.voices) if (voice.end > t && voice.start < t + dur + 0.015) active++;
    }
    if (active >= (bus === 'music' ? MAX_VOICES - 24 : MAX_VOICES)) return;

    const source = noise ? ctx.createBufferSource() : ctx.createOscillator();
    const nodes = [source];
    const sources = [source];
    if (noise) { source.buffer = this.resources.noise; source.loop = true; }
    else {
      if (wave) source.setPeriodicWave(this.resources[wave]); else source.type = type;
      source.frequency.setValueAtTime(frequency, t);
      source.detune.value = detune;
      if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, t + dur * 0.7);
      if (vibrato) {
        const lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = 5.1;
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(vibrato, t + dur * 0.55);
        lfo.connect(depth); depth.connect(source.detune);
        nodes.push(lfo, depth); sources.push(lfo);
      }
    }
    const filter = ctx.createBiquadFilter(); filter.type = filterType;
    const maxCutoff = Math.min(18000, ctx.sampleRate * 0.45);
    filter.frequency.setValueAtTime(clamp(cutoff, 40, maxCutoff), t); filter.Q.value = q;
    if (endCutoff) filter.frequency.exponentialRampToValueAtTime(clamp(endCutoff, 40, maxCutoff), t + dur);
    const envelope = ctx.createGain();
    const peak = clamp(gain, EPSILON, 0.65);
    const rise = Math.min(attack, dur * 0.3);
    envelope.gain.setValueAtTime(EPSILON, t);
    envelope.gain.linearRampToValueAtTime(peak, t + rise);
    if (sustain) {
      envelope.gain.exponentialRampToValueAtTime(peak * sustain, t + dur * 0.45);
      envelope.gain.setValueAtTime(peak * sustain, t + dur * 0.72);
    }
    envelope.gain.exponentialRampToValueAtTime(EPSILON, t + dur);
    const panner = ctx.createStereoPanner(); panner.pan.setValueAtTime(clamp(pan, -1, 1), t);
    if (endPan !== undefined) panner.pan.linearRampToValueAtTime(clamp(endPan, -1, 1), t + dur);
    source.connect(filter); filter.connect(envelope); envelope.connect(panner); panner.connect(this[bus]);
    nodes.push(filter, envelope, panner);
    for (const [amount, destination] of [[reverb, this.reverb], [echo, this.echo]]) {
      if (!amount) continue;
      const send = ctx.createGain(); send.gain.value = amount;
      panner.connect(send); send.connect(destination); nodes.push(send);
    }
    const voice = { sources, nodes, envelope, start: t, end: t + dur + 0.015 };
    this.voices.add(voice);
    source.onended = () => {
      for (const node of nodes) node.disconnect();
      this.voices.delete(voice);
    };
    for (const item of sources) { item.start(t); item.stop(voice.end); }
  }

  note(note, time, beatDuration = 1, bus = 'music') {
    const { kind, midi = 69, beats = 0.2, gain = 0.1, pan = 0 } = note;
    const frequency = midiHz(midi);
    const duration = Math.max(0.04, beats * beatDuration);
    const base = { time, frequency, duration, gain, pan, bus };
    switch (kind) {
      case 'kick':
        this.voice({ ...base, frequency: 155, endFrequency: 43, duration: 0.22, cutoff: 1200 });
        this.voice({ ...base, noise: true, gain: gain * 0.1, duration: 0.018, cutoff: 2400 });
        break;
      case 'snare':
        this.voice({ ...base, noise: true, duration: 0.15, filterType: 'bandpass', cutoff: 2100, q: 0.65 });
        this.voice({ ...base, frequency: 185, endFrequency: 115, gain: gain * 0.45, duration: 0.11 });
        break;
      case 'hat':
        this.voice({ ...base, noise: true, filterType: 'highpass', cutoff: 6800, duration: Math.min(0.16, duration) });
        break;
      case 'taiko':
        this.voice({ ...base, frequency: 115, endFrequency: 67, duration: 0.38, gain: gain * 1.4 });
        this.voice({ ...base, frequency: 183, endFrequency: 160, duration: 0.19, gain: gain * 0.45 });
        this.voice({ ...base, noise: true, duration: 0.06, cutoff: 1600, gain: gain * 0.3 });
        break;
      case 'bass':
        this.voice({ ...base, type: 'sawtooth', cutoff: 750, endCutoff: 160 });
        this.voice({ ...base, gain: gain * 0.65, cutoff: 240 });
        break;
      case 'pad':
        this.voice({ ...base, type: 'triangle', attack: 0.15, sustain: 0.65, cutoff: 1500, reverb: 0.7, detune: pan * 9 });
        break;
      case 'zither':
        this.voice({ ...base, wave: 'zither', attack: 0.002, cutoff: 6200, endCutoff: 900, reverb: 0.55, echo: 0.45 });
        this.voice({ ...base, frequency: frequency * 2.003, gain: gain * 0.17, duration: duration * 0.35, cutoff: 4200 });
        this.voice({ ...base, noise: true, gain: gain * 0.1, duration: 0.018, filterType: 'bandpass', cutoff: 3200 });
        break;
      case 'flute':
        this.voice({ ...base, wave: 'flute', attack: 0.055, sustain: 0.8, cutoff: 3800, vibrato: 9, reverb: 0.7 });
        this.voice({ ...base, noise: true, gain: gain * 0.09, attack: 0.04, filterType: 'bandpass', cutoff: 2500, q: 1.8 });
        break;
      case 'bell':
        this.voice({ ...base, wave: 'bell', cutoff: 4500, reverb: 0.3 });
        break;
      case 'stab':
        this.voice({ ...base, type: 'sawtooth', cutoff: 2400, endCutoff: 550, duration: Math.min(duration, 0.2), echo: 0.3 });
        this.voice({ ...base, frequency: frequency * 1.004, type: 'triangle', gain: gain * 0.25, duration: Math.min(duration, 0.18) });
        break;
      default:
        this.voice({ ...base, type: 'triangle', cutoff: 3400, echo: 0.55, reverb: 0.2 });
        this.voice({ ...base, type: 'sawtooth', gain: gain * 0.18, cutoff: 1900, endCutoff: 700 });
    }
  }

  duck(time, amount = 0.55, duration = 0.45) {
    const param = this.duckGain.gain;
    param.cancelAndHoldAtTime(time);
    param.linearRampToValueAtTime(amount, time + 0.015);
    param.setTargetAtTime(1, time + duration * 0.45, duration * 0.25);
  }

  startEngine(speed = 26, combo = 0) {
    if (this.engine || this.disposed) return;
    const ctx = this.ctx;
    const low = this.keep(ctx.createOscillator()); low.type = 'triangle';
    const harmonic = this.keep(ctx.createOscillator()); harmonic.type = 'sawtooth';
    const hz = 46 + clamp(speed, 26, 72) * 1.5 + clamp(combo, 0, 30) * 0.5;
    low.frequency.value = hz; harmonic.frequency.value = hz * 2.01;
    const noise = this.keep(ctx.createBufferSource()); noise.buffer = this.resources.noise; noise.loop = true;
    const body = this.keep(ctx.createBiquadFilter()); body.type = 'lowpass'; body.frequency.value = 260;
    const wind = this.keep(ctx.createBiquadFilter()); wind.type = 'bandpass'; wind.frequency.value = 500; wind.Q.value = 0.5;
    const lowGain = this.gain(0.04), harmonicGain = this.gain(0.012), windGain = this.gain(0.004);
    low.connect(lowGain); lowGain.connect(this.engineBus);
    harmonic.connect(body); body.connect(harmonicGain); harmonicGain.connect(this.engineBus);
    noise.connect(wind); wind.connect(windGain); windGain.connect(this.engineBus);
    this.engine = { low, harmonic, noise, body, wind, lowGain, harmonicGain, windGain };
    this.engineBus.gain.setValueAtTime(0, ctx.currentTime);
    this.engineBus.gain.linearRampToValueAtTime(0.65, ctx.currentTime + 0.08);
    this.updateEngine(speed, combo);
    low.start(); harmonic.start(); noise.start();
  }

  updateEngine(speed, combo) {
    if (!this.engine || this.disposed) return;
    const { low, harmonic, body, wind, lowGain, harmonicGain, windGain } = this.engine;
    const v = clamp((speed - 26) / 46), t = this.ctx.currentTime;
    const hz = 46 + clamp(speed, 26, 72) * 1.5 + clamp(combo, 0, 30) * 0.5;
    smooth(low.frequency, hz, t, 0.1); smooth(harmonic.frequency, hz * 2.01, t, 0.1);
    smooth(body.frequency, 240 + v * 650, t);
    smooth(wind.frequency, 450 + v * 1500, t);
    smooth(lowGain.gain, 0.03 + v * 0.008, t);
    smooth(harmonicGain.gain, 0.012 + v * 0.01, t);
    smooth(windGain.gain, 0.004 + v * 0.024, t);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelAndHoldAtTime(now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.025);
    for (const voice of this.voices) {
      for (const source of voice.sources) { try { source.stop(now + 0.03); } catch { /* Already ended. */ } }
    }
    if (this.engine) {
      for (const source of [this.engine.low, this.engine.harmonic, this.engine.noise]) source.stop(now + 0.03);
    }
    // Disconnect tails even if the browser suspends before the release ends.
    setTimeout(() => {
      for (const voice of this.voices) for (const node of voice.nodes) node.disconnect();
      this.voices.clear();
      for (const node of this.nodes) node.disconnect();
      this.nodes = [];
      this.engine = null;
    }, 60);
  }
}
