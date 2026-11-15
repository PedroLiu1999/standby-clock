import type { Vec2 } from './types';

export interface PointerSample {
  x: number;
  y: number;
  t: number; // timestamp in ms (e.g. performance.now())
}

export interface ThrowEstimatorOptions {
  /** Rolling window duration in milliseconds. Default: 80 */
  windowMs?: number;
  /** Maximum release speed magnitude in px/s. Default: 1600 */
  maxThrowSpeed?: number;
}

const DEFAULT_WINDOW_MS = 80;
const DEFAULT_MAX_THROW_SPEED = 1600;

export class ThrowEstimator {
  private readonly windowMs: number;
  private readonly maxThrowSpeed: number;
  private samples: PointerSample[] = [];

  constructor(options: ThrowEstimatorOptions = {}) {
    this.windowMs =
      options.windowMs !== undefined && Number.isFinite(options.windowMs) && options.windowMs > 0
        ? options.windowMs
        : DEFAULT_WINDOW_MS;
    this.maxThrowSpeed =
      options.maxThrowSpeed !== undefined && Number.isFinite(options.maxThrowSpeed)
        ? Math.max(0, options.maxThrowSpeed)
        : DEFAULT_MAX_THROW_SPEED;
  }

  /**
   * Record a pointer sample `{ x, y, t }` (t in ms) and prune samples older than `t - windowMs`.
   */
  addSample(x: number, y: number, t: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t)) {
      return;
    }

    if (this.samples.length > 0 && t < this.samples[this.samples.length - 1].t) {
      // Ignore out-of-order timestamps so dt is never negative
      return;
    }

    this.samples.push({ x, y, t });
    this.pruneBefore(t - this.windowMs);
  }

  /**
   * Compute release velocity `(vx, vy)` in px/s, clamped to `maxThrowSpeed`.
   * If `nowMs` is provided, samples older than `nowMs - windowMs` are pruned first
   * so pausing before release yields `{ x: 0, y: 0 }`.
   */
  getVelocity(nowMs?: number): Vec2 {
    if (nowMs !== undefined) {
      if (!Number.isFinite(nowMs)) {
        return { x: 0, y: 0 };
      }
      this.pruneBefore(nowMs - this.windowMs);
    }

    if (this.samples.length < 2 || this.maxThrowSpeed <= 0) {
      return { x: 0, y: 0 };
    }

    const oldest = this.samples[0];
    const newest = this.samples[this.samples.length - 1];
    const dtMs = newest.t - oldest.t;

    if (dtMs <= 0) {
      return { x: 0, y: 0 };
    }

    const dtSec = dtMs / 1000;
    let vx = (newest.x - oldest.x) / dtSec;
    let vy = (newest.y - oldest.y) / dtSec;

    const speed = Math.hypot(vx, vy);
    if (speed > this.maxThrowSpeed) {
      const scale = this.maxThrowSpeed / speed;
      vx *= scale;
      vy *= scale;
    }

    return { x: vx, y: vy };
  }

  /**
   * Convenience method: computes `getVelocity(nowMs)` and clears the buffer.
   */
  release(nowMs?: number): Vec2 {
    const velocity = this.getVelocity(nowMs);
    this.reset();
    return velocity;
  }

  /**
   * Clear all buffered samples.
   */
  reset(): void {
    this.samples = [];
  }

  private pruneBefore(cutoffMs: number): void {
    while (this.samples.length > 0 && this.samples[0].t < cutoffMs) {
      this.samples.shift();
    }
  }
}
