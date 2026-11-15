import { describe, it, expect } from 'vitest';
import {
  PetController,
  EAT_DURATION,
  HAPPY_DURATION,
  POST_EAT_HAPPY_DURATION,
  STARTLE_DURATION,
  STARTLE_IMPACT_SPEED,
  CHASE_SPEED,
  PATROL_SPEED,
} from '../../src/pet/fsm.ts';
import type { Collider, CollisionEvent, PetStepOptions, PhysicsBody } from '../../src/pet/types.ts';

function makeBody(overrides: Partial<PhysicsBody> = {}): PhysicsBody {
  return {
    x: 400,
    y: 650,
    vx: 0,
    vy: 0,
    width: 48,
    height: 48,
    grounded: true,
    perchedOnId: null,
    ...overrides,
  };
}

const DEFAULT_OPTS: PetStepOptions = {
  nightMode: false,
  reducedMotion: false,
  stageWidth: 1280,
  stageHeight: 720,
};

const CLOCK_COLLIDERS: Collider[] = [
  { id: 'hours', rect: { x: 300, y: 300, width: 140, height: 120 }, kind: 'platform' },
  { id: 'minutes', rect: { x: 500, y: 300, width: 140, height: 120 }, kind: 'platform' },
  { id: 'seconds', rect: { x: 660, y: 340, width: 70, height: 60 }, kind: 'platform' },
  { id: 'feed-pet', rect: { x: 580, y: 520, width: 90, height: 34 }, kind: 'control' },
];

describe('PetController FSM & Physics Integration', () => {
  it('starts in idle state with default stats and clamps dt safely', () => {
    const pet = new PetController({ random: () => 0.5 });
    const body = makeBody();

    // Negative and NaN dt should be clamped to 0 without throwing or corrupting stats
    const resNeg = pet.step(body, -1, [], [], null, DEFAULT_OPTS);
    expect(resNeg.snapshot.state).toBe('idle');
    expect(resNeg.snapshot.stateTimer).toBe(0);

    const resNaN = pet.step(body, Number.NaN, [], [], null, DEFAULT_OPTS);
    expect(resNaN.snapshot.stateTimer).toBe(0);

    // Large dt should be clamped to 0.05s
    const resHuge = pet.step(body, 10, [], [], null, DEFAULT_OPTS);
    expect(resHuge.snapshot.stateTimer).toBeCloseTo(0.05, 5);
  });

  it('transitions idle -> walking -> idle during autonomous patrol', () => {
    // random() = 0.6 -> aiTimer = 2.0 + 0.6 * 2.5 = 3.5s, walkTimer = 1.5 + 0.6 * 2.0 = 2.7s, no platform hop (0.6 >= 0.32)
    const pet = new PetController({ random: () => 0.6 });
    const body = makeBody();

    for (let i = 0; i < 72; i++) {
      pet.step(body, 0.05, CLOCK_COLLIDERS, [], null, DEFAULT_OPTS);
    }
    const walkSnap = pet.getSnapshot();
    expect(walkSnap.state).toBe('walking');

    const walkAction = pet.step(body, 0.05, CLOCK_COLLIDERS, [], null, DEFAULT_OPTS);
    expect(Math.abs(walkAction.targetVx ?? 0)).toBe(PATROL_SPEED);

    for (let i = 0; i < 60; i++) {
      pet.step(body, 0.05, CLOCK_COLLIDERS, [], null, DEFAULT_OPTS);
    }
    expect(pet.getSnapshot().state).toBe('idle');
  });

  it('flips facing on wall collision and platform edge during autonomous patrol', () => {
    const pet = new PetController({ initialState: 'walking', initialFacing: 'right', random: () => 0.9 });
    const body = makeBody({ x: 520, y: 252, grounded: true, perchedOnId: 'minutes' });

    // Approaching right edge of 'minutes' (x: 500, width: 140 -> right edge 640)
    body.x = 590; // 590 + 48 = 638 >= 640 - 4
    pet.step(body, 0.05, CLOCK_COLLIDERS, [], null, DEFAULT_OPTS);
    expect(pet.getSnapshot().facing).toBe('left');

    // Move away from right edge and test wall collision on left flips back to right
    body.x = 550;
    const wallHit: CollisionEvent = { colliderId: null, side: 'left', impactSpeed: 100 };
    pet.step(body, 0.05, CLOCK_COLLIDERS, [wallHit], null, DEFAULT_OPTS);
    expect(pet.getSnapshot().facing).toBe('right');
  });

  it('performs autonomous platform hop when random < 0.32 and reducedMotion is false', () => {
    const pet = new PetController({ random: () => 0.1 });
    const body = makeBody({ x: 350, y: 650, grounded: true });

    let jumped = false;
    for (let i = 0; i < 60; i++) {
      const action = pet.step(body, 0.05, CLOCK_COLLIDERS, [], null, DEFAULT_OPTS);
      if (action.snapshot.state === 'jumping') {
        expect(action.impulse).not.toBeNull();
        expect(action.impulse!.y).toBeLessThan(0);
        jumped = true;
        break;
      }
    }
    expect(jumped).toBe(true);
  });

  it('avoids unprompted platform hopping when reducedMotion is true', () => {
    const pet = new PetController({ random: () => 0.1 });
    const body = makeBody({ x: 350, y: 650, grounded: true });
    const reducedOpts: PetStepOptions = { ...DEFAULT_OPTS, reducedMotion: true };

    for (let i = 0; i < 60; i++) {
      const action = pet.step(body, 0.05, CLOCK_COLLIDERS, [], null, reducedOpts);
      expect(action.snapshot.state).not.toBe('jumping');
      expect(action.snapshot.squashX).toBe(1);
      expect(action.snapshot.squashY).toBe(1);
    }
  });

  it('chases treat on the ground, eats treat, and transitions eating -> happy -> idle', () => {
    const pet = new PetController({ random: () => 0.5 });
    const body = makeBody({ x: 100, y: 650, grounded: true });
    const treat = { x: 250, y: 660 };

    // Idle -> walking toward treat
    const chaseAction = pet.step(body, 0.05, [], [], treat, DEFAULT_OPTS);
    expect(chaseAction.snapshot.state).toBe('walking');
    expect(chaseAction.snapshot.facing).toBe('right');
    expect(chaseAction.targetVx).toBe(CHASE_SPEED);
    expect(chaseAction.consumedTreat).toBe(false);

    // Move pet close to treat -> consumes treat and enters eating
    body.x = 220;
    const eatAction = pet.step(body, 0.05, [], [], treat, DEFAULT_OPTS);
    expect(eatAction.consumedTreat).toBe(true);
    expect(eatAction.snapshot.state).toBe('eating');
    expect(eatAction.particles.some((p) => p.kind === 'crumb')).toBe(true);
    expect(eatAction.particles.some((p) => p.kind === 'heart')).toBe(true);

    // Advance through eating -> happy
    for (let i = 0; i < Math.ceil(EAT_DURATION / 0.05); i++) {
      pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    }
    expect(pet.getSnapshot().state).toBe('happy');

    // Advance through post-eat happy -> idle
    for (let i = 0; i < Math.ceil(POST_EAT_HAPPY_DURATION / 0.05) + 1; i++) {
      pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    }
    expect(pet.getSnapshot().state).toBe('idle');
  });

  it('handles startDrag -> dragged (suspendPhysics: true) -> endDrag -> falling -> perched', () => {
    const pet = new PetController({ random: () => 0.5 });
    const body = makeBody({ x: 520, y: 200, grounded: false });

    pet.dispatch({ type: 'startDrag' }, body);
    const dragAction = pet.step(body, 0.05, CLOCK_COLLIDERS, [], null, DEFAULT_OPTS);
    expect(dragAction.snapshot.state).toBe('dragged');
    expect(dragAction.suspendPhysics).toBe(true);

    pet.dispatch({ type: 'endDrag', releaseSpeed: 200 }, body);
    const fallAction = pet.step(body, 0.05, CLOCK_COLLIDERS, [], null, DEFAULT_OPTS);
    expect(fallAction.snapshot.state).toBe('falling');
    expect(fallAction.suspendPhysics).toBe(false);

    // Land on 'minutes' collider
    body.grounded = true;
    body.perchedOnId = 'minutes';
    body.vy = 0;
    const landAction = pet.step(
      body,
      0.05,
      CLOCK_COLLIDERS,
      [{ colliderId: 'minutes', side: 'top', impactSpeed: 250 }],
      null,
      DEFAULT_OPTS
    );
    expect(landAction.snapshot.state).toBe('perched');
    expect(landAction.snapshot.perchedOnId).toBe('minutes');
    expect(landAction.snapshot.squashX).toBeGreaterThan(1);
    expect(landAction.snapshot.squashY).toBeLessThan(1);
  });

  it('transitions perched -> falling when perched collider disappears (e.g. #seconds hidden)', () => {
    const pet = new PetController({ random: () => 0.5 });
    const body = makeBody({ x: 670, y: 292, grounded: true, perchedOnId: 'seconds' });

    // Start falling then land on 'seconds'
    pet.dispatch({ type: 'endDrag' }, body);
    pet.step(body, 0.05, CLOCK_COLLIDERS, [], null, DEFAULT_OPTS);
    expect(pet.getSnapshot().state).toBe('perched');

    // Now remove 'seconds' from colliders
    const withoutSeconds = CLOCK_COLLIDERS.filter((c) => c.id !== 'seconds');
    const dropAction = pet.step(body, 0.05, withoutSeconds, [], null, DEFAULT_OPTS);
    expect(dropAction.snapshot.state).toBe('falling');
    expect(dropAction.snapshot.perchedOnId).toBeNull();
  });

  it('transitions to startled on high-speed impact and recovers after STARTLE_DURATION', () => {
    const pet = new PetController({ initialState: 'falling', random: () => 0.5 });
    const body = makeBody({ grounded: true, perchedOnId: null });

    const impactAction = pet.step(
      body,
      0.05,
      [],
      [{ colliderId: null, side: 'top', impactSpeed: STARTLE_IMPACT_SPEED + 50 }],
      null,
      DEFAULT_OPTS
    );
    expect(impactAction.snapshot.state).toBe('startled');

    for (let i = 0; i < Math.ceil(STARTLE_DURATION / 0.05) + 1; i++) {
      pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    }
    expect(pet.getSnapshot().state).toBe('idle');
  });

  it('handles jump command -> jumping -> falling -> idle', () => {
    const pet = new PetController({ random: () => 0.5 });
    const body = makeBody({ grounded: true });

    pet.dispatch({ type: 'jump', direction: 1 }, body);
    const jumpAction = pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    expect(jumpAction.snapshot.state).toBe('jumping');
    expect(jumpAction.snapshot.facing).toBe('right');
    expect(jumpAction.impulse).not.toBeNull();
    expect(jumpAction.impulse!.y).toBeLessThan(0);

    // Simulate apex -> downward velocity
    body.grounded = false;
    body.vy = 50;
    const fallAction = pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    expect(fallAction.snapshot.state).toBe('falling');

    // Land
    body.grounded = true;
    body.vy = 0;
    const landAction = pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    expect(landAction.snapshot.state).toBe('idle');
  });

  it('handles pet command -> happy with heart particles and reducedMotion particle cap', () => {
    const pet = new PetController({ random: () => 0.5 });
    const body = makeBody({ grounded: true });

    pet.dispatch({ type: 'pet' }, body);
    const action = pet.step(body, 0.05, [], [], null, { ...DEFAULT_OPTS, reducedMotion: true });
    expect(action.snapshot.state).toBe('happy');
    expect(action.particles).toHaveLength(1);
    expect(action.particles[0].kind).toBe('heart');
    expect(action.particles[0].count).toBe(1);
    expect(action.impulse).toBeNull(); // pet hop skipped in reducedMotion

    for (let i = 0; i < Math.ceil(HAPPY_DURATION / 0.05) + 1; i++) {
      pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    }
    expect(pet.getSnapshot().state).toBe('idle');
  });

  it('jumps toward an elevated treat (treat.y < body.y - 28) and handles treat disappearing mid-chase', () => {
    const pet = new PetController({ random: () => 0.5 });
    const body = makeBody({ x: 200, y: 650, grounded: true });
    const elevatedTreat = { x: 260, y: 550 };

    const jumpAction = pet.step(body, 0.05, [], [], elevatedTreat, DEFAULT_OPTS);
    expect(jumpAction.snapshot.state).toBe('jumping');
    expect(jumpAction.impulse).not.toBeNull();
    expect(jumpAction.impulse!.y).toBeLessThan(0);

    // Treat disappears mid-air
    body.grounded = false;
    body.vy = 20;
    const fallAction = pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    expect(fallAction.snapshot.state).toBe('falling');
  });

  it('enters falling on endDrag when releaseSpeed >= STARTLE_IMPACT_SPEED even if grounded', () => {
    const pet = new PetController();
    const body = makeBody({ grounded: true });
    pet.dispatch({ type: 'startDrag' }, body);
    pet.dispatch({ type: 'endDrag', releaseSpeed: STARTLE_IMPACT_SPEED }, body);
    expect(pet.getSnapshot().state).toBe('falling');
  });

  it('scales jump impulse under reducedMotion and flips facing at stageWidth bounds', () => {
    const pet = new PetController({ initialState: 'walking', initialFacing: 'left' });
    const body = makeBody({ x: 2, y: 650, grounded: true });
    const walkAction = pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    expect(walkAction.snapshot.facing).toBe('right');

    pet.dispatch({ type: 'jump', direction: 1 }, body);
    const jumpAction = pet.step(body, 0.05, [], [], null, { ...DEFAULT_OPTS, reducedMotion: true });
    expect(jumpAction.impulse).toEqual({ x: 84, y: -320 });
  });

  it('performs autonomous platform hop from perched when colliders.length > 1 and random < 0.45', () => {
    const pet = new PetController({ initialState: 'perched', random: () => 0.1 });
    const body = makeBody({ x: 670, y: 292, grounded: true, perchedOnId: 'seconds' });
    let hopped = false;
    for (let i = 0; i < 100; i++) {
      const action = pet.step(body, 0.05, CLOCK_COLLIDERS, [], null, DEFAULT_OPTS);
      if (action.snapshot.state === 'jumping') {
        hopped = true;
        expect(action.impulse!.y).toBeLessThan(0);
        break;
      }
    }
    expect(hopped).toBe(true);
  });

  it('ignores pet command while dragged', () => {
    const pet = new PetController();
    const body = makeBody({ grounded: false });
    pet.dispatch({ type: 'startDrag' }, body);
    pet.dispatch({ type: 'pet' }, body);
    const action = pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    expect(action.snapshot.state).toBe('dragged');
    expect(action.suspendPhysics).toBe(true);
    expect(action.particles).toEqual([]);
  });

  it('prevents double-jump impulse stacking in a single frame', () => {
    const pet = new PetController();
    const body = makeBody({ grounded: true });
    pet.dispatch({ type: 'jump', direction: 1 }, body);
    pet.dispatch({ type: 'jump', direction: 1 }, body);
    const action = pet.step(body, 0.05, [], [], null, DEFAULT_OPTS);
    expect(action.snapshot.state).toBe('jumping');
    expect(action.impulse).toEqual({ x: 140, y: -520 });
  });

  it('clamps NaN in initialStats to 0 instead of poisoning stats', () => {
    const pet = new PetController({
      initialStats: {
        energy: Number.NaN,
        happiness: Number.NaN,
        fullness: Number.NaN,
      },
    });
    const stats = pet.getStats();
    expect(stats.energy).toBe(0);
    expect(stats.happiness).toBe(0);
    expect(stats.fullness).toBe(0);
    expect(pet.getSnapshot().isDrowsy).toBe(true);
  });
});
