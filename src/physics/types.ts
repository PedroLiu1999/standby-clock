export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Bounds = Rect | { width: number; height: number };

export interface Collider {
  id: string; // e.g. 'hours', 'minutes', 'seconds', 'date', 'ampm', 'toggle-format'
  rect: Rect;
  kind: 'platform' | 'control';
}

export interface PhysicsBody {
  x: number; // top-left of pet hitbox
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  grounded: boolean;
  perchedOnId: string | null;
}

export interface CollisionEvent {
  colliderId: string | null; // null = viewport floor/wall/ceiling
  side: 'top' | 'bottom' | 'left' | 'right';
  impactSpeed: number;
}

export interface PhysicsConfig {
  gravity: number;          // e.g. 1500 px/s^2
  bounceY: number;          // e.g. 0.4
  bounceX: number;          // e.g. 0.5
  groundFriction: number;   // exponential decay rate
  airDrag: number;          // exponential decay rate
  restSnapVy: number;       // e.g. 45 px/s
  highSpeedDeflect: number; // speed threshold for side/bottom deflection
  maxThrowSpeed: number;    // e.g. 1600 px/s
}

export interface TreatBody extends PhysicsBody {
  active: boolean;
}
