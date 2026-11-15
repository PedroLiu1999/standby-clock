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

  private measureCtx: CanvasRenderingContext2D | null = null;
  private measureCtxTried = false;

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

  private getMeasureContext(): CanvasRenderingContext2D | null {
    if (!this.measureCtxTried) {
      this.measureCtxTried = true;
      if (typeof document !== 'undefined') {
        try {
          const canvas = document.createElement('canvas');
          this.measureCtx = canvas.getContext('2d');
        } catch {
          this.measureCtx = null;
        }
      }
    }
    return this.measureCtx;
  }

  private getElementFont(el: HTMLElement): string | null {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
      return null;
    }
    const cs = window.getComputedStyle(el);
    if (!cs.fontSize || !cs.fontFamily) {
      return null;
    }
    return `${cs.fontStyle || 'normal'} ${cs.fontWeight || '400'} ${cs.fontSize} ${cs.fontFamily}`;
  }

  private computeInkRect(
    rawRect: SimpleRect,
    stageRect: Pick<SimpleRect, 'left' | 'top'>,
    text: string,
    font: string,
    ctx: CanvasRenderingContext2D,
    centerHorizontalInk: boolean,
  ): Rect | null {
    if (
      !Number.isFinite(rawRect.width) ||
      !Number.isFinite(rawRect.height) ||
      rawRect.width <= 0 ||
      rawRect.height <= 0
    ) {
      return null;
    }

    ctx.font = font;
    ctx.textAlign = 'left';
    const m = ctx.measureText(text);

    if (
      !Number.isFinite(m.actualBoundingBoxAscent) ||
      !Number.isFinite(m.actualBoundingBoxDescent) ||
      m.actualBoundingBoxAscent + m.actualBoundingBoxDescent <= 0
    ) {
      return toStageColliderRect(rawRect, stageRect, centerHorizontalInk);
    }

    const fa =
      Number.isFinite(m.fontBoundingBoxAscent) && m.fontBoundingBoxAscent > 0
        ? m.fontBoundingBoxAscent
        : rawRect.height * 0.8;
    const fd =
      Number.isFinite(m.fontBoundingBoxDescent) && m.fontBoundingBoxDescent >= 0
        ? m.fontBoundingBoxDescent
        : rawRect.height * 0.2;

    const halfLeading = (rawRect.height - (fa + fd)) / 2;
    const baselineY = rawRect.top + halfLeading + fa;
    const inkTop = baselineY - m.actualBoundingBoxAscent;
    const inkBottom = baselineY + m.actualBoundingBoxDescent;
    const height = Math.max(1, inkBottom - inkTop);

    let x = rawRect.left - stageRect.left;
    let width = rawRect.width;

    if (
      centerHorizontalInk &&
      Number.isFinite(m.actualBoundingBoxLeft) &&
      Number.isFinite(m.actualBoundingBoxRight)
    ) {
      const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      if (inkWidth > 1 && inkWidth < rawRect.width) {
        x = rawRect.left + (rawRect.width - inkWidth) / 2 - stageRect.left;
        width = inkWidth;
      }
    }

    return {
      x,
      y: inkTop - stageRect.top,
      width,
      height,
    };
  }

  private measure(): void {
    const stageRect = this.stageEl.getBoundingClientRect();
    this.cachedBounds = {
      width: Math.max(0, stageRect.width),
      height: Math.max(0, stageRect.height),
    };

    const next: Collider[] = [];
    const ctx = this.getMeasureContext();

    const addElement = (
      el: HTMLElement | null,
      id: string,
      kind: Collider['kind'],
      applyDigitInset = false,
      skipIfEmpty = false,
      perChar = false,
    ): void => {
      if (!el) return;
      if (el.classList.contains('hidden')) return;
      const text = el.textContent?.trim() ?? '';
      if (skipIfEmpty && text === '') return;

      const prevTransform = el.style.transform;
      if (prevTransform) {
        el.style.transform = '';
      }

      const font = ctx ? this.getElementFont(el) : null;

      if (
        perChar &&
        ctx &&
        font &&
        typeof document !== 'undefined' &&
        typeof document.createRange === 'function' &&
        el.firstChild &&
        el.firstChild.nodeType === 3 &&
        (el.firstChild.textContent?.length ?? 0) > 0
      ) {
        const textNode = el.firstChild;
        const rawText = textNode.textContent ?? '';
        const range = document.createRange();
        let addedPerChar = false;

        for (let i = 0; i < rawText.length; i++) {
          const ch = rawText[i];
          if (ch.trim() === '') continue;
          range.setStart(textNode, i);
          range.setEnd(textNode, i + 1);
          const charRect = range.getBoundingClientRect();
          const rect = this.computeInkRect(charRect, stageRect, ch, font, ctx, true);
          if (rect) {
            next.push({ id: `${id}:${i}`, rect, kind });
            addedPerChar = true;
          }
        }

        if (prevTransform) {
          el.style.transform = prevTransform;
        }
        if (addedPerChar) {
          return;
        }
      }

      const rawRect = el.getBoundingClientRect();
      if (prevTransform) {
        el.style.transform = prevTransform;
      }

      const rect =
        ctx && font && kind === 'platform' && text.length > 0
          ? this.computeInkRect(rawRect, stageRect, text, font, ctx, false)
          : toStageColliderRect(rawRect, stageRect, applyDigitInset);
      if (rect) {
        next.push({ id, rect, kind });
      }
    };

    addElement(this.stageEl.querySelector<HTMLElement>('#date'), 'date', 'platform', false, true, false);
    addElement(this.stageEl.querySelector<HTMLElement>('#hours'), 'hours', 'platform', true, false, true);
    addElement(this.stageEl.querySelector<HTMLElement>('#colon'), 'colon', 'platform', false, false, false);
    addElement(this.stageEl.querySelector<HTMLElement>('#minutes'), 'minutes', 'platform', true, false, true);
    addElement(this.stageEl.querySelector<HTMLElement>('#seconds'), 'seconds', 'platform', false, false, false);
    addElement(this.stageEl.querySelector<HTMLElement>('#ampm'), 'ampm', 'platform', false, true, false);

    if (this.controlsEl) {
      const pills = this.controlsEl.querySelectorAll<HTMLElement>('.pill');
      for (const pill of pills) {
        if (!pill.id) continue;
        addElement(pill, pill.id, 'control', false, false, false);
      }
    }

    this.cachedColliders = next;
    this.dirty = false;
  }
}
