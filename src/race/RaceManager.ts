import type { CarState } from '../systems/physics';

export class RaceManager {
  totalLength: number;

  status: 'menu' | 'countdown' | 'running' = 'menu';
  private countdownRemaining = 0;
  private countdownTotal = 0;
  private falseStartHuman = false;
  private penaltyHuman = 0;

  laps: number[] = [];
  bestLap: number[] = [];
  /** Time on the current lap; NaN until the car first crosses the start/finish line. */
  currentLap: number[] = [];
  private elapsedLap: number[] = [];
  /** Which lap each car is on, as floor(s / trackLength). Cars on the grid start at -1. */
  private lapIndex: (number | null)[] = [];

  constructor(totalTrackMeters: number, carCount: number) {
    this.totalLength = totalTrackMeters;
    this.laps = new Array(carCount).fill(0);
    this.bestLap = new Array(carCount).fill(Infinity);
    this.currentLap = new Array(carCount).fill(NaN);
    this.elapsedLap = new Array(carCount).fill(0);
    this.lapIndex = new Array(carCount).fill(null);
  }

  startCountdown(seconds: number) {
    this.status = 'countdown';
    this.countdownRemaining = Math.max(0, seconds);
    this.countdownTotal = Math.max(0, seconds);
    this.falseStartHuman = false;
    this.penaltyHuman = 0;
    this.elapsedLap = this.elapsedLap.map(() => 0);
  }

  update(states: CarState[], dt: number, input: { throttle: number }) {
    // Handle countdown and false start detection
    if (this.status === 'menu') {
      return;
    }
    if (this.status === 'countdown') {
      // Detect false start if throttle pressed during countdown (human is index 0)
      if (input.throttle > 0.1 && !this.falseStartHuman) {
        this.falseStartHuman = true;
        this.penaltyHuman = 2.0; // seconds of lockout after GO
      }
      this.countdownRemaining = Math.max(0, this.countdownRemaining - dt);
      if (this.countdownRemaining <= 0) {
        this.status = 'running';
      }
      return;
    }

    // Apply ongoing penalty countdown during running
    if (this.penaltyHuman > 0) {
      this.penaltyHuman = Math.max(0, this.penaltyHuman - dt);
    }

    // sMeters grows continuously, so the lap a car is on is floor(s / L).
    // The first crossing of the line (from the grid) starts the clock; each
    // crossing after that completes a lap.
    for (let i = 0; i < states.length; i++) {
      const idx = Math.floor(states[i].sMeters / this.totalLength);
      const prevIdx = this.lapIndex[i];
      this.lapIndex[i] = idx;
      if (prevIdx === null) continue; // first running frame: just record where the car is
      this.elapsedLap[i] += dt;
      if (idx > prevIdx) {
        if (idx >= 1) {
          this.laps[i]++;
          if (this.elapsedLap[i] < this.bestLap[i]) this.bestLap[i] = this.elapsedLap[i];
        }
        this.elapsedLap[i] = 0;
      }
      this.currentLap[i] = idx >= 0 ? this.elapsedLap[i] : NaN;
    }
  }

  getCountdownSeconds(): number {
    return Math.ceil(this.countdownRemaining);
  }

  getCountdownProgress(): number {
    if (this.countdownTotal <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - this.countdownRemaining / this.countdownTotal));
  }

  isFalseStart(): boolean {
    return this.falseStartHuman;
  }

  throttleMultiplier(index: number): number {
    if (this.status === 'menu' || this.status === 'countdown') return 0;
    // Human is index 0: apply penalty lockout if needed
    if (index === 0 && this.penaltyHuman > 0) return 0;
    return 1;
  }
}
