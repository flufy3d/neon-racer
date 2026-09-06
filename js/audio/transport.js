import { bpmForSpeed, clamp } from './score.js';

// A small audio-clock transport, independent of rendering and of WebAudio nodes.
export class MusicTransport {
  constructor() {
    this.bpm = bpmForSpeed(26);
    this.targetBpm = this.bpm;
    this.step = 0;
    this.nextTime = 0;
    this.pending = [];
    this.pendingIndex = 0;
    this.beatTime = -Infinity;
    this.beatCount = 0;
    this.active = false;
    this.remaining = 0.03;
    this.lastTime = null;
    this._visualResult = { count: 0, glow: 0 };
  }

  start(now) {
    this.active = true;
    this.nextTime = now + this.remaining;
    this.lastTime = now;
  }

  setSpeed(speed) { this.targetBpm = bpmForSpeed(speed); }

  consume(now) {
    while (this.pendingIndex < this.pending.length && this.pending[this.pendingIndex].time <= now) {
      const event = this.pending[this.pendingIndex++];
      if (event.step % 4 === 0) {
        this.beatTime = event.time;
        this.beatCount = Math.floor(event.step / 4) + 1;
      }
    }
    if (this.pendingIndex > 32) {
      this.pending.splice(0, this.pendingIndex);
      this.pendingIndex = 0;
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
    const first = this.pending[this.pendingIndex];
    this.remaining = Math.max(0.005, (first ? first.time : this.nextTime) - now);
    if (first) this.step = first.step;
    this.pending = [];
    this.pendingIndex = 0;
    this.active = false;
    this.beatTime = -Infinity;
  }

  visual(now) {
    this.consume(now);
    this._visualResult.count = this.beatCount;
    this._visualResult.glow = this.active ? Math.exp(-Math.max(0, now - this.beatTime) * 6) : 0;
    return this._visualResult;
  }
}
