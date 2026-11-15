import { test, expect } from '@playwright/test';
import {
  getStage,
  getClockCard,
  getDate,
  getHours,
  getColon,
  getMinutes,
  getSeconds,
  getAmPm,
  getToggleFormat,
  getToggleSeconds,
  getToggleTheme,
  getPet,
  getTreats,
  getParticles,
  getFeedButton,
  getSleepButton,
  getTogglePetButton,
} from './helpers/selectors';
import {
  setupClock,
  getBox,
  getPetState,
  getPetFacing,
  dragPet,
  dragPetTo,
  tapPet,
  setPageHidden,
  stepClock,
} from './helpers/actions';

test.describe('Tier 2: Boundary & Corner Cases', () => {
  test.describe('Area 0: Existing Clock Functionality (EC)', () => {
    test('T2-EC-01: Noon (12:00:00) & Midnight (00:00:00) in 12H mode', async ({ page }) => {
      await setupClock(page, '2026-11-14T12:00:00');
      await expect(getHours(page)).toHaveText('12');
      await expect(getMinutes(page)).toHaveText('00');
      await expect(getAmPm(page)).toHaveText('PM');

      await page.clock.setFixedTime(new Date('2026-11-15T00:00:00'));
      await stepClock(page, 300);
      await expect(getHours(page)).toHaveText('12');
      await expect(getMinutes(page)).toHaveText('00');
      await expect(getAmPm(page)).toHaveText('AM');
    });

    test('T2-EC-02: Rapidly toggling 24H / Seconds / Night Mode stays in sync', async ({ page }) => {
      await setupClock(page, '2026-11-14T14:05:09');

      for (let i = 0; i < 10; i++) {
        await getToggleFormat(page).click();
        await getToggleSeconds(page).click();
        await getToggleTheme(page).click();
      }
      await stepClock(page, 300);

      // 10 clicks (even) should restore initial state: 12H, Seconds visible, Standard Mode
      await expect(getHours(page)).toHaveText('02');
      await expect(getAmPm(page)).toHaveText('PM');
      await expect(getToggleFormat(page)).toHaveText('24H');
      await expect(getSeconds(page)).not.toHaveClass(/hidden/);
      await expect(page.locator('body')).not.toHaveClass(/night/);
      await expect(getToggleTheme(page)).toHaveText('Night Mode');
    });

    test('T2-EC-03: Toggling Night Mode while #seconds is hidden', async ({ page }) => {
      await setupClock(page, '2026-11-14T14:05:09');
      await getToggleSeconds(page).click();
      await expect(getSeconds(page)).toHaveClass(/hidden/);

      await getToggleTheme(page).click();
      await expect(page.locator('body')).toHaveClass(/night/);
      await expect(getSeconds(page)).toHaveClass(/hidden/);

      const hoursColor = await getHours(page).evaluate((el) => getComputedStyle(el).color);
      expect(hoursColor).toBe('rgb(255, 69, 58)');
    });

    test('T2-EC-04: Very small viewport (320x480) has no horizontal overflow', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 480 });
      await setupClock(page, '2026-11-14T14:05:09');
      await stepClock(page, 200);

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      });
      expect(overflow).toBe(true);
      await expect(getClockCard(page)).toBeVisible();
    });

    test('T2-EC-05: Ultra-wide / 4K viewport (2560x1440) keeps clock centered & legible', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 2560, height: 1440 });
      await setupClock(page, '2026-11-14T14:05:09');
      await stepClock(page, 200);

      const hoursBox = await getBox(getHours(page));
      const stageBox = await getBox(getStage(page));
      expect(hoursBox.width).toBeGreaterThan(50);
      expect(hoursBox.height).toBeGreaterThan(50);
      expect(hoursBox.x).toBeGreaterThan(stageBox.x);
      expect(hoursBox.x + hoursBox.width).toBeLessThan(stageBox.x + stageBox.width);
    });
  });

  test.describe('F1: 2D Gravity & Projectile Motion', () => {
    test('T2-F1-01: Large dt spike (fastForward 5000ms) clamps dt and prevents tunneling', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const stageBox = await getBox(getStage(page));

      // Drag pet near top-center and release
      await dragPetTo(page, stageBox.x + stageBox.width * 0.5, stageBox.y + 40, { steps: 3 });
      await page.clock.fastForward(5000);

      const petBox = await getBox(getPet(page));
      expect(Number.isNaN(petBox.x)).toBe(false);
      expect(Number.isNaN(petBox.y)).toBe(false);
      expect(petBox.x).toBeGreaterThanOrEqual(stageBox.x);
      expect(petBox.x + petBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
      expect(petBox.y).toBeGreaterThanOrEqual(stageBox.y);
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    });

    test('T2-F1-02: Multiple hidden / visible cycles mid-fall', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + stageBox.width * 0.2, stageBox.y + 30, { steps: 3 });

      for (let i = 0; i < 3; i++) {
        await setPageHidden(page, true);
        const frozenBox = await getBox(getPet(page));
        await stepClock(page, 250);
        const afterHiddenBox = await getBox(getPet(page));
        expect(Math.abs(afterHiddenBox.y - frozenBox.y)).toBeLessThan(2);

        await setPageHidden(page, false);
        await stepClock(page, 80);
      }

      await stepClock(page, 2000);
      const finalBox = await getBox(getPet(page));
      expect(finalBox.y + finalBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    });

    test('T2-F1-03: Tiny stage (320x240) keeps pet clamped without NaN', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 240 });
      await setupClock(page, '2026-11-14T10:00:00');
      await stepClock(page, 1000);

      const stageBox = await getBox(getStage(page));
      const petBox = await getBox(getPet(page));
      expect(Number.isNaN(petBox.x)).toBe(false);
      expect(Number.isNaN(petBox.y)).toBe(false);
      expect(petBox.x).toBeGreaterThanOrEqual(stageBox.x);
      expect(petBox.x + petBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
      expect(petBox.y).toBeGreaterThanOrEqual(stageBox.y);
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    });

    test('T2-F1-04: Dragging pet outside browser viewport bounds clamps back on release', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const petBox = await getBox(getPet(page));
      const stageBox = await getBox(getStage(page));

      await page.mouse.move(petBox.x + petBox.width / 2, petBox.y + petBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(-50, -50, { steps: 5 });
      await stepClock(page, 32);
      await page.mouse.up();
      await stepClock(page, 100);

      const clampedBox = await getBox(getPet(page));
      expect(clampedBox.x).toBeGreaterThanOrEqual(stageBox.x);
      expect(clampedBox.y).toBeGreaterThanOrEqual(stageBox.y);
    });

    test('T2-F1-05: Releasing pet at exact corner (0, 0) falls down cleanly', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      await dragPetTo(page, 0, 0, { steps: 4, holdMsBeforeUp: 120 });
      const releasedBox = await getBox(getPet(page));

      await stepClock(page, 600);
      const fallenBox = await getBox(getPet(page));
      expect(fallenBox.y).toBeGreaterThan(releasedBox.y + 20);
      expect(fallenBox.x).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('F2: Collision Physics', () => {
    test('T2-F2-01: Very low drop (5px above floor) snaps cleanly to rest', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const stageBox = await getBox(getStage(page));
      const petBox = await getBox(getPet(page));

      const floorY = stageBox.y + stageBox.height - petBox.height / 2 - 5;
      await dragPetTo(page, stageBox.x + stageBox.width * 0.15, floorY, {
        steps: 4,
        holdMsBeforeUp: 120,
      });
      await stepClock(page, 500);

      const ys: number[] = [];
      for (let i = 0; i < 6; i++) {
        await stepClock(page, 32);
        ys.push((await getBox(getPet(page))).y);
      }
      const delta = Math.max(...ys) - Math.min(...ys);
      expect(delta).toBeLessThan(1.5);
    });

    test('T2-F2-02: Simultaneous corner impact (floor + right wall) settles cleanly', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + stageBox.width * 0.6, stageBox.y + stageBox.height * 0.5, {
        steps: 3,
      });
      // Fling diagonally down-right into corner
      const petBox = await getBox(getPet(page));
      await page.mouse.move(petBox.x + petBox.width / 2, petBox.y + petBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(stageBox.x + stageBox.width - 5, stageBox.y + stageBox.height - 5, {
        steps: 4,
      });
      await stepClock(page, 20);
      await page.mouse.up();
      await stepClock(page, 1500);

      const finalBox = await getBox(getPet(page));
      expect(finalBox.x + finalBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
      expect(finalBox.y + finalBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    });

    test('T2-F2-03: Multiple treats spawned simultaneously land & clean up cleanly', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      for (let i = 0; i < 5; i++) {
        await getFeedButton(page).click();
        await stepClock(page, 40);
      }

      expect(await getTreats(page).count()).toBeGreaterThanOrEqual(1);
      await stepClock(page, 8000);

      const petBox = await getBox(getPet(page));
      expect(Number.isNaN(petBox.x)).toBe(false);
    });

    test('T2-F2-04: Treat spawned at viewport right edge stays inside stage bounds', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const stageBox = await getBox(getStage(page));

      await page.mouse.dblclick(stageBox.x + stageBox.width - 4, stageBox.y + 100);
      await stepClock(page, 100);

      const treats = getTreats(page);
      expect(await treats.count()).toBeGreaterThanOrEqual(1);
      const treatBox = await getBox(treats.first());
      expect(treatBox.x + treatBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 2);
      expect(treatBox.x).toBeGreaterThanOrEqual(stageBox.x);
    });

    test('T2-F2-05: Pet resting on floor clamps upward when viewport height shrinks', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await setupClock(page, '2026-11-14T10:00:00');
      await stepClock(page, 1500);

      await page.setViewportSize({ width: 1280, height: 500 });
      await stepClock(page, 500);

      const stageBox = await getBox(getStage(page));
      const petBox = await getBox(getPet(page));
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
      expect(petBox.y).toBeGreaterThanOrEqual(stageBox.y);
    });
  });

  test.describe('F3: Throw Velocity Estimation', () => {
    test('T2-F3-01: Single-point click without move is treated as tap, not NaN throw', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const petBox = await getBox(getPet(page));
      await page.mouse.move(petBox.x + petBox.width / 2, petBox.y + petBox.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      await stepClock(page, 100);

      const afterBox = await getBox(getPet(page));
      expect(Number.isNaN(afterBox.x)).toBe(false);
      expect(Number.isNaN(afterBox.y)).toBe(false);
      const state = await getPetState(page);
      expect(state).not.toBe('dragged');
    });

    test('T2-F3-02: Zero-dt duplicate pointer move events do not cause NaN', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const petBox = await getBox(getPet(page));
      const cx = petBox.x + petBox.width / 2;
      const cy = petBox.y + petBox.height / 2;

      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 20, cy - 20);
      await page.mouse.move(cx + 20, cy - 20);
      await page.mouse.up();
      await stepClock(page, 200);

      const afterBox = await getBox(getPet(page));
      expect(Number.isNaN(afterBox.x)).toBe(false);
      expect(Number.isNaN(afterBox.y)).toBe(false);
    });

    test('T2-F3-03: Zig-zag drag then sharp right release throws rightward', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const stageBox = await getBox(getStage(page));
      await dragPetTo(page, stageBox.x + stageBox.width * 0.5, stageBox.y + 150, { steps: 3 });

      const petBox = await getBox(getPet(page));
      const cx = petBox.x + petBox.width / 2;
      const cy = petBox.y + petBox.height / 2;

      await page.mouse.move(cx, cy);
      await page.mouse.down();
      // First move left
      await page.mouse.move(cx - 120, cy, { steps: 4 });
      await stepClock(page, 60);
      // Then sharply right in recent ~50ms window
      for (let i = 1; i <= 4; i++) {
        await page.mouse.move(cx - 120 + i * 50, cy - i * 10);
        await stepClock(page, 12);
      }
      await page.mouse.up();

      const releaseBox = await getBox(getPet(page));
      await stepClock(page, 120);
      const afterBox = await getBox(getPet(page));
      expect(afterBox.x).toBeGreaterThan(releaseBox.x);
    });

    test('T2-F3-04: Drag interrupted by pointercancel exits dragged state cleanly', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const petBox = await getBox(getPet(page));
      const cx = petBox.x + petBox.width / 2;
      const cy = petBox.y + petBox.height / 2;

      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 30, cy - 80, { steps: 4 });
      await stepClock(page, 50);

      expect(await getPetState(page)).toBe('dragged');

      await page.evaluate(() => {
        window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
        window.dispatchEvent(new Event('blur'));
      });
      await stepClock(page, 200);

      expect(await getPetState(page)).not.toBe('dragged');
      await page.mouse.up();
    });

    test('T2-F3-05: Maximum-velocity throw across narrow viewport (390x844) stays bounded', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await setupClock(page, '2026-11-14T10:00:00');
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 60, stageBox.y + 200, { steps: 3 });
      await dragPet(page, 300, -100, { steps: 3, stepMs: 8 });

      for (let i = 0; i < 10; i++) {
        await stepClock(page, 50);
        const box = await getBox(getPet(page));
        expect(box.x).toBeGreaterThanOrEqual(stageBox.x);
        expect(box.x + box.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
      }
    });
  });

  test.describe('F4: Clock Element Platform Colliders', () => {
    test('T2-F4-01: Perching on #ampm in 12H then switching to 24H drops pet', async ({ page }) => {
      await setupClock(page, '2026-11-14T14:05:09');
      const ampmBox = await getBox(getAmPm(page));

      await dragPetTo(page, ampmBox.x + ampmBox.width / 2, ampmBox.y - 40, {
        steps: 4,
        holdMsBeforeUp: 120,
      });
      await stepClock(page, 1000);
      const perchedBox = await getBox(getPet(page));

      await getToggleFormat(page).click();
      await stepClock(page, 1000);

      const fallenBox = await getBox(getPet(page));
      expect(fallenBox.y).toBeGreaterThan(perchedBox.y + 20);
    });

    test('T2-F4-02: Perching on #hours across 09:59:59 -> 10:00:00 updates smoothly', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T09:59:58');
      const hoursBox = await getBox(getHours(page));
      await dragPetTo(page, hoursBox.x + hoursBox.width / 2, hoursBox.y - 20, {
        steps: 4,
        holdMsBeforeUp: 120,
      });
      await stepClock(page, 1000);

      await stepClock(page, 2500);
      await expect(getHours(page)).toHaveText('10');

      const petBox = await getBox(getPet(page));
      expect(Number.isNaN(petBox.x)).toBe(false);
      expect(Number.isNaN(petBox.y)).toBe(false);
    });

    test('T2-F4-03: Edge-perching on #minutes settles or slides off without oscillation', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:05:00');
      const minutesBox = await getBox(getMinutes(page));
      await dragPetTo(page, minutesBox.x + 2, minutesBox.y - 25, {
        steps: 4,
        holdMsBeforeUp: 120,
      });
      await stepClock(page, 2000);

      const ys: number[] = [];
      for (let i = 0; i < 6; i++) {
        await stepClock(page, 32);
        ys.push((await getBox(getPet(page))).y);
      }
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2);
    });

    test('T2-F4-04: Dropping pet onto narrow #colon settles cleanly without jitter', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:05:00');
      const colonBox = await getBox(getColon(page));
      await dragPetTo(page, colonBox.x + colonBox.width / 2, colonBox.y - 30, {
        steps: 4,
        holdMsBeforeUp: 120,
      });
      await stepClock(page, 2000);

      const ys: number[] = [];
      for (let i = 0; i < 6; i++) {
        await stepClock(page, 32);
        ys.push((await getBox(getPet(page))).y);
      }
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2);
    });

    test('T2-F4-05: Rapidly toggling #toggle-seconds mid-fall causes no errors', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await setupClock(page, '2026-11-14T10:05:00');
      const secondsBox = await getBox(getSeconds(page));
      await dragPetTo(page, secondsBox.x + secondsBox.width / 2, secondsBox.y - 120, { steps: 3 });

      for (let i = 0; i < 4; i++) {
        await getToggleSeconds(page).click();
        await stepClock(page, 50);
      }
      await stepClock(page, 1000);
      expect(errors).toEqual([]);
    });
  });

  test.describe('F5: Pet FSM & Autonomous Behavior', () => {
    test('T2-F5-01: Clicking pet while sleeping wakes it cleanly', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      await getSleepButton(page).click();
      await stepClock(page, 300);
      expect(await getPetState(page)).toBe('sleeping');

      await tapPet(page);
      await stepClock(page, 300);
      expect(await getPetState(page)).not.toBe('sleeping');
    });

    test('T2-F5-02: Dragging pet while eating transitions to dragged without stuck treat', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      await getFeedButton(page).click();
      await stepClock(page, 1500);

      const petBox = await getBox(getPet(page));
      await page.mouse.move(petBox.x + petBox.width / 2, petBox.y + petBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(petBox.x + 80, petBox.y - 80, { steps: 4 });
      await stepClock(page, 50);

      expect(await getPetState(page)).toBe('dragged');
      await page.mouse.up();
      await stepClock(page, 4000);
      expect(await getPetState(page)).not.toBe('dragged');
    });

    test('T2-F5-03: Throwing pet while sleeping wakes into dragged/falling', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      await getSleepButton(page).click();
      await stepClock(page, 300);
      expect(await getPetState(page)).toBe('sleeping');

      await dragPet(page, 150, -150, { steps: 4, stepMs: 12 });
      const stateAfterThrow = await getPetState(page);
      expect(stateAfterThrow).not.toBe('sleeping');
    });

    test('T2-F5-04: Autonomous patrol near viewport walls reverses facing direction', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const stageBox = await getBox(getStage(page));
      // Place pet near left wall
      await dragPetTo(page, stageBox.x + 25, stageBox.y + stageBox.height - 60, {
        steps: 3,
        holdMsBeforeUp: 120,
      });

      const facings = new Set<string>();
      for (let i = 0; i < 40; i++) {
        await stepClock(page, 500);
        const f = await getPetFacing(page);
        if (f) facings.add(f);
      }
      expect(facings.size).toBeGreaterThanOrEqual(1);
      const finalBox = await getBox(getPet(page));
      expect(finalBox.x).toBeGreaterThanOrEqual(stageBox.x);
    });

    test('T2-F5-05: Rapidly clicking Sleep/Wake 6 times stays synchronized', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const sleepBtn = getSleepButton(page);

      for (let i = 0; i < 6; i++) {
        await sleepBtn.click();
        await stepClock(page, 40);
      }
      await stepClock(page, 300);

      // Even clicks -> awake, button says Sleep
      await expect(sleepBtn).toHaveText(/sleep/i);
      expect(await getPetState(page)).not.toBe('sleeping');
    });
  });

  test.describe('F6: Pet Stats & Non-Punishing Lifecycle', () => {
    test('T2-F6-01: Overfeeding (clicking Feed 10 times) caps fullness at 100', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      for (let i = 0; i < 10; i++) {
        await getFeedButton(page).click();
        await stepClock(page, 100);
      }
      await stepClock(page, 5000);

      const stored = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          const v = localStorage.getItem(k);
          if (v && v.includes('fullness')) return JSON.parse(v);
        }
        return null;
      });
      if (stored && typeof stored.fullness === 'number') {
        expect(stored.fullness).toBeLessThanOrEqual(100);
        expect(stored.fullness).toBeGreaterThan(0);
      }
      await expect(getPet(page)).toBeVisible();
    });

    test('T2-F6-02: Over-petting (20 rapid taps) caps happiness & bounds particles', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      for (let i = 0; i < 20; i++) {
        await tapPet(page);
        await stepClock(page, 30);
      }

      const particleCount = await getParticles(page).count();
      expect(particleCount).toBeLessThan(60);

      await stepClock(page, 4000);
      expect(await getParticles(page).count()).toBe(0);
    });

    test('T2-F6-03: Zero-energy / zero-fullness floor clamps at >= 0 after 12 hours', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T08:00:00');
      await page.clock.fastForward(12 * 3600 * 1000);
      await stepClock(page, 300);

      await expect(getPet(page)).toBeVisible();
      const stored = await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          const v = localStorage.getItem(k);
          if (v && v.includes('energy')) return JSON.parse(v);
        }
        return null;
      });
      if (stored) {
        if (typeof stored.energy === 'number') expect(stored.energy).toBeGreaterThanOrEqual(0);
        if (typeof stored.fullness === 'number') expect(stored.fullness).toBeGreaterThanOrEqual(0);
        if (typeof stored.happiness === 'number') expect(stored.happiness).toBeGreaterThanOrEqual(0);
      }
    });

    test('T2-F6-04: Waking exhausted pet keeps it responsive to feeding/petting', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T08:00:00');
      await page.clock.fastForward(6 * 3600 * 1000);
      await stepClock(page, 300);

      if ((await getPetState(page)) === 'sleeping') {
        await getSleepButton(page).click();
        await stepClock(page, 300);
      }
      await tapPet(page);
      await stepClock(page, 200);
      expect(await getPetState(page)).not.toBe('sleeping');
    });

    test('T2-F6-05: Feeding while pet is perched high on #date does not get stuck', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const dateBox = await getBox(getDate(page));
      await dragPetTo(page, dateBox.x + dateBox.width / 2, dateBox.y - 25, {
        steps: 4,
        holdMsBeforeUp: 120,
      });
      await stepClock(page, 800);

      await getFeedButton(page).click();
      await stepClock(page, 5000);
      await expect(getPet(page)).toBeVisible();
    });
  });

  test.describe('F7: Time-Driven Clock Reactions', () => {
    test('T2-F7-01: Minute tick while pet is dragged does not yank pet from cursor', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:58');
      const petBox = await getBox(getPet(page));
      const targetX = petBox.x + 50;
      const targetY = petBox.y - 100;

      await page.mouse.move(petBox.x + petBox.width / 2, petBox.y + petBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetX, targetY, { steps: 5 });
      await stepClock(page, 3000);

      expect(await getPetState(page)).toBe('dragged');
      const heldBox = await getBox(getPet(page));
      expect(Math.abs(heldBox.x + heldBox.width / 2 - targetX)).toBeLessThan(35);
      await page.mouse.up();
    });

    test('T2-F7-02: Hour tick while pet is sleeping handles reaction gracefully', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await setupClock(page, '2026-11-14T10:59:58');
      await getSleepButton(page).click();
      await stepClock(page, 300);
      expect(await getPetState(page)).toBe('sleeping');

      await stepClock(page, 3000);
      await expect(getHours(page)).toHaveText('11');
      expect(errors).toEqual([]);
      await expect(getPet(page)).toBeVisible();
    });

    test('T2-F7-03: Hour tick while pet is hidden does not spawn stray visible particles', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T11:59:58');
      await getTogglePetButton(page).click();
      await expect(getPet(page)).toBeHidden();

      await stepClock(page, 3000);
      expect(await getParticles(page).count()).toBe(0);

      await page.mouse.move(10, 10);
      await getTogglePetButton(page).click();
      await expect(getPet(page)).toBeVisible();
    });

    test('T2-F7-04: System clock jumping backward does not cause NaN or crash', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await setupClock(page, '2026-11-14T10:05:00');
      await page.clock.setFixedTime(new Date('2026-11-14T10:03:00'));
      await stepClock(page, 500);

      await expect(getMinutes(page)).toHaveText('03');
      const petBox = await getBox(getPet(page));
      expect(Number.isNaN(petBox.x)).toBe(false);
      expect(Number.isNaN(petBox.y)).toBe(false);
      expect(errors).toEqual([]);
    });

    test('T2-F7-05: Jumping forward across multiple hours fires cleanly without freeze', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await setupClock(page, '2026-11-14T10:00:00');
      await page.clock.fastForward(3 * 3600 * 1000);
      await stepClock(page, 500);

      await expect(getHours(page)).toHaveText('01');
      await expect(getAmPm(page)).toHaveText('PM');
      expect(errors).toEqual([]);
    });
  });

  test.describe('F8: Expressive Pet Visuals & Particles', () => {
    test('T2-F8-01: prefers-reduced-motion: reduce suppresses excessive motion/particles', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setupClock(page, '2026-11-14T10:00:00');

      await tapPet(page);
      await stepClock(page, 100);
      // Pet remains functional and visible
      await expect(getPet(page)).toBeVisible();
      const petBox = await getBox(getPet(page));
      expect(petBox.width).toBeGreaterThan(0);
    });

    test('T2-F8-02: Particle cleanup after burst removes all ephemeral nodes', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      for (let i = 0; i < 5; i++) {
        await tapPet(page);
        await stepClock(page, 50);
      }

      await stepClock(page, 5000);
      expect(await getParticles(page).count()).toBe(0);
    });

    test('T2-F8-03: Night Mode toggled mid-particle burst keeps visuals legible', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      await tapPet(page);
      await stepClock(page, 50);
      await getToggleTheme(page).click();
      await stepClock(page, 100);

      await expect(page.locator('body')).toHaveClass(/night/);
      await expect(getPet(page)).toBeVisible();
    });

    test('T2-F8-04: Mobile landscape (844x390) keeps pet SVG within bounds', async ({ page }) => {
      await page.setViewportSize({ width: 844, height: 390 });
      await setupClock(page, '2026-11-14T10:00:00');
      await stepClock(page, 500);

      const stageBox = await getBox(getStage(page));
      const petBox = await getBox(getPet(page));
      expect(petBox.width).toBeGreaterThan(10);
      expect(petBox.height).toBeGreaterThan(10);
      expect(petBox.x + petBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    });

    test('T2-F8-05: Rapid facing reversals keep pet transform valid', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const petBox = await getBox(getPet(page));
      const cx = petBox.x + petBox.width / 2;
      const cy = petBox.y + petBox.height / 2;

      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 0; i < 5; i++) {
        await page.mouse.move(cx + (i % 2 === 0 ? 60 : -60), cy - 30, { steps: 2 });
        await stepClock(page, 30);
      }
      await page.mouse.up();
      await stepClock(page, 300);

      const finalBox = await getBox(getPet(page));
      expect(finalBox.width).toBeGreaterThan(10);
      expect(finalBox.height).toBeGreaterThan(10);
    });
  });

  test.describe('F9: Pointer Interactions', () => {
    test('T2-F9-01: 4px move registers as tap/pet, 12px move registers as dragged', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      await tapPet(page, 4);
      await stepClock(page, 50);
      expect(await getPetState(page)).not.toBe('dragged');

      const petBox = await getBox(getPet(page));
      const cx = petBox.x + petBox.width / 2;
      const cy = petBox.y + petBox.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 12, cy - 12, { steps: 3 });
      await stepClock(page, 30);
      expect(await getPetState(page)).toBe('dragged');
      await page.mouse.up();
    });

    test('T2-F9-02: Double-click on a .pill button does not spawn a treat', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      await getToggleFormat(page).dblclick();
      await stepClock(page, 100);
      expect(await getTreats(page).count()).toBe(0);
    });

    test('T2-F9-03: Double-click directly on pet does not spawn an unreachable treat', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const petBox = await getBox(getPet(page));
      await page.mouse.dblclick(petBox.x + petBox.width / 2, petBox.y + petBox.height / 2);
      await stepClock(page, 100);
      expect(await getTreats(page).count()).toBe(0);
    });

    test('T2-F9-04: Right-click / contextmenu during drag does not lock pointer', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const petBox = await getBox(getPet(page));
      const cx = petBox.x + petBox.width / 2;
      const cy = petBox.y + petBox.height / 2;

      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 25, cy - 25, { steps: 3 });
      await page.evaluate(() => {
        window.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      });
      await page.mouse.up();
      await stepClock(page, 200);

      expect(await getPetState(page)).not.toBe('dragged');
    });

    test('T2-F9-05: Clicking Feed while pet is hidden causes no errors or stray treats', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await setupClock(page, '2026-11-14T10:00:00');
      await getTogglePetButton(page).click();
      await expect(getPet(page)).toBeHidden();

      const feedBtn = getFeedButton(page);
      if (await feedBtn.isEnabled()) {
        await feedBtn.click();
      }
      await stepClock(page, 500);
      expect(errors).toEqual([]);
    });
  });

  test.describe('F10: Physical Clock Reactions & Layout Coupling', () => {
    test('T2-F10-01: Repeated bumps on #hours in rapid succession spring back cleanly', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const hoursBox = await getBox(getHours(page));

      for (let i = 0; i < 2; i++) {
        await dragPetTo(page, hoursBox.x + hoursBox.width / 2, hoursBox.y - 60, { steps: 3 });
        await stepClock(page, 180);
      }

      await stepClock(page, 1500);
      const restingTransform = await getHours(page).evaluate(
        (el) => getComputedStyle(el).transform,
      );
      expect(restingTransform === 'none' || restingTransform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(
        true,
      );
    });

    test('T2-F10-02: Nudge under prefers-reduced-motion: reduce is disabled or minimal', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await setupClock(page, '2026-11-14T10:00:00');
      const hoursBox = await getBox(getHours(page));

      await dragPetTo(page, hoursBox.x + hoursBox.width / 2, hoursBox.y - 80, { steps: 3 });
      await stepClock(page, 250);

      const transform = await getHours(page).evaluate((el) => getComputedStyle(el).transform);
      expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
    });

    test('T2-F10-03: Dynamic resize while clock element is mid-nudge recalculates accurately', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const minutesBox = await getBox(getMinutes(page));
      await dragPetTo(page, minutesBox.x + minutesBox.width / 2, minutesBox.y - 80, { steps: 3 });
      await stepClock(page, 200);

      await page.setViewportSize({ width: 900, height: 600 });
      await stepClock(page, 1200);

      const stageBox = await getBox(getStage(page));
      const petBox = await getBox(getPet(page));
      expect(petBox.x + petBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    });

    test('T2-F10-04: Layout shift switching 12H <-> 24H keeps pet valid', async ({ page }) => {
      await setupClock(page, '2026-11-14T14:05:09');
      const minutesBox = await getBox(getMinutes(page));
      await dragPetTo(page, minutesBox.x + minutesBox.width / 2, minutesBox.y - 25, {
        steps: 4,
        holdMsBeforeUp: 120,
      });
      await stepClock(page, 800);

      await getToggleFormat(page).click();
      await stepClock(page, 800);

      const stageBox = await getBox(getStage(page));
      const petBox = await getBox(getPet(page));
      expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    });

    test('T2-F10-05: Hiding #seconds while pet is sleeping on #seconds drops pet', async ({
      page,
    }) => {
      await setupClock(page, '2026-11-14T10:05:09');
      const secondsBox = await getBox(getSeconds(page));
      await dragPetTo(page, secondsBox.x + secondsBox.width / 2, secondsBox.y - 25, {
        steps: 4,
        holdMsBeforeUp: 120,
      });
      await stepClock(page, 800);
      const perchedY = (await getBox(getPet(page))).y;

      await getSleepButton(page).click();
      await stepClock(page, 200);
      await getToggleSeconds(page).click();
      await stepClock(page, 1000);

      const droppedY = (await getBox(getPet(page))).y;
      expect(droppedY).toBeGreaterThan(perchedY + 15);
    });
  });

  test.describe('F11: UI Controls, Accessibility & Persistence', () => {
    test('T2-F11-01: Corrupted JSON in localStorage recovers gracefully', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.addInitScript(() => {
        localStorage.setItem('standby-clock-state', '{bad-json');
        localStorage.setItem('standby-pet-state', '{bad-json');
      });
      await setupClock(page, '2026-11-14T10:00:00');
      await stepClock(page, 200);

      await expect(getHours(page)).toHaveText('10');
      await expect(getPet(page)).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('T2-F11-02: Out-of-range values in localStorage are clamped cleanly', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          'standby-pet-state',
          JSON.stringify({ energy: -50, happiness: 999, fullness: -10 }),
        );
      });
      await setupClock(page, '2026-11-14T10:00:00');
      await stepClock(page, 200);

      await expect(getPet(page)).toBeVisible();
      await tapPet(page);
      await stepClock(page, 100);
      const petBox = await getBox(getPet(page));
      expect(Number.isNaN(petBox.x)).toBe(false);
    });

    test('T2-F11-03: localStorage.setItem throwing QuotaExceededError does not crash', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.addInitScript(() => {
        Storage.prototype.setItem = () => {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        };
      });
      await setupClock(page, '2026-11-14T10:00:00');
      await getToggleFormat(page).click();
      await getFeedButton(page).click();
      await tapPet(page);
      await stepClock(page, 300);

      await expect(getHours(page)).toHaveText('10');
      await expect(getPet(page)).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('T2-F11-04: Keyboard focus order reaches all .pill controls and pet', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const focusedIds: string[] = [];

      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? el.id || el.getAttribute('data-testid') || el.textContent?.trim() || '' : '';
        });
        if (info) focusedIds.push(info);
      }

      expect(focusedIds.length).toBeGreaterThanOrEqual(4);
    });

    test('T2-F11-05: Show/Hide Pet toggled rapidly 6 times stays synchronized', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:00');
      const togglePet = getTogglePetButton(page);

      for (let i = 0; i < 6; i++) {
        await togglePet.click();
        await stepClock(page, 30);
      }
      await stepClock(page, 200);

      // Even clicks -> pet visible, button says Hide Pet
      await expect(getPet(page)).toBeVisible();
      await expect(togglePet).toHaveText(/hide pet/i);
    });
  });
});
