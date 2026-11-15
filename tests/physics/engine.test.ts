import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHYSICS_CONFIG,
  MAX_DT,
  TREAT_PHYSICS_CONFIG,
  clampToBounds,
  createTreatBody,
  resolveCollisions,
  stepPhysics,
  stepTreat,
} from '../../src/physics/engine';
import type { Bounds, Collider, PhysicsBody } from '../../src/physics/types';

function makeBody(overrides: Partial<PhysicsBody> = {}): PhysicsBody {
  return {
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    width: 40,
    height: 40,
    grounded: false,
    perchedOnId: null,
    ...overrides,
  };
}

const DEFAULT_BOUNDS: Bounds = { width: 800, height: 600 };

describe('stepPhysics — F1: 2D Gravity & Projectile Motion', () => {
  it('accelerates downward under gravity and integrates position', () => {
    const body = makeBody({ x: 200, y: 100, vx: 100, vy: 0 });
    const dt = 0.016;

    const events = stepPhysics(body, dt, DEFAULT_BOUNDS, []);
    expect(events).toEqual([]);
    expect(body.vy).toBeGreaterThan(0);
    expect(body.y).toBeGreaterThan(100);
    expect(body.x).toBeGreaterThan(200);
    expect(body.grounded).toBe(false);
  });

  it('clamps dt to MAX_DT (0.05s) to prevent tunneling on large frame gaps', () => {
    const clampedBody = makeBody({ x: 200, y: 50, vx: 0, vy: 0 });
    const hugeDtBody = makeBody({ x: 200, y: 50, vx: 0, vy: 0 });

    stepPhysics(clampedBody, MAX_DT, DEFAULT_BOUNDS, []);
    stepPhysics(hugeDtBody, 1.5, DEFAULT_BOUNDS, []);

    expect(hugeDtBody.x).toBeCloseTo(clampedBody.x, 8);
    expect(hugeDtBody.y).toBeCloseTo(clampedBody.y, 8);
    expect(hugeDtBody.vx).toBeCloseTo(clampedBody.vx, 8);
    expect(hugeDtBody.vy).toBeCloseTo(clampedBody.vy, 8);
  });

  it('ignores non-positive or non-finite dt without mutating body', () => {
    const original = makeBody({ x: 150, y: 120, vx: 50, vy: -30 });
    for (const badDt of [0, -0.016, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const body = { ...original };
      const events = stepPhysics(body, badDt, DEFAULT_BOUNDS, []);
      expect(events).toEqual([]);
      expect(body).toEqual(original);
    }
  });
});

describe('clampToBounds & F2: Restitution, Rest-Snap, Friction, Air Drag', () => {
  it('bounces off the floor when impact exceeds restSnapVy and emits bottom CollisionEvent', () => {
    const body = makeBody({ x: 100, y: 565, vy: 500 });
    const events = clampToBounds(body, DEFAULT_BOUNDS, DEFAULT_PHYSICS_CONFIG);

    expect(body.y).toBe(600 - body.height);
    expect(body.vy).toBeCloseTo(-500 * DEFAULT_PHYSICS_CONFIG.bounceY, 6);
    expect(body.grounded).toBe(false);
    expect(body.perchedOnId).toBeNull();
    expect(events).toEqual([
      { colliderId: null, side: 'bottom', impactSpeed: 500 },
    ]);
  });

  it('snaps to rest on floor when bounced speed is below restSnapVy (no jitter)', () => {
    const body = makeBody({ x: 100, y: 562, vy: 80 });
    // 80 * 0.4 = 32 < restSnapVy (45) -> should snap to 0 and ground
    const events = clampToBounds(body, DEFAULT_BOUNDS, DEFAULT_PHYSICS_CONFIG);

    expect(body.y).toBe(560);
    expect(body.vy).toBe(0);
    expect(body.grounded).toBe(true);
    expect(events).toEqual([
      { colliderId: null, side: 'bottom', impactSpeed: 80 },
    ]);

    // Subsequent step on floor should stay at rest without spamming collision events
    const nextEvents = stepPhysics(body, 0.016, DEFAULT_BOUNDS, []);
    expect(body.y).toBe(560);
    expect(body.vy).toBe(0);
    expect(body.grounded).toBe(true);
    expect(nextEvents).toEqual([]);
  });

  it('bounces off left wall, right wall, and ceiling with CollisionEvents', () => {
    const leftBody = makeBody({ x: -10, y: 200, vx: -300 });
    const leftEvents = clampToBounds(leftBody, DEFAULT_BOUNDS, DEFAULT_PHYSICS_CONFIG);
    expect(leftBody.x).toBe(0);
    expect(leftBody.vx).toBeCloseTo(300 * DEFAULT_PHYSICS_CONFIG.bounceX, 6);
    expect(leftEvents).toEqual([{ colliderId: null, side: 'left', impactSpeed: 300 }]);

    const rightBody = makeBody({ x: 780, y: 200, vx: 400 });
    const rightEvents = clampToBounds(rightBody, DEFAULT_BOUNDS, DEFAULT_PHYSICS_CONFIG);
    expect(rightBody.x).toBe(800 - rightBody.width);
    expect(rightBody.vx).toBeCloseTo(-400 * DEFAULT_PHYSICS_CONFIG.bounceX, 6);
    expect(rightEvents).toEqual([{ colliderId: null, side: 'right', impactSpeed: 400 }]);

    const topBody = makeBody({ x: 200, y: -5, vy: -250 });
    const topEvents = clampToBounds(topBody, DEFAULT_BOUNDS, DEFAULT_PHYSICS_CONFIG);
    expect(topBody.y).toBe(0);
    expect(topBody.vy).toBeCloseTo(250 * DEFAULT_PHYSICS_CONFIG.bounceY, 6);
    expect(topEvents).toEqual([{ colliderId: null, side: 'top', impactSpeed: 250 }]);
  });

  it('handles bounds smaller than body dimensions safely without NaN or phantom events', () => {
    const body = makeBody({ x: 50, y: 50, vx: 100, vy: 100, width: 40, height: 40 });
    const tinyBounds: Bounds = { width: 20, height: 20 };
    const events = clampToBounds(body, tinyBounds, DEFAULT_PHYSICS_CONFIG);

    expect(body.x).toBe(0);
    expect(body.y).toBe(0);
    expect(body.vx).toBe(0);
    expect(body.vy).toBe(0);
    expect(body.grounded).toBe(true);
    expect(events).toEqual([]);
  });

  it('applies stronger ground friction when grounded than air drag when airborne', () => {
    const groundedBody = makeBody({ x: 100, y: 560, vx: 200, vy: 0, grounded: true });
    const airborneBody = makeBody({ x: 100, y: 100, vx: 200, vy: 0, grounded: false });

    stepPhysics(groundedBody, 0.05, DEFAULT_BOUNDS, []);
    stepPhysics(airborneBody, 0.05, DEFAULT_BOUNDS, []);

    expect(groundedBody.vx).toBeLessThan(airborneBody.vx);
    expect(groundedBody.vx).toBeGreaterThan(0);

    // After many grounded steps, tiny residual vx snaps cleanly to 0
    for (let i = 0; i < 60; i++) {
      stepPhysics(groundedBody, 0.05, DEFAULT_BOUNDS, []);
    }
    expect(groundedBody.vx).toBe(0);
  });
});

describe('F4: Clock Element Platform Colliders', () => {
  const hoursCollider: Collider = {
    id: 'hours',
    rect: { x: 200, y: 300, width: 140, height: 80 },
    kind: 'platform',
  };

  it('lands one-way on top surface of a collider when falling across it', () => {
    const body = makeBody({ x: 240, y: 250, vy: 200 });
    const prevX = body.x;
    const prevY = body.y;
    body.y = 265; // bottom moved from 290 -> 305 across rect.y (300)

    const events = resolveCollisions(body, prevX, prevY, [hoursCollider], DEFAULT_PHYSICS_CONFIG);

    expect(body.y).toBe(300 - body.height);
    expect(body.vy).toBeCloseTo(-200 * DEFAULT_PHYSICS_CONFIG.bounceY, 6);
    expect(events).toEqual([
      { colliderId: 'hours', side: 'top', impactSpeed: 200 },
    ]);
  });

  it('perches on top surface when impact settles below restSnapVy', () => {
    const body = makeBody({ x: 240, y: 258, vy: 60 });
    const prevX = body.x;
    const prevY = body.y;
    body.y = 262; // bottom 298 -> 302

    const events = resolveCollisions(body, prevX, prevY, [hoursCollider], DEFAULT_PHYSICS_CONFIG);

    expect(body.y).toBe(260);
    expect(body.vy).toBe(0);
    expect(body.grounded).toBe(true);
    expect(body.perchedOnId).toBe('hours');
    expect(events).toEqual([
      { colliderId: 'hours', side: 'top', impactSpeed: 60 },
    ]);
  });

  it('picks the highest platform (smallest rect.y) when multiple stacked colliders are crossed', () => {
    const upper: Collider = {
      id: 'date',
      rect: { x: 200, y: 240, width: 160, height: 30 },
      kind: 'platform',
    };
    const lower: Collider = {
      id: 'hours',
      rect: { x: 200, y: 260, width: 160, height: 80 },
      kind: 'platform',
    };

    const body = makeBody({ x: 240, y: 195, vy: 100 });
    const prevY = body.y;
    body.y = 230; // bottom 235 -> 270 crosses both 240 and 260

    const events = resolveCollisions(body, body.x, prevY, [lower, upper], DEFAULT_PHYSICS_CONFIG);
    expect(body.y).toBe(240 - body.height);
    expect(events[0]?.colliderId).toBe('date');
  });

  it('allows jumping upward through platform colliders below highSpeedDeflect', () => {
    const body = makeBody({ x: 240, y: 340, vx: 0, vy: -300 });
    const prevX = body.x;
    const prevY = body.y;
    body.y = 320; // overlapping bottom/interior of hoursCollider at low speed (< 450)

    const events = resolveCollisions(body, prevX, prevY, [hoursCollider], DEFAULT_PHYSICS_CONFIG);
    expect(events).toEqual([]);
    expect(body.y).toBe(320);
    expect(body.vy).toBe(-300);
  });

  it('drops off platform when walking past edge or when perched collider disappears', () => {
    // Walking off right edge
    const walker = makeBody({
      x: 338,
      y: 260,
      vx: 200,
      vy: 0,
      grounded: true,
      perchedOnId: 'hours',
    });
    stepPhysics(walker, 0.05, DEFAULT_BOUNDS, [hoursCollider]);
    // After moving past x = 340, support is lost
    expect(walker.perchedOnId).toBeNull();
    expect(walker.grounded).toBe(false);

    // Collider disappears (e.g. #seconds hidden)
    const perched = makeBody({
      x: 400,
      y: 260,
      vx: 0,
      vy: 0,
      grounded: true,
      perchedOnId: 'seconds',
    });
    stepPhysics(perched, 0.016, DEFAULT_BOUNDS, [hoursCollider]);
    expect(perched.perchedOnId).toBeNull();
    expect(perched.grounded).toBe(false);
    expect(perched.vy).toBeGreaterThan(0);

    // Perched collider disappears and a slightly higher adjacent collider shifts in
    const shiftedMinutes: Collider = {
      id: 'minutes',
      rect: { x: 380, y: 299.5, width: 140, height: 80 },
      kind: 'platform',
    };
    const perchedOnSeconds = makeBody({
      x: 400,
      y: 260, // bottom = 300, 0.5px below shiftedMinutes.rect.y
      vx: 0,
      vy: 0,
      grounded: true,
      perchedOnId: 'seconds',
    });
    stepPhysics(perchedOnSeconds, 0.016, DEFAULT_BOUNDS, [shiftedMinutes]);
    expect(perchedOnSeconds.perchedOnId).toBeNull();
    expect(perchedOnSeconds.grounded).toBe(false);
    expect(perchedOnSeconds.y).toBeGreaterThan(260);
    expect(perchedOnSeconds.vy).toBeGreaterThan(0);
  });

  it('deflects off side and bottom faces at high speed (>= highSpeedDeflect)', () => {
    // Hit left face moving right at 700 px/s
    const sideHit = makeBody({ x: 155, y: 310, vx: 700, vy: 0 });
    const prevSideX = sideHit.x;
    const prevSideY = sideHit.y;
    sideHit.x = 175; // overlaps hoursCollider.rect.x (200)

    const sideEvents = resolveCollisions(
      sideHit,
      prevSideX,
      prevSideY,
      [hoursCollider],
      DEFAULT_PHYSICS_CONFIG,
    );
    expect(sideHit.x).toBe(200 - sideHit.width);
    expect(sideHit.vx).toBeCloseTo(-700 * DEFAULT_PHYSICS_CONFIG.bounceX, 6);
    expect(sideEvents).toEqual([
      { colliderId: 'hours', side: 'left', impactSpeed: 700 },
    ]);

    // Hit bottom face moving up at 600 px/s
    const bottomHit = makeBody({ x: 240, y: 385, vx: 0, vy: -600 });
    const prevBotX = bottomHit.x;
    const prevBotY = bottomHit.y;
    bottomHit.y = 370; // overlaps hoursCollider bottom (380)

    const bottomEvents = resolveCollisions(
      bottomHit,
      prevBotX,
      prevBotY,
      [hoursCollider],
      DEFAULT_PHYSICS_CONFIG,
    );
    expect(bottomHit.y).toBe(380);
    expect(bottomHit.vy).toBeCloseTo(600 * DEFAULT_PHYSICS_CONFIG.bounceY, 6);
    expect(bottomEvents).toEqual([
      { colliderId: 'hours', side: 'bottom', impactSpeed: 600 },
    ]);
  });
});

describe('Treat physics (F2)', () => {
  it('steps a treat under gravity, bounces on floor/platform, and settles to rest', () => {
    const treat = createTreatBody(250, 100, 40, 0, 16);
    const platform: Collider = {
      id: 'minutes',
      rect: { x: 200, y: 300, width: 150, height: 60 },
      kind: 'platform',
    };

    let landedOnPlatform = false;
    for (let i = 0; i < 200; i++) {
      const events = stepTreat(treat, 0.016, DEFAULT_BOUNDS, [platform], TREAT_PHYSICS_CONFIG);
      if (events.some((e) => e.colliderId === 'minutes' && e.side === 'top')) {
        landedOnPlatform = true;
      }
    }

    expect(landedOnPlatform).toBe(true);
    expect(treat.grounded).toBe(true);
    expect(treat.perchedOnId).toBe('minutes');
    expect(treat.vy).toBe(0);
    expect(treat.vx).toBe(0);
  });

  it('does nothing when treat is inactive', () => {
    const treat = createTreatBody(100, 100, 50, 50);
    treat.active = false;
    const events = stepTreat(treat, 0.016, DEFAULT_BOUNDS, []);
    expect(events).toEqual([]);
    expect(treat.x).toBe(100);
    expect(treat.y).toBe(100);
  });
});

describe('Adversarial & Boundary Cases — Physics Engine', () => {
  it('handles zero-size and negative bounds without NaN', () => {
    for (const badBounds of [{ width: 0, height: 0 }, { width: -50, height: -20 }]) {
      const body = makeBody({ x: 100, y: 100, vx: 200, vy: 200 });
      const events = stepPhysics(body, 0.016, badBounds, []);
      expect(body.x).toBe(0);
      expect(body.y).toBe(0);
      expect(body.vx).toBe(0);
      expect(body.vy).toBe(0);
      expect(body.grounded).toBe(true);
      expect(events).toEqual([]);
    }
  });

  it('guards NaN bounds in normalizeBounds and clamps cleanly', () => {
    const body = makeBody({ x: 100, y: 100, vx: 120, vy: 80 });
    const nanBounds: Bounds = {
      x: Number.NaN,
      y: Number.NaN,
      width: Number.NaN,
      height: Number.NaN,
    };
    const events = stepPhysics(body, 0.016, nanBounds, []);
    expect(body.x).toBe(0);
    expect(body.y).toBe(0);
    expect(body.vx).toBe(0);
    expect(body.vy).toBe(0);
    expect(body.grounded).toBe(true);
    expect(events).toEqual([]);
  });

  it('sanitizes non-finite body fields (NaN and Infinity) before stepping', () => {
    const body = makeBody({
      x: Number.NaN,
      y: Number.POSITIVE_INFINITY,
      vx: Number.NEGATIVE_INFINITY,
      vy: Number.NaN,
    });
    stepPhysics(body, 0.016, DEFAULT_BOUNDS, []);
    expect(Number.isFinite(body.x)).toBe(true);
    expect(Number.isFinite(body.y)).toBe(true);
    expect(Number.isFinite(body.vx)).toBe(true);
    expect(Number.isFinite(body.vy)).toBe(true);
  });

  it('respects non-zero origin Rect bounds', () => {
    const rectBounds: Bounds = { x: 100, y: 50, width: 400, height: 300 };
    const body = makeBody({ x: 90, y: 40, vx: -100, vy: -100 });
    const events = clampToBounds(body, rectBounds, DEFAULT_PHYSICS_CONFIG);
    expect(body.x).toBe(100);
    expect(body.y).toBe(50);
    expect(events).toEqual([
      { colliderId: null, side: 'left', impactSpeed: 100 },
      { colliderId: null, side: 'top', impactSpeed: 100 },
    ]);
  });

  it('triggers Pass 2 diagonal high-speed deflection when hypot(vx, vy) >= highSpeedDeflect', () => {
    const collider: Collider = {
      id: 'hours',
      rect: { x: 200, y: 300, width: 140, height: 80 },
      kind: 'platform',
    };
    const body = makeBody({ x: 155, y: 310, vx: 350, vy: -350 });
    const prevX = body.x;
    const prevY = body.y;
    body.x = 170;

    const events = resolveCollisions(body, prevX, prevY, [collider], DEFAULT_PHYSICS_CONFIG);
    expect(body.x).toBe(200 - body.width);
    expect(body.vx).toBeCloseTo(-350 * DEFAULT_PHYSICS_CONFIG.bounceX, 6);
    expect(events).toEqual([{ colliderId: 'hours', side: 'left', impactSpeed: 350 }]);
  });

  it('resolves Pass 2 via minimum-penetration fallback when body was already overlapping', () => {
    const collider: Collider = {
      id: 'hours',
      rect: { x: 200, y: 300, width: 140, height: 80 },
      kind: 'platform',
    };
    const body = makeBody({ x: 175, y: 320, vx: 500, vy: 0 });
    const events = resolveCollisions(body, 170, 320, [collider], DEFAULT_PHYSICS_CONFIG);
    expect(body.x).toBe(200 - body.width);
    expect(body.vx).toBeCloseTo(-500 * DEFAULT_PHYSICS_CONFIG.bounceX, 6);
    expect(events).toEqual([{ colliderId: 'hours', side: 'left', impactSpeed: 500 }]);
  });

  it('does not double-collide in Pass 2 on the same collider landed on in Pass 1 at high speed', () => {
    const collider: Collider = {
      id: 'hours',
      rect: { x: 200, y: 300, width: 140, height: 80 },
      kind: 'platform',
    };
    const body = makeBody({ x: 240, y: 255, vx: 0, vy: 600 });
    const prevY = body.y;
    body.y = 270;

    const events = resolveCollisions(body, body.x, prevY, [collider], DEFAULT_PHYSICS_CONFIG);
    expect(events).toEqual([{ colliderId: 'hours', side: 'top', impactSpeed: 600 }]);
  });

  it('un-perches and falls when perched collider shifts downward by > 2px', () => {
    const shifted: Collider = {
      id: 'hours',
      rect: { x: 200, y: 310, width: 140, height: 80 },
      kind: 'platform',
    };
    const body = makeBody({ x: 240, y: 260, vx: 0, vy: 0, grounded: true, perchedOnId: 'hours' });
    stepPhysics(body, 0.016, DEFAULT_BOUNDS, [shifted]);
    expect(body.perchedOnId).toBeNull();
    expect(body.grounded).toBe(false);
    expect(body.vy).toBeGreaterThan(0);
  });

  it('clears perchedOnId when jumping upward (vy < 0)', () => {
    const collider: Collider = {
      id: 'hours',
      rect: { x: 200, y: 300, width: 140, height: 80 },
      kind: 'platform',
    };
    const body = makeBody({ x: 240, y: 260, vx: 0, vy: -520, grounded: true, perchedOnId: 'hours' });
    stepPhysics(body, 0.016, DEFAULT_BOUNDS, [collider]);
    expect(body.perchedOnId).toBeNull();
    expect(body.grounded).toBe(false);
  });
});
