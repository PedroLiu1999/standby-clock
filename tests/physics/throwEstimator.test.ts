import { describe, expect, it } from 'vitest';
import { ThrowEstimator } from '../../src/physics/throwEstimator';

describe('ThrowEstimator — F3: Throw Velocity Estimation', () => {
  it('returns { x: 0, y: 0 } when buffer has 0 or 1 sample', () => {
    const estimator = new ThrowEstimator();
    expect(estimator.getVelocity()).toEqual({ x: 0, y: 0 });

    estimator.addSample(100, 200, 1000);
    expect(estimator.getVelocity()).toEqual({ x: 0, y: 0 });
  });

  it('computes accurate horizontal, vertical, and diagonal velocities in px/s', () => {
    const estimator = new ThrowEstimator();
    estimator.addSample(100, 200, 1000);
    estimator.addSample(130, 160, 1050); // dx=+30, dy=-40 over 50ms -> (600, -800)

    const v = estimator.getVelocity();
    expect(v.x).toBeCloseTo(600, 6);
    expect(v.y).toBeCloseTo(-800, 6);
  });

  it('prunes samples older than the 80ms rolling window', () => {
    const estimator = new ThrowEstimator({ windowMs: 80, maxThrowSpeed: 1600 });
    // Old movement to the left
    estimator.addSample(200, 100, 1000);
    estimator.addSample(100, 100, 1020);
    // Recent movement to the right within [1100 - 80, 1100] = [1020, 1100]
    estimator.addSample(100, 100, 1040);
    estimator.addSample(140, 100, 1080);
    estimator.addSample(180, 100, 1120); // prunes t < 1040

    const v = estimator.getVelocity();
    // Window spans t=1040 (x=100) to t=1120 (x=180): +80px over 80ms = 1000 px/s
    expect(v.x).toBeCloseTo(1000, 6);
    expect(v.y).toBeCloseTo(0, 6);
  });

  it('returns { x: 0, y: 0 } when samples are stale at release time (pause before release)', () => {
    const estimator = new ThrowEstimator({ windowMs: 80 });
    estimator.addSample(100, 100, 1000);
    estimator.addSample(200, 100, 1040);

    // User pauses until t=1200 before releasing
    expect(estimator.getVelocity(1200)).toEqual({ x: 0, y: 0 });
    expect(estimator.release(1200)).toEqual({ x: 0, y: 0 });
  });

  it('handles identical timestamps (dt === 0), out-of-order samples, and non-finite inputs safely', () => {
    const estimator = new ThrowEstimator();
    estimator.addSample(100, 100, 1000);
    estimator.addSample(150, 150, 1000); // dt === 0
    expect(estimator.getVelocity()).toEqual({ x: 0, y: 0 });

    // Non-finite inputs are ignored
    estimator.addSample(Number.NaN, 120, 1020);
    estimator.addSample(120, Number.POSITIVE_INFINITY, 1020);
    // Out-of-order timestamp is ignored
    estimator.addSample(90, 90, 950);

    // Valid sample after t=1000
    estimator.addSample(140, 100, 1050);
    const v = estimator.getVelocity();
    expect(Number.isFinite(v.x)).toBe(true);
    expect(Number.isFinite(v.y)).toBe(true);
    expect(v.x).toBeCloseTo(800, 6); // (140 - 100) / 0.05s
    expect(v.y).toBeCloseTo(0, 6);
  });

  it('clamps velocity magnitude to maxThrowSpeed while preserving direction', () => {
    const estimator = new ThrowEstimator({ windowMs: 80, maxThrowSpeed: 1600 });
    // dx=150, dy=200 over 50ms -> (3000, 4000), speed = 5000
    estimator.addSample(0, 0, 1000);
    estimator.addSample(150, 200, 1050);

    const v = estimator.getVelocity();
    const speed = Math.hypot(v.x, v.y);
    expect(speed).toBeCloseTo(1600, 6);
    expect(Math.atan2(v.y, v.x)).toBeCloseTo(Math.atan2(4000, 3000), 6);
  });

  it('resets buffer on reset() and release()', () => {
    const estimator = new ThrowEstimator();
    estimator.addSample(0, 0, 1000);
    estimator.addSample(50, 0, 1050);

    const released = estimator.release();
    expect(released.x).toBeCloseTo(1000, 6);
    expect(estimator.getVelocity()).toEqual({ x: 0, y: 0 });

    estimator.addSample(0, 0, 2000);
    estimator.addSample(50, 0, 2050);
    estimator.reset();
    expect(estimator.getVelocity()).toEqual({ x: 0, y: 0 });
  });
});

describe('ThrowEstimator — Adversarial Options & Inputs', () => {
  it('falls back to defaults for invalid constructor options and handles maxThrowSpeed <= 0', () => {
    const badWindow = new ThrowEstimator({ windowMs: -10, maxThrowSpeed: Number.NaN });
    badWindow.addSample(0, 0, 1000);
    badWindow.addSample(40, 0, 1050);
    expect(badWindow.getVelocity().x).toBeCloseTo(800, 6);

    const zeroSpeed = new ThrowEstimator({ maxThrowSpeed: -50 });
    zeroSpeed.addSample(0, 0, 1000);
    zeroSpeed.addSample(40, 0, 1050);
    expect(zeroSpeed.getVelocity()).toEqual({ x: 0, y: 0 });
  });

  it('returns { x: 0, y: 0 } when getVelocity is called with non-finite nowMs', () => {
    const estimator = new ThrowEstimator();
    estimator.addSample(0, 0, 1000);
    estimator.addSample(50, 0, 1050);
    expect(estimator.getVelocity(Number.NaN)).toEqual({ x: 0, y: 0 });
    expect(estimator.getVelocity(Number.POSITIVE_INFINITY)).toEqual({ x: 0, y: 0 });
  });
});
