import type { Collider, CollisionEvent, PhysicsBody, Vec2 } from '../physics/types.ts';

export type PetState =
  | 'idle'
  | 'walking'
  | 'jumping'
  | 'falling'
  | 'dragged'
  | 'perched'
  | 'sleeping'
  | 'eating'
  | 'happy'
  | 'startled';

export type PetFacing = 'left' | 'right';

export interface PetStats {
  energy: number;    // 0..100
  happiness: number; // 0..100
  fullness: number;  // 0..100
}

export interface TimeEvent {
  type: 'minute' | 'hour' | 'second';
  hours: number;
  minutes: number;
  seconds: number;
}

export type ParticleKind = 'heart' | 'zzz' | 'sparkle' | 'crumb';

export interface ParticleTrigger {
  kind: ParticleKind;
  /** Stage-relative spawn coordinates (typically near pet head/mouth) */
  x: number;
  y: number;
  count: number;
}

export interface TreatTarget {
  x: number;
  y: number;
}

export interface PetStepOptions {
  nightMode: boolean;
  reducedMotion: boolean;
  /** Optional stage dimensions for autonomous patrol bounds (defaults to 1280x720 if omitted) */
  stageWidth?: number;
  stageHeight?: number;
  /** Optional unclamped elapsed time (seconds) for inactivity timers */
  rawDt?: number;
}

export type PetCommand =
  | { type: 'pet' }
  | { type: 'startDrag' }
  | { type: 'endDrag'; releaseSpeed?: number }
  | { type: 'wake' }
  | { type: 'sleep' }
  | { type: 'toggleSleep' }
  | { type: 'feed' }
  | { type: 'jump'; direction?: -1 | 0 | 1 }
  | { type: 'move'; direction: -1 | 1 }
  | { type: 'setFacing'; facing: PetFacing };

export interface PetSnapshot {
  state: PetState;
  facing: PetFacing;
  stats: PetStats;
  stateTimer: number;
  perchedOnId: string | null;
  inactivitySeconds: number;
  /** Visual squash-and-stretch scale factors (always 1, 1 when reducedMotion is true) */
  squashX: number;
  squashY: number;
  /** True when energy < 20 */
  isDrowsy: boolean;
  /** Toggled on second ticks when awake for subtle ear-twitch/pulse */
  secondPulse: boolean;
}

export interface PetAction {
  /** Additive velocity impulse to apply to PhysicsBody (null = none) */
  impulse: Vec2 | null;
  /** Direct horizontal velocity target for walking/chasing (null = leave body.vx to physics) */
  targetVx: number | null;
  /** True while 'dragged': caller should skip stepPhysics() and track pointer */
  suspendPhysics: boolean;
  /** Immutable snapshot of pet state after this step */
  snapshot: PetSnapshot;
  /** Particle bursts emitted on this frame */
  particles: ParticleTrigger[];
  /** True on the frame the pet reaches & consumes the active treat */
  consumedTreat: boolean;
}

export interface PetControllerConfig {
  initialState?: PetState;
  initialStats?: Partial<PetStats>;
  initialFacing?: PetFacing;
  /** Optional PRNG for deterministic unit testing (defaults to Math.random) */
  random?: () => number;
}

export type { Collider, CollisionEvent, PhysicsBody, Vec2 };
