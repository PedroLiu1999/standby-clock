import { expect, test } from '@playwright/test';
import {
  getColon,
  getHours,
  getParticles,
  getPet,
  getSleepButton,
  getTogglePetButton,
} from './helpers/selectors.js';
import {
  attachErrorListeners,
  centerOf,
  getBox,
  getComputedTransform,
  getPetFacing,
  getPetState,
  setPageHidden,
  setupClock,
  stepClock,
  tapPet,
} from './helpers/actions.js';

const STORAGE_KEY = 'standby-clock-state-v1';

test.describe('Tier 5 — Adversarial UI, Race Condition & Hardening Tests', () => {
  test('T5-01: Corrupted & malformed standby-clock-state-v1 values recover cleanly', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    const payloads = ['{bad-json', 'null', '[]', '"string"', '12345'];

    for (const payload of payloads) {
      await page.addInitScript(
        ({ key, val }) => {
          localStorage.setItem(key, val);
        },
        { key: STORAGE_KEY, val: payload },
      );
      await setupClock(page, '2026-11-14T10:00:00');
      await stepClock(page, 200);
      await expect(getHours(page)).toHaveText('10');
      await expect(getPet(page)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('T5-02: Out-of-range & non-finite petStats in standby-clock-state-v1 are clamped and persisted', async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      if (!sessionStorage.getItem('t5_02_seeded')) {
        sessionStorage.setItem('t5_02_seeded', '1');
        localStorage.setItem(
          key,
          JSON.stringify({
            use24Hour: 'invalid',
            showSeconds: true,
            nightMode: 123,
            petEnabled: true,
            petStats: { energy: -50, happiness: 999, fullness: null },
          }),
        );
      }
    }, STORAGE_KEY);

    await setupClock(page, '2026-11-14T10:00:00');
    await stepClock(page, 2500);

    const stored = await page.evaluate((key) => {
      return JSON.parse(localStorage.getItem(key) || '{}');
    }, STORAGE_KEY);

    expect(stored.use24Hour).toBe(false);
    expect(stored.nightMode).toBe(false);
    expect(stored.petStats.energy).toBeGreaterThanOrEqual(0);
    expect(stored.petStats.energy).toBeLessThanOrEqual(100);
    expect(stored.petStats.happiness).toBeLessThanOrEqual(100);
    expect(stored.petStats.fullness).toBeGreaterThanOrEqual(0);
    expect(stored.petStats.fullness).toBeLessThanOrEqual(100);
  });

  test('T5-03: Hiding pet while dragged cancels drag so re-showing resumes physics', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await setupClock(page, '2026-11-14T10:00:00');
    await stepClock(page, 300);

    const petBox = await getBox(getPet(page));
    const start = centerOf(petBox);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y - 180, { steps: 4 });
    await stepClock(page, 32);
    expect(await getPetState(page)).toBe('dragged');

    // Toggle Hide Pet while pointer is still down
    await getTogglePetButton(page).evaluate((el: HTMLButtonElement) => el.click());
    await expect(getPet(page)).toBeHidden();
    await page.mouse.up();

    // Show pet again -> must NOT be stuck in 'dragged'
    await getTogglePetButton(page).click();
    await stepClock(page, 800);
    expect(await getPetState(page)).not.toBe('dragged');
    expect(errors).toEqual([]);
  });

  test('T5-04: visibilitychange hidden while dragged cancels active drag', async ({ page }) => {
    await setupClock(page, '2026-11-14T10:00:00');
    const petBox = await getBox(getPet(page));
    const start = centerOf(petBox);

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 20, start.y - 120, { steps: 3 });
    await stepClock(page, 32);
    expect(await getPetState(page)).toBe('dragged');

    await setPageHidden(page, true);
    await page.clock.fastForward(5000);
    await setPageHidden(page, false);
    await stepClock(page, 500);

    expect(await getPetState(page)).not.toBe('dragged');
  });

  test('T5-05: Keyboard ArrowLeft / ArrowRight / ArrowUp on .pet control movement & jump', async ({
    page,
  }) => {
    await setupClock(page, '2026-11-14T10:00:00');
    await stepClock(page, 800);

    const pet = getPet(page);
    await pet.focus();

    await page.keyboard.press('ArrowLeft');
    await stepClock(page, 100);
    expect(await getPetFacing(page)).toBe('left');
    expect(await getPetState(page)).toBe('walking');

    await page.keyboard.press('ArrowRight');
    await stepClock(page, 100);
    expect(await getPetFacing(page)).toBe('right');

    const beforeJumpY = (await getBox(pet)).y;
    await page.keyboard.press('ArrowUp');
    await stepClock(page, 64);
    expect(await getPetState(page)).toBe('jumping');
    expect((await getBox(pet)).y).toBeLessThan(beforeJumpY);
  });

  test('T5-06: Hidden pet disables Sleep button and removes .pet from Tab order', async ({
    page,
  }) => {
    await setupClock(page, '2026-11-14T10:00:00');
    await getTogglePetButton(page).click();
    await expect(getSleepButton(page)).toBeDisabled();

    const focusedClasses: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const cls = await page.evaluate(() => document.activeElement?.className ?? '');
      focusedClasses.push(cls);
    }
    expect(focusedClasses.some((c) => c.includes('pet'))).toBe(false);
  });

  test('T5-07: Dynamic prefers-reduced-motion change resets active clock nudges & suppresses animations', async ({
    page,
  }) => {
    await setupClock(page, '2026-11-14T10:00:00');
    const hours = getHours(page);
    const hoursBox = await getBox(hours);

    // Trigger nudge on #hours
    const petBox = await getBox(getPet(page));
    await page.mouse.move(petBox.x + petBox.width / 2, petBox.y + petBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(hoursBox.x + hoursBox.width / 2, hoursBox.y - 60, { steps: 4 });
    await page.mouse.up();
    await stepClock(page, 250);

    // Switch to reduced-motion dynamically
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await stepClock(page, 50);

    const transform = await getComputedTransform(hours);
    expect(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);

    // Particles capped at <= 1 and animation disabled
    await tapPet(page);
    await stepClock(page, 32);
    expect(await getParticles(page).count()).toBeLessThanOrEqual(1);
    const colonTransition = await getColon(page).evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    );
    expect(colonTransition).toBe('0s');
  });

  test('T5-08: Extreme viewport shrink below pet size (40x40) clamps cleanly without NaN', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await setupClock(page, '2026-11-14T10:00:00');
    await page.setViewportSize({ width: 40, height: 40 });
    await stepClock(page, 300);

    const petBox = await getBox(getPet(page));
    expect(Number.isFinite(petBox.x)).toBe(true);
    expect(Number.isFinite(petBox.y)).toBe(true);
    expect(petBox.x).toBeGreaterThanOrEqual(0);
    expect(petBox.y).toBeGreaterThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});
