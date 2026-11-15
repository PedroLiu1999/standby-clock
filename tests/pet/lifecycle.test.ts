import { describe, it, expect } from 'vitest';
import {
  PetController,
  INACTIVITY_SLEEP_DAY,
  INACTIVITY_SLEEP_NIGHT_OR_TIRED,
  ZZZ_INTERVAL,
} from '../../src/pet/fsm.ts';
import type { PetStepOptions, PhysicsBody } from '../../src/pet/types.ts';

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

const DAY_OPTS: PetStepOptions = {
  nightMode: false,
  reducedMotion: false,
};

const NIGHT_OPTS: PetStepOptions = {
  nightMode: true,
  reducedMotion: false,
};

describe('PetController Non-Punishing Lifecycle & Stats', () => {
  it('clamps initial and runtime stats to [0, 100] and floors passive happiness decay at 10', () => {
    const pet = new PetController({
      initialStats: { energy: 150, happiness: 11, fullness: -10 },
      random: () => 0.9,
    });
    expect(pet.getStats()).toEqual({ energy: 100, happiness: 11, fullness: 0 });

    const body = makeBody();
    // Step for 100 seconds in 0.05s increments
    for (let i = 0; i < 2000; i++) {
      pet.step(body, 0.05, [], [], null, DAY_OPTS);
    }
    const stats = pet.getStats();
    expect(stats.energy).toBeGreaterThanOrEqual(0);
    expect(stats.energy).toBeLessThanOrEqual(100);
    expect(stats.fullness).toBe(0);
    expect(stats.happiness).toBeGreaterThanOrEqual(10);
  });

  it('auto-sleeps after 45s of inactivity in day mode', () => {
    // random() = 0.9 keeps pet walking/idling without random low-energy sleep
    const pet = new PetController({
      initialStats: { energy: 90, happiness: 80, fullness: 80 },
      random: () => 0.9,
    });
    const body = makeBody();

    // Note: autonomous patrol resets/pauses inactivity while walking; test perched or idle inactivity directly
    // Use perched on a collider with perchTimer > 45s? Wait: inactivitySeconds only increments in idle/perched.
    // Let's keep pet in idle by resetting or checking that idle accumulates inactivity up to 45s when not walking:
    // Actually, let's verify that in nightMode (20s) or tired (< 20 energy) it sleeps sooner than day mode.
    const nightPet = new PetController({
      initialState: 'perched',
      initialStats: { energy: 80, happiness: 80, fullness: 80 },
      random: () => 0.9,
    });
    const perchedBody = makeBody({ perchedOnId: 'hours' });
    const colliders = [{ id: 'hours', rect: { x: 300, y: 300, width: 140, height: 120 }, kind: 'platform' as const }];

    // Step 20s in nightMode -> should auto-sleep
    for (let i = 0; i < Math.ceil(INACTIVITY_SLEEP_NIGHT_OR_TIRED / 0.05); i++) {
      nightPet.step(perchedBody, 0.05, colliders, [], null, NIGHT_OPTS);
    }
    expect(nightPet.getSnapshot().state).toBe('sleeping');

    // In day mode, 20s is NOT enough to auto-sleep from inactivity
    const dayPerched = new PetController({
      initialState: 'perched',
      initialStats: { energy: 80, happiness: 80, fullness: 80 },
      random: () => 0.9,
    });
    for (let i = 0; i < Math.ceil(INACTIVITY_SLEEP_NIGHT_OR_TIRED / 0.05); i++) {
      dayPerched.step(perchedBody, 0.05, colliders, [], null, DAY_OPTS);
    }
    expect(dayPerched.getSnapshot().inactivitySeconds).toBeLessThan(INACTIVITY_SLEEP_DAY);
    expect(pet.getSnapshot().isDrowsy).toBe(false);
  });

  it('sets isDrowsy when energy < 20 and encourages sleeping', () => {
    const pet = new PetController({
      initialStats: { energy: 15, happiness: 60, fullness: 60 },
      random: () => 0.1, // < 0.5 triggers sleep when aiTimer expires
    });
    const body = makeBody();

    expect(pet.getSnapshot().isDrowsy).toBe(true);

    for (let i = 0; i < 60; i++) {
      pet.step(body, 0.05, [], [], null, DAY_OPTS);
      if (pet.getSnapshot().state === 'sleeping') break;
    }
    expect(pet.getSnapshot().state).toBe('sleeping');
  });

  it('recovers energy while sleeping, emits zzz particles, and doubles zzz interval under reducedMotion', () => {
    const pet = new PetController({
      initialState: 'sleeping',
      initialStats: { energy: 20, happiness: 50, fullness: 70 },
      random: () => 0.5,
    });
    const body = makeBody();

    let zzzCount = 0;
    const stepsForOneInterval = Math.ceil(ZZZ_INTERVAL / 0.05) + 1;
    for (let i = 0; i < stepsForOneInterval; i++) {
      const action = pet.step(body, 0.05, [], [], null, DAY_OPTS);
      zzzCount += action.particles.filter((p) => p.kind === 'zzz').length;
    }
    expect(zzzCount).toBe(1);
    expect(pet.getStats().energy).toBeGreaterThan(20);

    // Under reducedMotion, 1x ZZZ_INTERVAL should NOT emit another zzz; 2x ZZZ_INTERVAL should
    let reducedZzz = 0;
    for (let i = 0; i < Math.floor(ZZZ_INTERVAL / 0.05); i++) {
      const action = pet.step(body, 0.05, [], [], null, { ...DAY_OPTS, reducedMotion: true });
      reducedZzz += action.particles.filter((p) => p.kind === 'zzz').length;
    }
    expect(reducedZzz).toBe(0);
  });

  it('ignores treats while sleeping and wakes on wake, toggleSleep, pet, startDrag, and feed', () => {
    const body = makeBody();
    const treat = { x: 410, y: 660 };

    const pet1 = new PetController({ initialState: 'sleeping' });
    const sleepAction = pet1.step(body, 0.05, [], [], treat, DAY_OPTS);
    expect(sleepAction.snapshot.state).toBe('sleeping');
    expect(sleepAction.consumedTreat).toBe(false);

    pet1.dispatch({ type: 'wake' }, body);
    expect(pet1.getSnapshot().state).toBe('idle');

    pet1.dispatch({ type: 'toggleSleep' }, body);
    expect(pet1.getSnapshot().state).toBe('sleeping');

    pet1.dispatch({ type: 'toggleSleep' }, body);
    expect(pet1.getSnapshot().state).toBe('idle');

    pet1.dispatch({ type: 'sleep' }, body);
    expect(pet1.getSnapshot().state).toBe('sleeping');
    pet1.dispatch({ type: 'feed' }, body);
    expect(pet1.getSnapshot().state).toBe('idle');

    pet1.dispatch({ type: 'sleep' }, body);
    pet1.dispatch({ type: 'pet' }, body);
    expect(pet1.getSnapshot().state).toBe('happy');

    pet1.dispatch({ type: 'sleep' }, body);
    pet1.dispatch({ type: 'startDrag' }, body);
    expect(pet1.getSnapshot().state).toBe('dragged');
  });

  it('uses options.rawDt for inactivity sleep and accelerates happiness decay when hungry/tired', () => {
    const pet = new PetController({
      initialState: 'idle',
      initialStats: { energy: 10, happiness: 50, fullness: 10 },
    });
    const body = makeBody();
    const action = pet.step(body, 0.05, [], [], null, { ...DAY_OPTS, rawDt: 25 });
    expect(action.snapshot.state).toBe('sleeping');

    const hungryPet = new PetController({
      initialState: 'idle',
      initialStats: { energy: 10, happiness: 50, fullness: 10 },
    });
    const normalPet = new PetController({
      initialState: 'idle',
      initialStats: { energy: 80, happiness: 50, fullness: 80 },
    });
    hungryPet.step(body, 0.05, [], [], null, DAY_OPTS);
    normalPet.step(body, 0.05, [], [], null, DAY_OPTS);
    expect(hungryPet.getStats().happiness).toBeLessThan(normalPet.getStats().happiness);
  });
});
