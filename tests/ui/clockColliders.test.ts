import { describe, expect, it } from 'vitest';
import {
  DIGIT_TOP_INSET_RATIO,
  toStageColliderRect,
} from '../../src/ui/clockColliders.ts';

describe('toStageColliderRect', () => {
  it('converts viewport rect to stage-relative coordinates', () => {
    const rect = toStageColliderRect(
      { left: 220, top: 150, width: 120, height: 40 },
      { left: 20, top: 50 },
      false,
    );
    expect(rect).toEqual({ x: 200, y: 100, width: 120, height: 40 });
  });

  it('applies 12% visual glyph top-inset for digits', () => {
    const rect = toStageColliderRect(
      { left: 100, top: 200, width: 180, height: 100 },
      { left: 0, top: 0 },
      true,
    );
    expect(rect).not.toBeNull();
    expect(rect!.x).toBe(100);
    expect(rect!.y).toBeCloseTo(200 + 100 * DIGIT_TOP_INSET_RATIO, 5);
    expect(rect!.width).toBe(180);
    expect(rect!.height).toBeCloseTo(100 * (1 - DIGIT_TOP_INSET_RATIO), 5);
  });

  it('returns null for zero or negative dimensions', () => {
    expect(
      toStageColliderRect(
        { left: 10, top: 10, width: 0, height: 50 },
        { left: 0, top: 0 },
      ),
    ).toBeNull();
    expect(
      toStageColliderRect(
        { left: 10, top: 10, width: 50, height: -5 },
        { left: 0, top: 0 },
      ),
    ).toBeNull();
  });
});
