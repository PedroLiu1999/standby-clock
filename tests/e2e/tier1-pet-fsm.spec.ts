import { expect, test } from '@playwright/test';
import {
  getDate,
  getFeedButton,
  getHours,
  getMinutes,
  getParticles,
  getPet,
  getSeconds,
  getSleepButton,
  getStage,
  getToggleTheme,
  getTreats,
} from './helpers/selectors.js';
import {
  centerOf,
  dragPetTo,
  fastForwardClock,
  getBox,
  getPetFacing,
  getPetState,
  setupClock,
  stepClock,
  tapPet,
} from './helpers/actions.js';

test.describe('Tier 1 — Pet FSM, Lifecycle & Time Reactions (F5–F7)', () => {
  test.describe('F5: Pet FSM & Autonomous Behavior', () => {
    test('T1-F5-01: Autonomous transition from idle to walking', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 1200);

      const initialX = (await getBox(getPet(page))).x;
      let sawWalking = false;
      let xChanged = false;
      let sawFacing = false;

      for (let i = 0; i < 40; i++) {
        await stepClock(page, 250);
        const state = await getPetState(page);
        const facing = await getPetFacing(page);
        const curX = (await getBox(getPet(page))).x;
        if (state === 'walking') sawWalking = true;
        if (Math.abs(curX - initialX) > 5) xChanged = true;
        if (facing === 'left' || facing === 'right') sawFacing = true;
        if (sawWalking && xChanged && sawFacing) break;
      }

      expect(sawWalking || xChanged).toBe(true);
      expect(sawFacing).toBe(true);
    });

    test('T1-F5-02: Autonomous jumping / platform hopping', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 1200);

      let minY = (await getBox(getPet(page))).y;
      const startY = minY;
      let sawJumpState = false;

      for (let i = 0; i < 120; i++) {
        await stepClock(page, 250);
        const state = await getPetState(page);
        const curY = (await getBox(getPet(page))).y;
        if (state === 'jumping' || state === 'perched') {
          sawJumpState = true;
        }
        if (curY < minY) minY = curY;
        if (sawJumpState && startY - minY > 15) break;
      }

      expect(sawJumpState || startY - minY > 15).toBe(true);
    });

    test('T1-F5-03: dragged state while pointer held', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 1000);

      const petBox = await getBox(getPet(page));
      const start = centerOf(petBox);

      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 80, start.y - 120, { steps: 5 });
      await stepClock(page, 32);

      const state = await getPetState(page);
      expect(state).toBe('dragged');

      const draggedBox = await getBox(getPet(page));
      const draggedCenter = centerOf(draggedBox);
      expect(Math.abs(draggedCenter.x - (start.x + 80))).toBeLessThan(60);
      expect(Math.abs(draggedCenter.y - (start.y - 120))).toBeLessThan(60);

      await page.mouse.up();
    });

    test('T1-F5-04: happy state on petting', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 1000);

      await tapPet(page, 2);
      await stepClock(page, 32);

      const state = await getPetState(page);
      expect(state).toBe('happy');
      const particleCount = await getParticles(page).count();
      expect(particleCount).toBeGreaterThan(0);
    });

    test('T1-F5-05: eating state when reaching treat', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 1000);

      const petBox = await getBox(getPet(page));
      // Spawn treat right next to the grounded pet
      await page.mouse.dblclick(petBox.x + petBox.width + 25, petBox.y);
      await expect(getTreats(page).first()).toBeVisible();

      let sawEatingOrHappy = false;
      for (let i = 0; i < 40; i++) {
        await stepClock(page, 125);
        const state = await getPetState(page);
        if (state === 'eating' || state === 'happy') {
          sawEatingOrHappy = true;
        }
        if ((await getTreats(page).count()) === 0 && sawEatingOrHappy) {
          break;
        }
      }

      expect(sawEatingOrHappy).toBe(true);
      expect(await getTreats(page).count()).toBe(0);
    });
  });

  test.describe('F6: Pet Stats & Non-Punishing Lifecycle', () => {
    test('T1-F6-01: Feeding increases fullness / satisfies pet', async ({ page }) => {
      await setupClock(page);
      await fastForwardClock(page, 120_000);
      await stepClock(page, 100);

      const beforeStorage = await page.evaluate(() => JSON.stringify(localStorage));

      await page.mouse.move(10, 10);
      await getFeedButton(page).click();
      await expect(getTreats(page).first()).toBeVisible();

      for (let i = 0; i < 60; i++) {
        await stepClock(page, 150);
        if ((await getTreats(page).count()) === 0) break;
      }

      expect(await getTreats(page).count()).toBe(0);
      const afterStorage = await page.evaluate(() => JSON.stringify(localStorage));
      expect(afterStorage).not.toBe(beforeStorage);
    });

    test('T1-F6-02: Petting increases happiness', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 1000);

      for (let i = 0; i < 3; i++) {
        await tapPet(page, 2);
        await stepClock(page, 100);
      }

      const state = await getPetState(page);
      expect(state).toBe('happy');
      const particles = await getParticles(page).count();
      expect(particles).toBeGreaterThan(0);
    });

    test('T1-F6-03: Prolonged inactivity encourages sleeping', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 1000);

      await fastForwardClock(page, 300_000);
      await stepClock(page, 250);

      const state = await getPetState(page);
      expect(state).toBe('sleeping');
      const zzzCount = await getParticles(page, 'zzz').count();
      const anyParticles = await getParticles(page).count();
      expect(zzzCount + anyParticles).toBeGreaterThan(0);
    });

    test('T1-F6-04: Night Mode encourages sleepier behavior', async ({ page }) => {
      await setupClock(page);
      await getToggleTheme(page).click();
      await expect(page.locator('body')).toHaveClass(/night/);

      await fastForwardClock(page, 180_000);
      await stepClock(page, 250);

      const state = await getPetState(page);
      expect(state).toBe('sleeping');
    });

    test('T1-F6-05: Non-punishing lifecycle (pet never dies)', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 500);

      // Fast-forward 24 hours with zero care
      await fastForwardClock(page, 24 * 60 * 60 * 1000);
      await stepClock(page, 250);

      const pet = getPet(page);
      await expect(pet).toBeVisible();

      // Wake if sleeping and verify pet responds to petting and feeding
      const sleepBtn = getSleepButton(page);
      const label = (await sleepBtn.textContent()) ?? '';
      if (/wake/i.test(label)) {
        await page.mouse.move(10, 10);
        await sleepBtn.click();
        await stepClock(page, 100);
      }

      await tapPet(page, 2);
      await stepClock(page, 50);
      const state = await getPetState(page);
      expect(state).not.toBeNull();
      expect(state).not.toBe('sleeping');
    });
  });

  test.describe('F7: Time-Driven Clock Reactions', () => {
    test('T1-F7-01: Minute tick bumps perched pet', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:58');
      const minutesBox = await getBox(getMinutes(page));

      await dragPetTo(
        page,
        minutesBox.x + minutesBox.width / 2,
        minutesBox.y - 35,
        { holdMsBeforeUp: 150 }
      );
      await stepClock(page, 1200);
      expect(await getPetState(page)).toBe('perched');

      const perchedY = (await getBox(getPet(page))).y;
      let reacted = false;

      for (let i = 0; i < 30; i++) {
        await stepClock(page, 100);
        const curY = (await getBox(getPet(page))).y;
        const state = await getPetState(page);
        if (
          curY < perchedY - 3 ||
          state === 'startled' ||
          state === 'jumping'
        ) {
          reacted = true;
          break;
        }
      }

      await expect(getMinutes(page)).toHaveText('01');
      expect(reacted).toBe(true);
    });

    test('T1-F7-02: Hour tick triggers celebratory hop', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:59:58');
      await stepClock(page, 500);

      const baseY = (await getBox(getPet(page))).y;
      let celebrated = false;

      for (let i = 0; i < 35; i++) {
        await stepClock(page, 100);
        const curY = (await getBox(getPet(page))).y;
        const state = await getPetState(page);
        const particleCount = await getParticles(page).count();
        if (
          state === 'happy' ||
          state === 'jumping' ||
          particleCount > 0 ||
          curY < baseY - 10
        ) {
          celebrated = true;
          break;
        }
      }

      await expect(getHours(page)).toHaveText('11');
      await expect(getMinutes(page)).toHaveText('00');
      expect(celebrated).toBe(true);
    });

    test('T1-F7-03: Second / colon tick subtle awareness', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:10');
      const secondsBox = await getBox(getSeconds(page));

      await dragPetTo(
        page,
        secondsBox.x + secondsBox.width / 2,
        secondsBox.y - 35,
        { holdMsBeforeUp: 150 }
      );
      await stepClock(page, 1000);

      const startBox = await getBox(getPet(page));
      await stepClock(page, 3000);
      const endBox = await getBox(getPet(page));

      // Pet remains perched / grounded without teleporting off-stage
      const stageBox = await getBox(getStage(page));
      expect(endBox.x).toBeGreaterThanOrEqual(stageBox.x);
      expect(endBox.y).toBeGreaterThanOrEqual(stageBox.y);
      expect(Math.abs(endBox.y - startBox.y)).toBeLessThan(300);
    });

    test('T1-F7-04: Non-perched pet on minute tick', async ({ page }) => {
      await setupClock(page, '2026-11-14T10:00:58');
      await stepClock(page, 500);

      const stageBox = await getBox(getStage(page));
      // Ensure pet is on the floor, not perched
      await dragPetTo(page, stageBox.x + 80, stageBox.y + stageBox.height - 60, {
        holdMsBeforeUp: 150,
      });
      await stepClock(page, 500);

      const beforeY = (await getBox(getPet(page))).y;
      await stepClock(page, 2500);

      await expect(getMinutes(page)).toHaveText('01');
      const afterY = (await getBox(getPet(page))).y;
      expect(Math.abs(afterY - beforeY)).toBeLessThan(60);
    });

    test('T1-F7-05: Midnight rollover (23:59:58 -> 00:00:01)', async ({ page }) => {
      await setupClock(page, '2026-11-14T23:59:58');
      const initialDate = await getDate(page).textContent();

      let celebrated = false;
      for (let i = 0; i < 40; i++) {
        await stepClock(page, 100);
        const state = await getPetState(page);
        if (
          state === 'happy' ||
          state === 'jumping' ||
          (await getParticles(page).count()) > 0
        ) {
          celebrated = true;
        }
      }

      const newDate = await getDate(page).textContent();
      expect(newDate).not.toBe(initialDate);
      expect(newDate).toContain('November 15');
      await expect(getHours(page)).toHaveText('12');
      await expect(getMinutes(page)).toHaveText('00');
      expect(celebrated).toBe(true);

      const petBox = await getBox(getPet(page));
      expect(Number.isNaN(petBox.x)).toBe(false);
      expect(Number.isNaN(petBox.y)).toBe(false);
    });
  });
});
