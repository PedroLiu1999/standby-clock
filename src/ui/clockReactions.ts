import type { TimeEvent } from '../pet/types.ts';
import type { CollisionEvent } from '../physics/types.ts';

interface SpringNudge {
  el: HTMLElement;
  x: number;
  y: number;
  rot: number;
  vx: number;
  vy: number;
  vrot: number;
}

const STIFFNESS = 240;
const DAMPING = 18;
const MAX_OFFSET = 16;
const MAX_ROT = 8;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class ClockReactions {
  private readonly stageEl: HTMLElement;
  private readonly active = new Map<string, SpringNudge>();

  constructor(stageEl: HTMLElement) {
    this.stageEl = stageEl;
  }

  onCollisions(events: readonly CollisionEvent[], reducedMotion: boolean): void {
    if (reducedMotion || events.length === 0) {
      return;
    }

    for (const event of events) {
      if (!event.colliderId) continue;
      const entry = this.getOrCreate(event.colliderId);
      if (!entry) continue;

      const speed = Math.min(Math.max(event.impactSpeed, 0), 1400);
      const impulse = clamp(speed * 0.18, 22, 140);

      switch (event.side) {
        case 'top':
          entry.vy += impulse;
          entry.vrot += (event.colliderId.length % 2 === 0 ? 1 : -1) * clamp(speed * 0.04, 8, 36);
          break;
        case 'bottom':
          entry.vy -= impulse * 0.85;
          entry.vrot += (event.colliderId.length % 2 === 0 ? -1 : 1) * clamp(speed * 0.03, 6, 28);
          break;
        case 'left':
          entry.vx += impulse * 0.85;
          entry.vrot += clamp(speed * 0.04, 8, 36);
          break;
        case 'right':
          entry.vx -= impulse * 0.85;
          entry.vrot -= clamp(speed * 0.04, 8, 36);
          break;
      }
    }
  }

  onTimeEvent(event: TimeEvent, reducedMotion: boolean): void {
    if (reducedMotion) return;

    if (event.type === 'minute') {
      const minutesEntry = this.getOrCreate('minutes');
      if (minutesEntry) {
        minutesEntry.vy += 40;
      }
    } else if (event.type === 'hour') {
      const hoursEntry = this.getOrCreate('hours');
      if (hoursEntry) {
        hoursEntry.vy -= 55;
      }
      const minutesEntry = this.getOrCreate('minutes');
      if (minutesEntry) {
        minutesEntry.vy -= 45;
      }
    }
  }

  step(dt: number, reducedMotion: boolean): void {
    if (this.active.size === 0) return;

    if (reducedMotion) {
      this.reset();
      return;
    }

    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    if (safeDt <= 0) return;

    for (const [id, entry] of this.active) {
      const ax = -STIFFNESS * entry.x - DAMPING * entry.vx;
      const ay = -STIFFNESS * entry.y - DAMPING * entry.vy;
      const arot = -STIFFNESS * entry.rot - DAMPING * entry.vrot;

      entry.vx += ax * safeDt;
      entry.vy += ay * safeDt;
      entry.vrot += arot * safeDt;

      entry.x = clamp(entry.x + entry.vx * safeDt, -MAX_OFFSET, MAX_OFFSET);
      entry.y = clamp(entry.y + entry.vy * safeDt, -MAX_OFFSET, MAX_OFFSET);
      entry.rot = clamp(entry.rot + entry.vrot * safeDt, -MAX_ROT, MAX_ROT);

      const settled =
        Math.abs(entry.x) < 0.08 &&
        Math.abs(entry.y) < 0.08 &&
        Math.abs(entry.rot) < 0.08 &&
        Math.abs(entry.vx) < 0.5 &&
        Math.abs(entry.vy) < 0.5 &&
        Math.abs(entry.vrot) < 0.5;

      if (settled) {
        entry.el.style.transform = '';
        this.active.delete(id);
      } else if (id === 'colon') {
        entry.el.style.transform = `translate(${entry.x.toFixed(2)}px, calc(-0.06em + ${entry.y.toFixed(2)}px)) rotate(${entry.rot.toFixed(2)}deg)`;
      } else {
        entry.el.style.transform = `translate(${entry.x.toFixed(2)}px, ${entry.y.toFixed(2)}px) rotate(${entry.rot.toFixed(2)}deg)`;
      }
    }
  }

  reset(): void {
    for (const entry of this.active.values()) {
      entry.el.style.transform = '';
    }
    this.active.clear();
  }

  private getOrCreate(id: string): SpringNudge | null {
    const existing = this.active.get(id);
    if (existing) return existing;

    const escapedId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(id)
        : id;
    const el = this.stageEl.querySelector<HTMLElement>(`#${escapedId}`);
    if (!el) return null;

    const entry: SpringNudge = {
      el,
      x: 0,
      y: 0,
      rot: 0,
      vx: 0,
      vy: 0,
      vrot: 0,
    };
    this.active.set(id, entry);
    return entry;
  }
}
