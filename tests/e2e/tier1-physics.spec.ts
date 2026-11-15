import { expect, test } from '@playwright/test';
import {
  getDate,
  getFeedButton,
  getHours,
  getMinutes,
  getPet,
  getSeconds,
  getStage,
  getToggleFormat,
  getTreats,
} from './helpers/selectors.js';
import {
  centerOf,
  dragPetTo,
  getBox,
  getPetState,
  setPageHidden,
  setupClock,
  stepClock,
} from './helpers/actions.js';

test.describe('Tier 1 — Physics & Clock Colliders (F1–F4)', () => {
  test.describe('F1: 2D Gravity & Projectile Motion', () => {
    test('T1-F1-01: Downward gravity pulls airborne pet', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      // Place pet near top-center and hold still before release for zero throw velocity
      await dragPetTo(page, stageBox.x + stageBox.width * 0.2, stageBox.y + 40, {
        steps: 6,
        stepMs: 12,
        holdMsBeforeUp: 150,
      });

      const ys: number[] = [];
      for (let i = 0; i < 6; i++) {
        ys.push((await getBox(getPet(page))).y);
        await stepClock(page, 32);
      }

      // Monotonically increases initially under downward gravity
      expect(ys[1]).toBeGreaterThan(ys[0]);
      expect(ys[3]).toBeGreaterThan(ys[1]);
      expect(ys[5]).toBeGreaterThan(ys[3]);
    });

    test('T1-F1-02: Viewport floor containment', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 80, stageBox.y + 60, {
        holdMsBeforeUp: 150,
      });
      await stepClock(page, 2500);

      const petBox = await getBox(getPet(page));
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(
        stageBox.y + stageBox.height + 1
      );
      expect(petBox.y).toBeGreaterThan(stageBox.y + stageBox.height * 0.5);
    });

    test('T1-F1-03: Viewport left/right wall containment', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      // Fling hard toward left wall
      await dragPetTo(page, stageBox.x + 20, stageBox.y + 200, {
        steps: 4,
        stepMs: 10,
      });
      for (let i = 0; i < 15; i++) {
        const box = await getBox(getPet(page));
        expect(box.x).toBeGreaterThanOrEqual(stageBox.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(
          stageBox.x + stageBox.width + 1
        );
        await stepClock(page, 32);
      }

      // Fling hard toward right wall
      await dragPetTo(
        page,
        stageBox.x + stageBox.width - 20,
        stageBox.y + 200,
        { steps: 4, stepMs: 10 }
      );
      for (let i = 0; i < 15; i++) {
        const box = await getBox(getPet(page));
        expect(box.x).toBeGreaterThanOrEqual(stageBox.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(
          stageBox.x + stageBox.width + 1
        );
        await stepClock(page, 32);
      }
    });

    test('T1-F1-04: Viewport ceiling containment', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      // Position low, then fling straight upward fast
      await dragPetTo(page, stageBox.x + 120, stageBox.y + 400, {
        holdMsBeforeUp: 120,
      });
      await stepClock(page, 16);
      await dragPetTo(page, stageBox.x + 120, stageBox.y + 20, {
        steps: 4,
        stepMs: 8,
      });

      for (let i = 0; i < 20; i++) {
        const box = await getBox(getPet(page));
        expect(box.y).toBeGreaterThanOrEqual(stageBox.y - 1);
        await stepClock(page, 24);
      }
    });

    test('T1-F1-05: Pause physics when document.hidden', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 120, stageBox.y + 40, {
        holdMsBeforeUp: 150,
      });
      await stepClock(page, 48);
      const pausedBox = await getBox(getPet(page));

      await setPageHidden(page, true);
      await stepClock(page, 500);
      const afterHiddenBox = await getBox(getPet(page));

      expect(Math.abs(afterHiddenBox.y - pausedBox.y)).toBeLessThan(2);

      await setPageHidden(page, false);
      await stepClock(page, 500);
      const resumedBox = await getBox(getPet(page));
      expect(resumedBox.y).toBeGreaterThan(pausedBox.y + 10);
    });
  });

  test.describe('F2: Collision Physics', () => {
    test('T1-F2-01: Vertical restitution bounce on floor', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 100, stageBox.y + 30, {
        holdMsBeforeUp: 150,
      });

      const ySamples: number[] = [];
      for (let i = 0; i < 65; i++) {
        ySamples.push((await getBox(getPet(page))).y);
        await stepClock(page, 16);
      }

      // Find peak y (lowest point near floor) and verify a subsequent upward rebound (y decreases)
      const maxY = Math.max(...ySamples);
      const maxIdx = ySamples.indexOf(maxY);
      const minAfterImpact = Math.min(...ySamples.slice(maxIdx));
      expect(maxY - minAfterImpact).toBeGreaterThan(2);
    });

    test('T1-F2-02: Rest-snap eliminates micro-jitter', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 100, stageBox.y + 200, {
        holdMsBeforeUp: 150,
      });
      await stepClock(page, 2500);

      const ys: number[] = [];
      for (let i = 0; i < 10; i++) {
        ys.push((await getBox(getPet(page))).y);
        await stepClock(page, 16);
      }

      const delta = Math.max(...ys) - Math.min(...ys);
      expect(delta).toBeLessThan(0.5);
    });

    test('T1-F2-03: Horizontal ground friction slows slide', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 100, stageBox.y + stageBox.height - 150, {
        holdMsBeforeUp: 150,
      });
      await dragPetTo(page, stageBox.x + 420, stageBox.y + stageBox.height - 60, {
        steps: 5,
        stepMs: 10,
      });

      await stepClock(page, 1500);
      const x1 = (await getBox(getPet(page))).x;
      await stepClock(page, 300);
      const x2 = (await getBox(getPet(page))).x;
      // Slide has decelerated to rest (or near-rest unless walking)
      expect(Math.abs(x2 - x1)).toBeLessThan(80);
    });

    test('T1-F2-04: Wall bounce reverses horizontal direction', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      // Move near right side and fling right into right wall
      await dragPetTo(
        page,
        stageBox.x + stageBox.width - 220,
        stageBox.y + 200,
        { holdMsBeforeUp: 120 }
      );
      await dragPetTo(
        page,
        stageBox.x + stageBox.width - 10,
        stageBox.y + 200,
        { steps: 4, stepMs: 8 }
      );

      const xs: number[] = [];
      for (let i = 0; i < 20; i++) {
        xs.push((await getBox(getPet(page))).x);
        await stepClock(page, 16);
      }

      const maxX = Math.max(...xs);
      const maxIdx = xs.indexOf(maxX);
      const minAfterWall = Math.min(...xs.slice(maxIdx));
      expect(maxX - minAfterWall).toBeGreaterThan(5);
    });

    test('T1-F2-05: Treat falls under gravity and lands', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await page.mouse.dblclick(stageBox.x + 140, stageBox.y + 80);
      const treat = getTreats(page).first();
      await expect(treat).toBeVisible();

      const yStart = (await getBox(treat)).y;
      await stepClock(page, 300);
      const yMid = (await getBox(treat)).y;
      expect(yMid).toBeGreaterThan(yStart);

      await stepClock(page, 1500);
      if ((await getTreats(page).count()) > 0) {
        const yEnd = (await getBox(treat)).y;
        expect(yEnd).toBeLessThanOrEqual(stageBox.y + stageBox.height);
      }
    });
  });

  test.describe('F3: Throw Velocity Estimation', () => {
    test('T1-F3-01: Rightward fling imparts rightward trajectory', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 120, stageBox.y + 100, {
        holdMsBeforeUp: 120,
      });
      await dragPetTo(page, stageBox.x + 360, stageBox.y + 100, {
        steps: 5,
        stepMs: 12,
      });

      const releaseX = (await getBox(getPet(page))).x;
      await stepClock(page, 120);
      const afterX = (await getBox(getPet(page))).x;
      expect(afterX).toBeGreaterThan(releaseX + 20);
    });

    test('T1-F3-02: Upward-left fling imparts upward-left arc', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 320, stageBox.y + 420, {
        holdMsBeforeUp: 120,
      });
      await dragPetTo(page, stageBox.x + 140, stageBox.y + 240, {
        steps: 5,
        stepMs: 12,
      });

      const releaseBox = await getBox(getPet(page));
      await stepClock(page, 80);
      const arcBox = await getBox(getPet(page));
      expect(arcBox.x).toBeLessThan(releaseBox.x - 10);
      expect(arcBox.y).toBeLessThan(releaseBox.y - 5);
    });

    test('T1-F3-03: Hold-still before release drops straight down', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 400, stageBox.y + 120, {
        steps: 4,
        stepMs: 10,
        holdMsBeforeUp: 200,
      });

      const releaseX = (await getBox(getPet(page))).x;
      await stepClock(page, 300);
      const fallX = (await getBox(getPet(page))).x;
      expect(Math.abs(fallX - releaseX)).toBeLessThan(15);
    });

    test('T1-F3-04: Gentle release produces minimal throw', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      // Move very slowly (< 50 px/s) before release
      await dragPetTo(page, stageBox.x + 150, stageBox.y + 150, {
        steps: 5,
        stepMs: 100,
        holdMsBeforeUp: 50,
      });

      const releaseX = (await getBox(getPet(page))).x;
      await stepClock(page, 200);
      const afterX = (await getBox(getPet(page))).x;
      expect(Math.abs(afterX - releaseX)).toBeLessThan(25);
    });

    test('T1-F3-05: Extreme pointer speed is clamped safely', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(
        page,
        stageBox.x + stageBox.width - 30,
        stageBox.y + 30,
        { steps: 2, stepMs: 8 }
      );

      for (let i = 0; i < 20; i++) {
        const box = await getBox(getPet(page));
        expect(Number.isNaN(box.x)).toBe(false);
        expect(Number.isNaN(box.y)).toBe(false);
        expect(box.x).toBeGreaterThanOrEqual(stageBox.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(
          stageBox.x + stageBox.width + 1
        );
        expect(box.y).toBeGreaterThanOrEqual(stageBox.y - 1);
        expect(box.y + box.height).toBeLessThanOrEqual(
          stageBox.y + stageBox.height + 1
        );
        await stepClock(page, 24);
      }
    });
  });

  test.describe('F4: Clock Element Platform Colliders', () => {
    test('T1-F4-01: Pet lands on top of #hours', async ({ page }) => {
      await setupClock(page);
      const hoursBox = await getBox(getHours(page));

      await dragPetTo(
        page,
        hoursBox.x + hoursBox.width / 2,
        hoursBox.y - 40,
        { holdMsBeforeUp: 150 }
      );
      await stepClock(page, 1200);

      const petBox = await getBox(getPet(page));
      const state = await getPetState(page);
      expect(state).toBe('perched');
      expect(petBox.y + petBox.height).toBeGreaterThanOrEqual(hoursBox.y - 10);
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(
        hoursBox.y + hoursBox.height * 0.5
      );
    });

    test('T1-F4-02: Pet lands on #date and #seconds', async ({ page }) => {
      await setupClock(page);
      const dateBox = await getBox(getDate(page));

      await dragPetTo(page, dateBox.x + dateBox.width / 2, dateBox.y - 35, {
        holdMsBeforeUp: 150,
      });
      await stepClock(page, 1200);

      let petBox = await getBox(getPet(page));
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(
        dateBox.y + dateBox.height + 5
      );

      const secondsBox = await getBox(getSeconds(page));
      await dragPetTo(
        page,
        secondsBox.x + secondsBox.width / 2,
        secondsBox.y - 35,
        { holdMsBeforeUp: 150 }
      );
      await stepClock(page, 1200);

      petBox = await getBox(getPet(page));
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(
        secondsBox.y + secondsBox.height + 5
      );
    });

    test('T1-F4-03: Pet lands on .controls .pill buttons', async ({ page }) => {
      await setupClock(page);
      const formatBox = await getBox(getToggleFormat(page));
      const stageBox = await getBox(getStage(page));

      await dragPetTo(
        page,
        formatBox.x + formatBox.width / 2,
        formatBox.y - 35,
        { holdMsBeforeUp: 150 }
      );
      await stepClock(page, 1200);

      const petBox = await getBox(getPet(page));
      // Should perch on the pill above the stage floor
      expect(petBox.y + petBox.height).toBeLessThan(
        stageBox.y + stageBox.height - 10
      );
      expect(Math.abs(petBox.y + petBox.height - formatBox.y)).toBeLessThan(20);
    });

    test('T1-F4-04: One-way pass-through from below', async ({ page }) => {
      await setupClock(page);
      const hoursBox = await getBox(getHours(page));
      const startCenter = centerOf(hoursBox);

      // Position pet directly below #hours
      await dragPetTo(page, startCenter.x, hoursBox.y + hoursBox.height + 70, {
        holdMsBeforeUp: 150,
      });
      await stepClock(page, 300);

      // Fling upward through #hours
      await dragPetTo(page, startCenter.x, hoursBox.y - 20, {
        steps: 4,
        stepMs: 10,
      });
      await stepClock(page, 1400);

      const petBox = await getBox(getPet(page));
      // Should have passed through and landed on top of #hours (or above it)
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(
        hoursBox.y + hoursBox.height * 0.6
      );
    });

    test('T1-F4-05: High-speed side/bottom deflection', async ({ page }) => {
      await setupClock(page);
      const minutesBox = await getBox(getMinutes(page));
      const minCenter = centerOf(minutesBox);

      // Place pet to the left of #minutes and throw horizontally into its side
      await dragPetTo(page, minutesBox.x - 160, minCenter.y, {
        holdMsBeforeUp: 120,
      });
      await dragPetTo(page, minutesBox.x - 10, minCenter.y, {
        steps: 4,
        stepMs: 8,
      });

      let deflectedLeft = false;
      let prevX = (await getBox(getPet(page))).x;
      for (let i = 0; i < 20; i++) {
        await stepClock(page, 16);
        const curX = (await getBox(getPet(page))).x;
        if (curX < prevX) {
          deflectedLeft = true;
        }
        prevX = curX;
      }

      const finalBox = await getBox(getPet(page));
      // Either deflected back left or stopped before tunneling through #minutes
      expect(
        deflectedLeft || finalBox.x + finalBox.width <= minutesBox.x + minutesBox.width
      ).toBe(true);
    });
  });
});
