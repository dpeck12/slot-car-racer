import { Track } from '../track/Track';
import type { CarState, BotOutput } from '../systems/physics';
import { DIFFICULTY } from './difficulty';

function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)); }

export class Bot {
  private track: Track;
  private alpha = DIFFICULTY[1].alpha;
  private pid = { ...DIFFICULTY[1].pid };
  private integ = 0;
  private lastErr = 0;

  constructor(track: Track) {
    this.track = track;
  }

  setDifficulty(name: string) {
    const preset = DIFFICULTY.find(d => d.name.toLowerCase() === name.toLowerCase());
    if (preset) {
      this.alpha = preset.alpha;
      this.pid = { ...preset.pid };
    }
  }

  update(state: CarState, dt: number): BotOutput {
    const vTarget = this.computeTargetSpeed(state.sMeters);
    const err = vTarget - state.v;
    this.integ = clamp(this.integ + err * dt, -5, 5);
    const deriv = (err - this.lastErr) / dt;
    this.lastErr = err;
    let u = this.pid.kp * err + this.pid.ki * this.integ + this.pid.kd * deriv;
    u = clamp(u / 10, 0, 1); // scale to 0..1
    return { throttle: u };
  }

  private computeTargetSpeed(sMeters: number): number {
    // Lookahead across next samples to find min corner speed limit
    const lookaheadMeters = 15; // meters
    const stepMeters = 0.5;
    let vMax = 100; // high default
    for (let d = 0; d <= lookaheadMeters; d += stepMeters) {
      const rPx = this.track.radiusPxAt(sMeters + d);
      if (!isFinite(rPx)) continue;
      const r = rPx * this.track.metersPerPixel;
      const aLatMax = 0.85 * 9.81; // align with physics mu*g
      const vCorner = Math.sqrt(aLatMax * r);
      vMax = Math.min(vMax, vCorner);
    }
    return this.alpha * vMax;
  }
}
