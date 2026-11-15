import type {
  Bounds,
  Collider,
  CollisionEvent,
  PhysicsBody,
  PhysicsConfig,
  Rect,
  TreatBody,
} from './types';

export const MAX_DT = 0.05;

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: 1500,
  bounceY: 0.4,
  bounceX: 0.5,
  groundFriction: 10,
  airDrag: 0.5,
  restSnapVy: 45,
  highSpeedDeflect: 450,
  maxThrowSpeed: 1600,
};

export const TREAT_PHYSICS_CONFIG: PhysicsConfig = {
  ...DEFAULT_PHYSICS_CONFIG,
  bounceY: 0.55,
  groundFriction: 6,
  restSnapVy: 35,
};

function normalizeBounds(bounds: Bounds): Rect {
  const x = 'x' in bounds && Number.isFinite(bounds.x) ? bounds.x : 0;
  const y = 'y' in bounds && Number.isFinite(bounds.y) ? bounds.y : 0;
  const width = Number.isFinite(bounds.width) ? Math.max(0, bounds.width) : 0;
  const height = Number.isFinite(bounds.height) ? Math.max(0, bounds.height) : 0;
  return { x, y, width, height };
}

/**
 * Advances a PhysicsBody by `dt` seconds (clamped to `MAX_DT = 0.05s`),
 * mutating `body` in-place and returning any `CollisionEvent`s that occurred.
 */
export function stepPhysics(
  body: PhysicsBody,
  dt: number,
  bounds: Bounds,
  colliders: readonly Collider[],
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG,
): CollisionEvent[] {
  if (!Number.isFinite(dt) || dt <= 0) {
    return [];
  }

  if (!Number.isFinite(body.x)) body.x = 0;
  if (!Number.isFinite(body.y)) body.y = 0;
  if (!Number.isFinite(body.vx)) body.vx = 0;
  if (!Number.isFinite(body.vy)) body.vy = 0;

  const clampedDt = Math.min(dt, MAX_DT);
  const boundsRect = normalizeBounds(bounds);
  const maxY = boundsRect.y + boundsRect.height;

  // Validate perched/grounded support before applying gravity & integration
  let lostPerchedSupport = false;
  if (body.perchedOnId !== null) {
    const support = colliders.find((c) => c.id === body.perchedOnId);
    const hasOverlap =
      support !== undefined &&
      body.x + body.width > support.rect.x &&
      body.x < support.rect.x + support.rect.width;

    if (
      support &&
      hasOverlap &&
      body.vy >= 0 &&
      Math.abs(body.y + body.height - support.rect.y) <= 2
    ) {
      body.y = support.rect.y - body.height;
      body.grounded = true;
    } else {
      lostPerchedSupport = support === undefined;
      body.perchedOnId = null;
      body.grounded = false;
    }
  } else if (body.grounded) {
    if (body.vy < 0 || body.y + body.height < maxY - 0.5) {
      body.grounded = false;
    }
  }

  // Apply gravity when airborne
  if (!body.grounded) {
    body.vy += config.gravity * clampedDt;
  }

  // Integrate position
  const prevX = body.x;
  const prevY = body.y;
  body.x += body.vx * clampedDt;
  body.y += body.vy * clampedDt;

  // Apply frame-rate independent exponential damping
  if (body.grounded) {
    body.vx *= Math.exp(-config.groundFriction * clampedDt);
    if (Math.abs(body.vx) < 1) {
      body.vx = 0;
    }
  } else {
    const drag = Math.exp(-config.airDrag * clampedDt);
    body.vx *= drag;
    body.vy *= drag;
  }

  const colliderEvents = resolveCollisions(
    body,
    prevX,
    prevY,
    colliders,
    config,
    lostPerchedSupport ? 0 : 1,
  );
  const boundEvents = clampToBounds(body, boundsRect, config);

  return colliderEvents.concat(boundEvents);
}

/**
 * Resolves one-way top-surface platform landings and high-speed side/bottom
 * deflections against `colliders`, mutating `body` in-place.
 */
export function resolveCollisions(
  body: PhysicsBody,
  prevX: number,
  prevY: number,
  colliders: readonly Collider[],
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG,
  stepUpTolerance = 1,
): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  let landedColliderId: string | null = null;

  // Pass 1: One-way top-surface platform landing (when moving downward or flat)
  if (body.vy >= 0) {
    const prevBottom = prevY + body.height;
    const newBottom = body.y + body.height;

    let bestLanding: Collider | null = null;
    for (const c of colliders) {
      const overlapsX =
        body.x + body.width > c.rect.x && body.x < c.rect.x + c.rect.width;
      if (!overlapsX) continue;

      if (prevBottom <= c.rect.y + stepUpTolerance && newBottom >= c.rect.y) {
        if (bestLanding === null || c.rect.y < bestLanding.rect.y) {
          bestLanding = c;
        }
      }
    }

    if (bestLanding !== null) {
      const impactSpeed = Math.abs(body.vy);
      body.y = bestLanding.rect.y - body.height;
      landedColliderId = bestLanding.id;

      const bouncedVy = -impactSpeed * config.bounceY;
      if (
        impactSpeed < config.restSnapVy ||
        Math.abs(bouncedVy) < config.restSnapVy
      ) {
        body.vy = 0;
        body.grounded = true;
        body.perchedOnId = bestLanding.id;
      } else {
        body.vy = bouncedVy;
        body.grounded = false;
        body.perchedOnId = null;
      }

      if (impactSpeed > 0) {
        events.push({
          colliderId: bestLanding.id,
          side: 'top',
          impactSpeed,
        });
      }
    } else if (body.perchedOnId !== null) {
      // Walked off the edge of the perched collider during this step
      body.perchedOnId = null;
      body.grounded = false;
    }
  } else if (body.perchedOnId !== null) {
    body.perchedOnId = null;
    body.grounded = false;
  }

  // Pass 2: High-speed side/bottom deflection
  const speed = Math.hypot(body.vx, body.vy);
  if (speed >= config.highSpeedDeflect) {
    for (const c of colliders) {
      if (c.id === landedColliderId || c.id === body.perchedOnId) {
        continue;
      }

      const overlapLeft = body.x + body.width - c.rect.x;
      const overlapRight = c.rect.x + c.rect.width - body.x;
      const overlapTop = body.y + body.height - c.rect.y;
      const overlapBottom = c.rect.y + c.rect.height - body.y;

      if (
        overlapLeft <= 0 ||
        overlapRight <= 0 ||
        overlapTop <= 0 ||
        overlapBottom <= 0
      ) {
        continue;
      }

      if (prevX + body.width <= c.rect.x && body.vx > 0) {
        const impactSpeed = Math.abs(body.vx);
        body.x = c.rect.x - body.width;
        body.vx = -impactSpeed * config.bounceX;
        events.push({ colliderId: c.id, side: 'left', impactSpeed });
      } else if (prevX >= c.rect.x + c.rect.width && body.vx < 0) {
        const impactSpeed = Math.abs(body.vx);
        body.x = c.rect.x + c.rect.width;
        body.vx = impactSpeed * config.bounceX;
        events.push({ colliderId: c.id, side: 'right', impactSpeed });
      } else if (prevY >= c.rect.y + c.rect.height && body.vy < 0) {
        const impactSpeed = Math.abs(body.vy);
        body.y = c.rect.y + c.rect.height;
        body.vy = impactSpeed * config.bounceY;
        events.push({ colliderId: c.id, side: 'bottom', impactSpeed });
      } else {
        // Fallback: resolve along minimum penetration axis
        const minOverlapX = Math.min(overlapLeft, overlapRight);
        const minOverlapY = Math.min(overlapTop, overlapBottom);

        if (minOverlapX < minOverlapY) {
          if (overlapLeft < overlapRight) {
            const impactSpeed = Math.abs(body.vx);
            body.x = c.rect.x - body.width;
            if (body.vx > 0) {
              body.vx = -impactSpeed * config.bounceX;
            }
            if (impactSpeed > 0) {
              events.push({ colliderId: c.id, side: 'left', impactSpeed });
            }
          } else {
            const impactSpeed = Math.abs(body.vx);
            body.x = c.rect.x + c.rect.width;
            if (body.vx < 0) {
              body.vx = impactSpeed * config.bounceX;
            }
            if (impactSpeed > 0) {
              events.push({ colliderId: c.id, side: 'right', impactSpeed });
            }
          }
        } else {
          if (overlapBottom <= overlapTop) {
            const impactSpeed = Math.abs(body.vy);
            body.y = c.rect.y + c.rect.height;
            if (body.vy < 0) {
              body.vy = impactSpeed * config.bounceY;
            }
            if (impactSpeed > 0) {
              events.push({ colliderId: c.id, side: 'bottom', impactSpeed });
            }
          } else {
            const impactSpeed = Math.abs(body.vy);
            body.y = c.rect.y - body.height;
            if (body.vy > 0) {
              body.vy = -impactSpeed * config.bounceY;
            }
            if (impactSpeed > 0) {
              events.push({ colliderId: c.id, side: 'top', impactSpeed });
            }
          }
        }
      }
    }
  }

  return events;
}

/**
 * Clamps `body` within `bounds` (stage/viewport), applying bounce restitution
 * and floor rest-snapping, mutating `body` in-place.
 */
export function clampToBounds(
  body: PhysicsBody,
  bounds: Bounds,
  config: PhysicsConfig = DEFAULT_PHYSICS_CONFIG,
): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const rect = normalizeBounds(bounds);
  const minX = rect.x;
  const minY = rect.y;
  const maxX = rect.x + rect.width;
  const maxY = rect.y + rect.height;

  // Horizontal bounds
  if (rect.width < body.width) {
    body.x = minX;
    body.vx = 0;
  } else if (body.x < minX) {
    const impactSpeed = Math.abs(body.vx);
    body.x = minX;
    if (body.vx < 0) {
      body.vx = -body.vx * config.bounceX;
    }
    if (impactSpeed > 0) {
      events.push({ colliderId: null, side: 'left', impactSpeed });
    }
  } else if (body.x + body.width > maxX) {
    const impactSpeed = Math.abs(body.vx);
    body.x = maxX - body.width;
    if (body.vx > 0) {
      body.vx = -body.vx * config.bounceX;
    }
    if (impactSpeed > 0) {
      events.push({ colliderId: null, side: 'right', impactSpeed });
    }
  }

  // Vertical bounds
  if (rect.height < body.height) {
    body.y = minY;
    body.vy = 0;
    body.grounded = true;
    body.perchedOnId = null;
  } else {
    if (body.y < minY) {
      const impactSpeed = Math.abs(body.vy);
      body.y = minY;
      if (body.vy < 0) {
        body.vy = -body.vy * config.bounceY;
      }
      if (impactSpeed > 0) {
        events.push({ colliderId: null, side: 'top', impactSpeed });
      }
    }

    if (body.y + body.height >= maxY) {
      const impactSpeed = Math.abs(body.vy);
      body.y = maxY - body.height;
      body.perchedOnId = null;

      if (body.vy > 0) {
        const bouncedVy = -impactSpeed * config.bounceY;
        if (
          impactSpeed < config.restSnapVy ||
          Math.abs(bouncedVy) < config.restSnapVy
        ) {
          body.vy = 0;
          body.grounded = true;
        } else {
          body.vy = bouncedVy;
          body.grounded = false;
        }
        events.push({ colliderId: null, side: 'bottom', impactSpeed });
      } else if (body.vy === 0) {
        body.grounded = true;
      }
    }
  }

  return events;
}

/**
 * Creates a treat PhysicsBody for feeding interactions.
 */
export function createTreatBody(
  x: number,
  y: number,
  vx = 0,
  vy = 0,
  size = 16,
): TreatBody {
  return {
    x,
    y,
    vx,
    vy,
    width: size,
    height: size,
    grounded: false,
    perchedOnId: null,
    active: true,
  };
}

/**
 * Steps an active treat body using `TREAT_PHYSICS_CONFIG` by default.
 */
export function stepTreat(
  treat: TreatBody,
  dt: number,
  bounds: Bounds,
  colliders: readonly Collider[],
  config: PhysicsConfig = TREAT_PHYSICS_CONFIG,
): CollisionEvent[] {
  if (!treat.active) {
    return [];
  }
  return stepPhysics(treat, dt, bounds, colliders, config);
}
