import { describe, it, expect } from 'vitest';
import { PetController } from '../../src/pet/fsm.ts';
import type { Collider, PetStepOptions, PhysicsBody } from '../../src/pet/types.ts';

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

const OPTS: PetStepOptions = {
  nightMode: false,
  reducedMotion: false,
};

const COLLIDERS: Collider[] = [
  { id: 'minutes', rect: { x: 500, y: 300, width: 140, height: 120 }, kind: 'platform' },
];

describe('PetController Time-Driven Clock Reactions', () => {
  it('triggers celebratory hop, happy state, sparkle particles, and +5 happiness on hour tick', () => {
    const pet = new PetController({ initialStats: { happiness: 70 } });
    const body = makeBody();

    pet.onTimeEvent({ type: 'hour', hours: 12, minutes: 0, seconds: 0 }, body, { reducedMotion: false });
    const action = pet.step(body, 0.05, [], [], null, OPTS);

    expect(action.snapshot.state).toBe('happy');
    expect(action.snapshot.stats.happiness).toBeCloseTo(75, 0);
    expect(action.impulse).toEqual({ x: 0, y: -460 });
    expect(action.particles).toHaveLength(1);
    expect(action.particles[0].kind).toBe('sparkle');
    expect(action.particles[0].count).toBe(5);
  });

  it('scales down hour impulse and caps sparkles to 1 when reducedMotion is true', () => {
    const pet = new PetController({ initialStats: { happiness: 70 } });
    const body = makeBody();

    pet.onTimeEvent({ type: 'hour', hours: 12, minutes: 0, seconds: 0 }, body, { reducedMotion: true });
    const action = pet.step(body, 0.05, [], [], null, { ...OPTS, reducedMotion: true });

    expect(action.impulse).toEqual({ x: 0, y: -200 });
    expect(action.particles[0].count).toBe(1);
    expect(action.snapshot.squashX).toBe(1);
    expect(action.snapshot.squashY).toBe(1);
  });

  it('ignores hour and second ticks when sleeping or dragged', () => {
    const sleepingPet = new PetController({ initialState: 'sleeping', initialStats: { happiness: 50 } });
    const body = makeBody();

    sleepingPet.onTimeEvent({ type: 'hour', hours: 1, minutes: 0, seconds: 0 }, body);
    sleepingPet.onTimeEvent({ type: 'second', hours: 1, minutes: 0, seconds: 1 }, body);
    const sleepAction = sleepingPet.step(body, 0.05, [], [], null, OPTS);
    expect(sleepAction.snapshot.state).toBe('sleeping');
    expect(sleepAction.snapshot.secondPulse).toBe(false);
    expect(sleepAction.impulse).toBeNull();

    const draggedPet = new PetController({ initialState: 'dragged' });
    draggedPet.onTimeEvent({ type: 'hour', hours: 1, minutes: 0, seconds: 0 }, body);
    draggedPet.onTimeEvent({ type: 'second', hours: 1, minutes: 0, seconds: 1 }, body);
    const dragAction = draggedPet.step(body, 0.05, [], [], null, OPTS);
    expect(dragAction.snapshot.state).toBe('dragged');
    expect(dragAction.snapshot.secondPulse).toBe(false);
    expect(dragAction.impulse).toBeNull();
  });

  it('bumps perched pet into startled state with sparkle particles on minute tick', () => {
    const pet = new PetController({ initialState: 'perched', initialFacing: 'right' });
    const body = makeBody({ x: 520, y: 252, grounded: true, perchedOnId: 'minutes' });

    pet.onTimeEvent({ type: 'minute', hours: 12, minutes: 35, seconds: 0 }, body, { reducedMotion: false });
    const action = pet.step(body, 0.05, COLLIDERS, [], null, OPTS);

    expect(action.snapshot.state).toBe('startled');
    expect(action.impulse).toEqual({ x: 90, y: -240 });
    expect(action.particles.some((p) => p.kind === 'sparkle' && p.count === 2)).toBe(true);
  });

  it('does not bump pet on minute tick when not perched', () => {
    const pet = new PetController({ initialState: 'idle' });
    const body = makeBody();

    pet.onTimeEvent({ type: 'minute', hours: 12, minutes: 35, seconds: 0 }, body);
    const action = pet.step(body, 0.05, COLLIDERS, [], null, OPTS);

    expect(action.snapshot.state).toBe('idle');
    expect(action.impulse).toBeNull();
  });

  it('toggles secondPulse on second ticks when awake with zero physics impulse', () => {
    const pet = new PetController({ initialState: 'idle' });
    const body = makeBody();

    expect(pet.getSnapshot().secondPulse).toBe(false);
    pet.onTimeEvent({ type: 'second', hours: 12, minutes: 0, seconds: 1 }, body);
    const a1 = pet.step(body, 0.05, [], [], null, OPTS);
    expect(a1.snapshot.secondPulse).toBe(true);
    expect(a1.impulse).toBeNull();

    pet.onTimeEvent({ type: 'second', hours: 12, minutes: 0, seconds: 2 }, body);
    const a2 = pet.step(body, 0.05, [], [], null, OPTS);
    expect(a2.snapshot.secondPulse).toBe(false);
    expect(a2.impulse).toBeNull();
  });

  it('scales minute tick impulse/sparkles under reducedMotion and respects left facing', () => {
    const pet = new PetController({ initialState: 'perched', initialFacing: 'left' });
    const body = makeBody({ x: 520, y: 252, grounded: true, perchedOnId: 'minutes' });
    pet.onTimeEvent({ type: 'minute', hours: 12, minutes: 35, seconds: 0 }, body, { reducedMotion: true });
    const action = pet.step(body, 0.05, COLLIDERS, [], null, { ...OPTS, reducedMotion: true });
    expect(action.snapshot.state).toBe('startled');
    expect(action.impulse).toEqual({ x: -30, y: -100 });
    expect(action.particles[0].count).toBe(1);
  });
});
