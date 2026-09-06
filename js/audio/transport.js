import { bpmForSpeed, clamp } from './score.js';

// A small audio-clock transport, independent of rendering and of WebAudio nodes.
export class MusicTransport {
  constructor() {
    this.bpm = bpmForSpeed(26);
    this.targetBpm = this.bpm;
    this.step = 0;
    this.nextTime = 0;
    this.pending = [];
    this.beatTime = -Infinity;
    this.beatCount = 0;
    this.active = false;
    this.remaining = 0.03;
    this.lastTime = null;
  }

  start(now) {
    this.active = true;
    this.nextTime = now + this.remaining;
    this.lastTime = now;
  }

  setSpeed(speed) { this.targetBpm = bpmForSpeed(speed); }

  consume(now) {
    while (this.pending.length && this.pending[0].time <= now) {
      const event = this.pending.shift();
      if (event.step % 4 === 0) {
        this.beatTime = event.time;
        this.beatCount = Math.floor(event.step / 4) + 1;
      }
    }
  }

  advance(now, schedule = () => {}) {
    if (!this.active) return;
    this.consume(now);
    const dt = clamp(now - this.lastTime, 0, 0.25);
    this.lastTime = now;
    this.bpm += (this.targetBpm - this.bpm) * (1 - Math.exp(-dt * 3));
    const stepDuration = 15 / this.bpm;
    // After a main-thread stall, skip elapsed steps instead of bursting old notes.
    if (this.nextTime < now) {
      const missed = Math.ceil((now - this.nextTime) / stepDuration);
      this.step += missed;
      this.nextTime += missed * stepDuration;
    }
    while (this.nextTime < now + 0.1) {
      const event = { step: this.step, time: this.nextTime, beatDuration: 60 / this.bpm };
      this.pending.push(event);
      schedule(event);
      this.step++;
      this.nextTime += stepDuration;
    }
  }

  pause(now) {
    if (!this.active) return;
    this.consume(now);
    const first = this.pending[0];
    this.remaining = Math.max(0.005, (first ? first.time : this.nextTime) - now);
    if (first) this.step = first.step;
    this.pending = [];
    this.active = false;
    this.beatTime = -Infinity;
  }

  visual(now) {
    this.consume(now);
    return { count: this.beatCount, glow: this.active ? Math.exp(-Math.max(0, now - this.beatTime) * 6) : 0 };
  }
}
