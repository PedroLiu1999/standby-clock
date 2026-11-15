import type { Bounds, Collider, Rect } from '../physics/types.ts';

export interface SimpleRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const DIGIT_TOP_INSET_RATIO = 0.12;

export function toStageColliderRect(
  rect: SimpleRect,
  stageRect: Pick<SimpleRect, 'left' | 'top'>,
  applyDigitInset = false,
): Rect | null {
  if (
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null;
  }

  let x = rect.left - stageRect.left;
  let y = rect.top - stageRect.top;
  const width = rect.width;
  let height = rect.height;

  if (applyDigitInset) {
    const inset = height * DIGIT_TOP_INSET_RATIO;
    y += inset;
    height -= inset;
  }

  if (height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

export class ClockColliderManager {
  private readonly stageEl: HTMLElement;
  private readonly clockCardEl: HTMLElement | null;
  private readonly controlsEl: HTMLElement | null;

  private dirty = true;
  private cachedColliders: Collider[] = [];
  private cachedBounds: Bounds = { width: 0, height: 0 };

  private resizeObserver: ResizeObserver | null = null;
  private readonly onWindowResize: () => void;

  constructor(stageEl: HTMLElement) {
    this.stageEl = stageEl;
    this.clockCardEl = stageEl.querySelector<HTMLElement>('.clock-card');
    this.controlsEl = stageEl.querySelector<HTMLElement>('.controls');

    this.onWindowResize = () => {
      this.invalidate();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onWindowResize);
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.invalidate();
      });
      this.resizeObserver.observe(this.stageEl);
      if (this.clockCardEl) {
        this.resizeObserver.observe(this.clockCardEl);
      }
      if (this.controlsEl) {
        this.resizeObserver.observe(this.controlsEl);
      }
      const dateEl = this.stageEl.querySelector<HTMLElement>('#date');
      if (dateEl) {
        this.resizeObserver.observe(dateEl);
      }
    }
  }

  invalidate(): void {
    this.dirty = true;
  }

  getBounds(): Bounds {
    if (this.dirty) {
      this.measure();
    }
    return this.cachedBounds;
  }

  getColliders(): Collider[] {
    if (this.dirty) {
      this.measure();
    }
    return this.cachedColliders;
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onWindowResize);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private measure(): void {
    const stageRect = this.stageEl.getBoundingClientRect();
    this.cachedBounds = {
      width: Math.max(0, stageRect.width),
      height: Math.max(0, stageRect.height),
    };

    const next: Collider[] = [];

    const addElement = (
      el: HTMLElement | null,
      id: string,
      kind: Collider['kind'],
      applyDigitInset = false,
      skipIfEmpty = false,
    ): void => {
      if (!el) return;
      if (el.classList.contains('hidden')) return;
      if (skipIfEmpty && (el.textContent?.trim() ?? '') === '') return;

      const prevTransform = el.style.transform;
      if (prevTransform) {
        el.style.transform = '';
      }
      const rawRect = el.getBoundingClientRect();
      if (prevTransform) {
        el.style.transform = prevTransform;
      }

      const rect = toStageColliderRect(
        rawRect,
        stageRect,
        applyDigitInset,
      );
      if (rect) {
        next.push({ id, rect, kind });
      }
    };

    addElement(this.stageEl.querySelector<HTMLElement>('#date'), 'date', 'platform', false, true);
    addElement(this.stageEl.querySelector<HTMLElement>('#hours'), 'hours', 'platform', true, false);
    addElement(this.stageEl.querySelector<HTMLElement>('#colon'), 'colon', 'platform', false, false);
    addElement(this.stageEl.querySelector<HTMLElement>('#minutes'), 'minutes', 'platform', true, false);
    addElement(this.stageEl.querySelector<HTMLElement>('#seconds'), 'seconds', 'platform', false, false);
    addElement(this.stageEl.querySelector<HTMLElement>('#ampm'), 'ampm', 'platform', false, true);

    if (this.controlsEl) {
      const pills = this.controlsEl.querySelectorAll<HTMLElement>('.pill');
      for (const pill of pills) {
        if (!pill.id) continue;
        addElement(pill, pill.id, 'control', false, false);
      }
    }

    this.cachedColliders = next;
    this.dirty = false;
  }
}
