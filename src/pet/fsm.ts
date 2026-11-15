import type {
  Collider,
  CollisionEvent,
  ParticleKind,
  ParticleTrigger,
  PetAction,
  PetCommand,
  PetControllerConfig,
  PetFacing,
  PetSnapshot,
  PetState,
  PetStats,
  PetStepOptions,
  PhysicsBody,
  TimeEvent,
  TreatTarget,
  Vec2,
} from './types.ts';

export const MAX_DT = 0.05;
export const PATROL_SPEED = 90;
export const CHASE_SPEED = 155;
export const JUMP_VY = -520;
export const JUMP_VY_REDUCED = -320;
export const EAT_RADIUS = 34;
export const EAT_DURATION = 1.2;
export const HAPPY_DURATION = 1.2;
export const POST_EAT_HAPPY_DURATION = 0.8;
export const STARTLE_DURATION = 0.7;
export const MINUTE_STARTLE_DURATION = 0.5;
export const STARTLE_IMPACT_SPEED = 650;
export const INACTIVITY_SLEEP_DAY = 45;
export const INACTIVITY_SLEEP_NIGHT_OR_TIRED = 20;
export const ZZZ_INTERVAL = 1.8;
export const DEFAULT_STAGE_WIDTH = 1280;

interface PendingParticle {
  kind: ParticleKind;
  count: number;
  x?: number;
  y?: number;
}

interface PendingImpulse {
  x: number;
  y: number;
  scaleForReducedMotion?: boolean;
  skipIfReducedMotion?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function cloneStats(stats: PetStats): PetStats {
  return {
    energy: stats.energy,
    happiness: stats.happiness,
    fullness: stats.fullness,
  };
}

export class PetController {
  private state: PetState;
  private facing: PetFacing;
  private stats: PetStats;
  private stateTimer = 0;
  private perchedOnId: string | null = null;
  private inactivitySeconds = 0;
  private squashX = 1;
  private squashY = 1;
  private secondPulse = false;

  private aiTimer: number;
  private walkTimer = 0;
  private perchTimer = 4.0;
  private zzzTimer = 0;
  private jumpCooldown = 0;
  private happyDuration = HAPPY_DURATION;
  private startleDuration = STARTLE_DURATION;

  private pendingImpulses: PendingImpulse[] = [];
  private pendingParticles: PendingParticle[] = [];
  private readonly random: () => number;

  constructor(config: PetControllerConfig = {}) {
    this.random = config.random ?? Math.random;
    this.state = config.initialState ?? 'idle';
    this.facing = config.initialFacing ?? 'right';
    this.stats = {
      energy: clamp(config.initialStats?.energy ?? 85, 0, 100),
      happiness: clamp(config.initialStats?.happiness ?? 80, 0, 100),
      fullness: clamp(config.initialStats?.fullness ?? 75, 0, 100),
    };
    this.aiTimer = this.randomRange(2.0, 4.5);
    this.walkTimer = this.state === 'walking' ? 2.0 : 0;
  }

  getSnapshot(): PetSnapshot {
    return {
      state: this.state,
      facing: this.facing,
      stats: cloneStats(this.stats),
      stateTimer: this.stateTimer,
      perchedOnId: this.perchedOnId,
      inactivitySeconds: this.inactivitySeconds,
      squashX: this.squashX,
      squashY: this.squashY,
      isDrowsy: this.stats.energy < 20,
      secondPulse: this.secondPulse,
    };
  }

  getStats(): PetStats {
    return cloneStats(this.stats);
  }

  dispatch(command: PetCommand, body?: PhysicsBody): void {
    switch (command.type) {
      case 'startDrag': {
        this.state = 'dragged';
        this.stateTimer = 0;
        this.inactivitySeconds = 0;
        this.perchedOnId = null;
        this.pendingImpulses = [];
        return;
      }

      case 'endDrag': {
        this.stateTimer = 0;
        this.inactivitySeconds = 0;
        const releaseSpeed = command.releaseSpeed ?? 0;
        if (body && body.grounded && releaseSpeed < STARTLE_IMPACT_SPEED) {
          this.perchedOnId = body.perchedOnId;
          this.state = body.perchedOnId !== null ? 'perched' : 'idle';
          this.aiTimer = this.randomRange(2.0, 4.5);
          this.perchTimer = this.randomRange(3.0, 6.0);
        } else {
          this.perchedOnId = null;
          this.state = 'falling';
        }
        return;
      }

      case 'pet': {
        if (this.state === 'dragged') return;
        this.inactivitySeconds = 0;
        this.stats.happiness = clamp(this.stats.happiness + 12, 0, 100);
        this.state = 'happy';
        this.happyDuration = HAPPY_DURATION;
        this.stateTimer = 0;
        this.queueParticle('heart', 2, body);
        if (body?.grounded) {
          this.pendingImpulses.push({ x: 0, y: -220, skipIfReducedMotion: true });
        }
        return;
      }

      case 'wake': {
        this.inactivitySeconds = 0;
        if (this.state === 'sleeping') {
          this.perchedOnId = body?.perchedOnId ?? this.perchedOnId;
          this.state = this.perchedOnId !== null ? 'perched' : 'idle';
          this.stateTimer = 0;
          this.aiTimer = this.randomRange(2.0, 4.5);
          this.perchTimer = this.randomRange(3.0, 6.0);
        }
        return;
      }

      case 'sleep': {
        this.inactivitySeconds = 0;
        if (this.canSleepFromCurrentState(body)) {
          this.enterSleeping();
        }
        return;
      }

      case 'toggleSleep': {
        this.inactivitySeconds = 0;
        if (this.state === 'sleeping') {
          this.perchedOnId = body?.perchedOnId ?? this.perchedOnId;
          this.state = this.perchedOnId !== null ? 'perched' : 'idle';
          this.stateTimer = 0;
          this.aiTimer = this.randomRange(2.0, 4.5);
          this.perchTimer = this.randomRange(3.0, 6.0);
        } else if (this.canSleepFromCurrentState(body)) {
          this.enterSleeping();
        }
        return;
      }

      case 'feed': {
        this.inactivitySeconds = 0;
        if (this.state === 'sleeping') {
          this.perchedOnId = body?.perchedOnId ?? this.perchedOnId;
          this.state = this.perchedOnId !== null ? 'perched' : 'idle';
          this.stateTimer = 0;
        }
        return;
      }

      case 'jump': {
        this.inactivitySeconds = 0;
        if (this.state === 'dragged' || this.state === 'jumping' || this.jumpCooldown > 0) return;
        const canJump = body ? body.grounded : this.state !== 'falling';
        if (!canJump) return;
        const dir = command.direction ?? 0;
        if (dir === -1) this.facing = 'left';
        if (dir === 1) this.facing = 'right';
        this.state = 'jumping';
        this.stateTimer = 0;
        this.perchedOnId = null;
        this.jumpCooldown = 0.35;
        this.pendingImpulses.push({
          x: dir * 140,
          y: JUMP_VY,
          scaleForReducedMotion: true,
        });
        return;
      }

      case 'move': {
        this.inactivitySeconds = 0;
        this.facing = command.direction === -1 ? 'left' : 'right';
        if (this.state !== 'dragged' && this.state !== 'jumping' && this.state !== 'falling') {
          this.state = 'walking';
          this.walkTimer = 0.6;
          this.stateTimer = 0;
        }
        return;
      }

      case 'setFacing': {
        this.facing = command.facing;
        return;
      }
    }
  }

  onTimeEvent(
    event: TimeEvent,
    body?: PhysicsBody,
    options?: Pick<PetStepOptions, 'reducedMotion'>
  ): void {
    const reducedMotion = options?.reducedMotion ?? false;

    if (event.type === 'second') {
      if (this.state !== 'sleeping' && this.state !== 'dragged') {
        this.secondPulse = !this.secondPulse;
      }
      return;
    }

    if (event.type === 'minute') {
      if (this.state === 'perched') {
        const dir = this.facing === 'right' ? 1 : -1;
        this.pendingImpulses.push({
          x: dir * (reducedMotion ? 30 : 90),
          y: reducedMotion ? -100 : -240,
        });
        this.state = 'startled';
        this.startleDuration = MINUTE_STARTLE_DURATION;
        this.stateTimer = 0;
        this.perchedOnId = null;
        this.queueParticle('sparkle', reducedMotion ? 1 : 2, body);
      }
      return;
    }

    if (event.type === 'hour') {
      if (this.state !== 'sleeping' && this.state !== 'dragged') {
        this.pendingImpulses.push({
          x: 0,
          y: reducedMotion ? -200 : -460,
        });
        this.state = 'happy';
        this.happyDuration = HAPPY_DURATION;
        this.stateTimer = 0;
        this.perchedOnId = null;
        this.stats.happiness = clamp(this.stats.happiness + 5, 0, 100);
        this.queueParticle('sparkle', reducedMotion ? 1 : 5, body);
      }
    }
  }

  step(
    body: PhysicsBody,
    dt: number,
    colliders: Collider[],
    events: CollisionEvent[],
    treat: TreatTarget | null,
    options: PetStepOptions
  ): PetAction {
    const clampedDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_DT) : 0;
    const elapsedDt =
      options.rawDt !== undefined && Number.isFinite(options.rawDt) && options.rawDt > 0
        ? options.rawDt
        : clampedDt;
    this.stateTimer += clampedDt;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - clampedDt);

    const perchedCollider =
      body.perchedOnId !== null
        ? colliders.find((c) => c.id === body.perchedOnId) ?? null
        : null;

    if (body.grounded && perchedCollider) {
      this.perchedOnId = perchedCollider.id;
    } else if (!body.grounded || body.perchedOnId === null || perchedCollider === null) {
      if (this.state !== 'dragged') {
        this.perchedOnId = null;
      }
    }

    const maxImpactSpeed = events.reduce((max, e) => Math.max(max, e.impactSpeed), 0);

    // Squash & stretch recovery
    if (options.reducedMotion) {
      this.squashX = 1;
      this.squashY = 1;
    } else {
      const spring = Math.min(1, clampedDt * 12);
      this.squashX += (1 - this.squashX) * spring;
      this.squashY += (1 - this.squashY) * spring;
    }

    let impulse: Vec2 | null = this.flushPendingImpulses(options.reducedMotion);
    let targetVx: number | null = null;
    let suspendPhysics = false;
    let consumedTreat = false;
    const particles: ParticleTrigger[] = this.flushPendingParticles(body, options.reducedMotion);

    const emitHere = (kind: ParticleKind, count: number): void => {
      const pos = this.getParticleOrigin(body);
      particles.push({
        kind,
        x: pos.x,
        y: pos.y,
        count: options.reducedMotion ? Math.min(count, 1) : count,
      });
    };

    const sleepThreshold =
      options.nightMode || this.stats.energy < 20
        ? INACTIVITY_SLEEP_NIGHT_OR_TIRED
        : INACTIVITY_SLEEP_DAY;

    if (treat !== null && this.state !== 'sleeping' && this.state !== 'dragged') {
      this.inactivitySeconds = 0;
    }

    const emittedUpwardImpulseThisStep = impulse !== null && impulse.y < 0;

    switch (this.state) {
      case 'dragged': {
        suspendPhysics = true;
        targetVx = 0;
        break;
      }

      case 'sleeping': {
        targetVx = 0;
        this.zzzTimer += clampedDt;
        const interval = options.reducedMotion ? ZZZ_INTERVAL * 2 : ZZZ_INTERVAL;
        if (this.zzzTimer >= interval) {
          this.zzzTimer -= interval;
          emitHere('zzz', 1);
        }
        break;
      }

      case 'eating': {
        targetVx = 0;
        if (this.stateTimer >= EAT_DURATION) {
          this.state = 'happy';
          this.happyDuration = POST_EAT_HAPPY_DURATION;
          this.stateTimer = 0;
        }
        break;
      }

      case 'happy': {
        targetVx = body.grounded ? 0 : null;
        if (this.stateTimer >= this.happyDuration) {
          if (!body.grounded) {
            this.state = 'falling';
          } else if (perchedCollider) {
            this.state = 'perched';
            this.perchTimer = this.randomRange(3.0, 6.0);
          } else {
            this.state = 'idle';
            this.aiTimer = this.randomRange(2.0, 4.5);
          }
          this.stateTimer = 0;
        }
        break;
      }

      case 'startled': {
        targetVx = body.grounded ? 0 : null;
        if (elapsedDt >= sleepThreshold) {
          this.inactivitySeconds += elapsedDt;
          this.enterSleeping();
          break;
        }
        if (this.stateTimer >= this.startleDuration) {
          if (!body.grounded) {
            this.state = 'falling';
          } else if (perchedCollider) {
            this.state = 'perched';
            this.perchTimer = this.randomRange(3.0, 6.0);
          } else {
            this.state = 'idle';
            this.aiTimer = this.randomRange(2.0, 4.5);
          }
          this.stateTimer = 0;
        }
        break;
      }

      case 'jumping': {
        targetVx = null;
        if (!emittedUpwardImpulseThisStep) {
          if (body.grounded) {
            if (perchedCollider) {
              this.state = 'perched';
              this.perchTimer = this.randomRange(3.0, 6.0);
            } else {
              this.state = 'idle';
              this.aiTimer = this.randomRange(2.0, 4.5);
            }
            this.stateTimer = 0;
          } else if (body.vy >= 0) {
            this.state = 'falling';
            this.stateTimer = 0;
          }
        }
        break;
      }

      case 'falling': {
        targetVx = null;
        this.inactivitySeconds += elapsedDt;
        if (body.grounded) {
          if (!options.reducedMotion) {
            this.squashX = 1.22;
            this.squashY = 0.80;
          }
          if (maxImpactSpeed >= STARTLE_IMPACT_SPEED) {
            this.state = 'startled';
            this.startleDuration = STARTLE_DURATION;
            this.stateTimer = 0;
          } else if (perchedCollider) {
            this.state = 'perched';
            this.perchTimer = this.randomRange(3.0, 6.0);
            this.stateTimer = 0;
          } else {
            this.state = 'idle';
            this.aiTimer = this.randomRange(2.0, 4.5);
            this.stateTimer = 0;
          }
        } else if (maxImpactSpeed >= STARTLE_IMPACT_SPEED) {
          this.state = 'startled';
          this.startleDuration = STARTLE_DURATION;
          this.stateTimer = 0;
        } else if (this.inactivitySeconds >= sleepThreshold) {
          this.enterSleeping();
        }
        break;
      }

      case 'perched': {
        targetVx = 0;
        this.inactivitySeconds += elapsedDt;
        if (!body.grounded || body.perchedOnId === null || perchedCollider === null) {
          this.state = 'falling';
          this.stateTimer = 0;
          this.perchedOnId = null;
        } else if (treat !== null) {
          const result = this.handleTreatFromGrounded(body, treat, options.reducedMotion, emitHere);
          if (result.consumed) {
            consumedTreat = true;
          } else if (result.jumpImpulse) {
            impulse = this.combineImpulses(impulse, result.jumpImpulse);
            targetVx = null;
          } else if (result.targetVx !== null) {
            targetVx = result.targetVx;
          }
        } else if (this.inactivitySeconds >= sleepThreshold) {
          this.enterSleeping();
        } else {
          this.perchTimer -= clampedDt;
          if (this.perchTimer <= 0) {
            if (!options.reducedMotion && colliders.length > 1 && this.random() < 0.45) {
              const hop = this.pickPlatformHopImpulse(body, colliders, options.reducedMotion, perchedCollider.id);
              if (hop) {
                impulse = this.combineImpulses(impulse, hop);
                targetVx = null;
                this.state = 'jumping';
                this.stateTimer = 0;
                this.perchedOnId = null;
                break;
              }
            }
            this.facing = this.random() < 0.5 ? 'left' : 'right';
            this.state = 'walking';
            this.walkTimer = this.randomRange(1.5, 3.5);
            this.stateTimer = 0;
          }
        }
        break;
      }

      case 'idle': {
        targetVx = 0;
        this.inactivitySeconds += elapsedDt;
        if (!body.grounded && body.vy > 20) {
          this.state = 'falling';
          this.stateTimer = 0;
        } else if (treat !== null) {
          const result = this.handleTreatFromGrounded(body, treat, options.reducedMotion, emitHere);
          if (result.consumed) {
            consumedTreat = true;
          } else if (result.jumpImpulse) {
            impulse = this.combineImpulses(impulse, result.jumpImpulse);
            targetVx = null;
          } else if (result.targetVx !== null) {
            targetVx = result.targetVx;
          }
        } else if (this.inactivitySeconds >= sleepThreshold) {
          this.enterSleeping();
        } else {
          this.aiTimer -= clampedDt;
          if (this.aiTimer <= 0) {
            if (this.stats.energy < 20 && this.random() < 0.5) {
              this.enterSleeping();
            } else if (!options.reducedMotion && colliders.length > 0 && this.random() < 0.32) {
              const hop = this.pickPlatformHopImpulse(body, colliders, options.reducedMotion, null);
              if (hop) {
                impulse = this.combineImpulses(impulse, hop);
                targetVx = null;
                this.state = 'jumping';
                this.stateTimer = 0;
                break;
              }
              this.startAutonomousWalk();
            } else {
              this.startAutonomousWalk();
            }
          }
        }
        break;
      }

      case 'walking': {
        if (!body.grounded && body.vy > 20) {
          this.state = 'falling';
          this.stateTimer = 0;
          targetVx = null;
        } else if (treat !== null) {
          const centerX = body.x + body.width / 2;
          const centerY = body.y + body.height / 2;
          const dx = treat.x - centerX;
          const dy = treat.y - centerY;
          const dist = Math.hypot(dx, dy);

          if (dist <= EAT_RADIUS) {
            this.consumeTreat(emitHere);
            consumedTreat = true;
            targetVx = 0;
          } else {
            this.facing = dx >= 0 ? 'right' : 'left';
            targetVx = (this.facing === 'right' ? 1 : -1) * CHASE_SPEED;
            if (treat.y < body.y - 28 && body.grounded && this.jumpCooldown <= 0) {
              const jumpVy = options.reducedMotion ? JUMP_VY_REDUCED : JUMP_VY;
              const jumpVx = clamp(dx * 1.4, -220, 220);
              impulse = this.combineImpulses(impulse, { x: jumpVx, y: jumpVy });
              targetVx = null;
              this.state = 'jumping';
              this.stateTimer = 0;
              this.perchedOnId = null;
              this.jumpCooldown = 0.45;
            }
          }
        } else {
          this.inactivitySeconds += elapsedDt;
          if (this.inactivitySeconds >= sleepThreshold && body.grounded) {
            this.enterSleeping();
            targetVx = 0;
            break;
          }
          const hitWall = events.some(
            (e) => e.colliderId === null && (e.side === 'left' || e.side === 'right')
          );
          if (hitWall) {
            this.facing = this.facing === 'right' ? 'left' : 'right';
          }

          const stageWidth = options.stageWidth ?? DEFAULT_STAGE_WIDTH;
          if (this.facing === 'left' && body.x <= 4) {
            this.facing = 'right';
          } else if (this.facing === 'right' && body.x + body.width >= stageWidth - 4) {
            this.facing = 'left';
          }

          if (perchedCollider) {
            if (this.facing === 'left' && body.x <= perchedCollider.rect.x + 4) {
              this.facing = 'right';
            } else if (
              this.facing === 'right' &&
              body.x + body.width >= perchedCollider.rect.x + perchedCollider.rect.width - 4
            ) {
              this.facing = 'left';
            }
          }

          targetVx = (this.facing === 'right' ? 1 : -1) * PATROL_SPEED;
          this.walkTimer -= clampedDt;
          if (this.walkTimer <= 0) {
            targetVx = 0;
            if (perchedCollider) {
              this.state = 'perched';
              this.perchTimer = this.randomRange(3.0, 6.0);
            } else {
              this.state = 'idle';
              this.aiTimer = this.randomRange(2.0, 4.5);
            }
            this.stateTimer = 0;
          }
        }
        break;
      }
    }

    // Apply jump squash if any upward impulse is emitted this step (and !reducedMotion)
    if (!options.reducedMotion && impulse !== null && impulse.y < -150) {
      this.squashX = 0.85;
      this.squashY = 1.18;
    }

    // Update stats
    this.updateStats(clampedDt);

    return {
      impulse,
      targetVx,
      suspendPhysics,
      snapshot: this.getSnapshot(),
      particles,
      consumedTreat,
    };
  }

  private canSleepFromCurrentState(_body?: PhysicsBody): boolean {
    return this.state !== 'dragged';
  }

  private enterSleeping(): void {
    this.state = 'sleeping';
    this.stateTimer = 0;
    this.zzzTimer = ZZZ_INTERVAL - 0.1;
  }

  private startAutonomousWalk(): void {
    this.facing = this.random() < 0.5 ? 'left' : 'right';
    this.state = 'walking';
    this.walkTimer = this.randomRange(1.5, 3.5);
    this.stateTimer = 0;
  }

  private handleTreatFromGrounded(
    body: PhysicsBody,
    treat: TreatTarget,
    reducedMotion: boolean,
    emitHere: (kind: ParticleKind, count: number) => void
  ): { consumed: boolean; jumpImpulse: Vec2 | null; targetVx: number | null } {
    const centerX = body.x + body.width / 2;
    const centerY = body.y + body.height / 2;
    const dx = treat.x - centerX;
    const dy = treat.y - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist <= EAT_RADIUS) {
      this.consumeTreat(emitHere);
      return { consumed: true, jumpImpulse: null, targetVx: 0 };
    }

    this.facing = dx >= 0 ? 'right' : 'left';
    if (treat.y < body.y - 28 && body.grounded && this.jumpCooldown <= 0) {
      const jumpVy = reducedMotion ? JUMP_VY_REDUCED : JUMP_VY;
      const jumpVx = clamp(dx * 1.4, -220, 220);
      this.state = 'jumping';
      this.stateTimer = 0;
      this.perchedOnId = null;
      this.jumpCooldown = 0.45;
      return { consumed: false, jumpImpulse: { x: jumpVx, y: jumpVy }, targetVx: null };
    }

    this.state = 'walking';
    this.walkTimer = 1.5;
    this.stateTimer = 0;
    return {
      consumed: false,
      jumpImpulse: null,
      targetVx: (this.facing === 'right' ? 1 : -1) * CHASE_SPEED,
    };
  }

  private consumeTreat(emitHere: (kind: ParticleKind, count: number) => void): void {
    this.stats.fullness = clamp(this.stats.fullness + 25, 0, 100);
    this.stats.happiness = clamp(this.stats.happiness + 10, 0, 100);
    this.stats.energy = clamp(this.stats.energy + 5, 0, 100);
    this.state = 'eating';
    this.stateTimer = 0;
    emitHere('crumb', 3);
    emitHere('heart', 1);
  }

  private pickPlatformHopImpulse(
    body: PhysicsBody,
    colliders: Collider[],
    reducedMotion: boolean,
    excludeId: string | null
  ): Vec2 | null {
    const candidates = colliders.filter(
      (c) =>
        (c.kind === 'platform' || c.kind === 'control') &&
        c.id !== excludeId &&
        c.rect.y < body.y + body.height
    );
    if (candidates.length === 0) return null;

    const target = candidates[Math.floor(this.random() * candidates.length) % candidates.length];
    const bodyCenterX = body.x + body.width / 2;
    const targetCenterX = target.rect.x + target.rect.width / 2;
    const dx = targetCenterX - bodyCenterX;
    this.facing = dx >= 0 ? 'right' : 'left';

    const jumpVy = reducedMotion ? JUMP_VY_REDUCED : JUMP_VY;
    const vx = clamp(dx * 1.1, -240, 240);
    this.jumpCooldown = 0.5;
    return { x: vx, y: jumpVy };
  }

  private updateStats(dt: number): void {
    if (dt <= 0) return;

    if (this.state === 'sleeping') {
      this.stats.energy = clamp(this.stats.energy + 6.0 * dt, 0, 100);
      this.stats.fullness = clamp(this.stats.fullness - 0.10 * dt, 0, 100);
      if (this.stats.happiness < 80) {
        this.stats.happiness = Math.min(80, this.stats.happiness + 0.20 * dt);
      }
      return;
    }

    if (this.state === 'walking' || this.state === 'jumping' || this.state === 'falling') {
      this.stats.energy = clamp(this.stats.energy - 0.60 * dt, 0, 100);
      this.stats.fullness = clamp(this.stats.fullness - 0.25 * dt, 0, 100);
      if (this.stats.happiness > 10) {
        this.stats.happiness = Math.max(10, this.stats.happiness - 0.10 * dt);
      }
      return;
    }

    // Active / resting states: idle, perched, happy, startled, eating, dragged
    this.stats.energy = clamp(this.stats.energy - 0.35 * dt, 0, 100);
    this.stats.fullness = clamp(this.stats.fullness - 0.25 * dt, 0, 100);
    const happinessRate = this.stats.fullness < 20 || this.stats.energy < 20 ? 0.30 : 0.15;
    if (this.stats.happiness > 10) {
      this.stats.happiness = Math.max(10, this.stats.happiness - happinessRate * dt);
    }
  }

  private queueParticle(kind: ParticleKind, count: number, body?: PhysicsBody): void {
    if (body) {
      const pos = this.getParticleOrigin(body);
      this.pendingParticles.push({ kind, count, x: pos.x, y: pos.y });
    } else {
      this.pendingParticles.push({ kind, count });
    }
  }

  private flushPendingParticles(body: PhysicsBody, reducedMotion: boolean): ParticleTrigger[] {
    if (this.pendingParticles.length === 0) return [];
    const fallbackPos = this.getParticleOrigin(body);
    const out = this.pendingParticles.map((p) => ({
      kind: p.kind,
      x: p.x ?? fallbackPos.x,
      y: p.y ?? fallbackPos.y,
      count: reducedMotion ? Math.min(p.count, 1) : p.count,
    }));
    this.pendingParticles = [];
    return out;
  }

  private flushPendingImpulses(reducedMotion: boolean): Vec2 | null {
    if (this.pendingImpulses.length === 0) return null;
    let totalX = 0;
    let totalY = 0;
    let any = false;

    for (const item of this.pendingImpulses) {
      if (reducedMotion && item.skipIfReducedMotion) {
        continue;
      }
      if (reducedMotion && item.scaleForReducedMotion) {
        totalX += item.x * 0.6;
        totalY += JUMP_VY_REDUCED;
      } else {
        totalX += item.x;
        totalY += item.y;
      }
      any = true;
    }

    this.pendingImpulses = [];
    return any ? { x: totalX, y: totalY } : null;
  }

  private combineImpulses(a: Vec2 | null, b: Vec2 | null): Vec2 | null {
    if (!a) return b;
    if (!b) return a;
    return { x: a.x + b.x, y: a.y + b.y };
  }

  private getParticleOrigin(body: PhysicsBody): Vec2 {
    return {
      x: body.x + body.width * 0.5,
      y: body.y + body.height * 0.2,
    };
  }

  private randomRange(min: number, max: number): number {
    return min + this.random() * (max - min);
  }
}
