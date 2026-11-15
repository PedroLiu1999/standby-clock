import { test, expect } from '@playwright/test';
import {
  getStage,
  getDate,
  getHours,
  getMinutes,
  getSeconds,
  getAmPm,
  getToggleFormat,
  getToggleSeconds,
  getToggleTheme,
  getPet,
  getTreats,
  getFeedButton,
  getSleepButton,
  getTogglePetButton,
} from './helpers/selectors';
import {
  setupClock,
  getBox,
  getPetState,
  dragPetTo,
  tapPet,
  setPageHidden,
  stepClock,
  attachErrorListeners,
} from './helpers/actions';

test.describe('Tier 4: Real-World End-User Scenarios', () => {
  test('T4-01: Desk StandBy Companion (Morning to Noon)', async ({ page }) => {
    const errors = attachErrorListeners(page);

    await page.setViewportSize({ width: 1280, height: 720 });
    await setupClock(page, '2026-11-14T11:59:50');

    // Tap pet to say hello
    await tapPet(page);
    await stepClock(page, 200);

    // Throw/place pet onto #hours
    const hoursBox = await getBox(getHours(page));
    await dragPetTo(page, hoursBox.x + hoursBox.width / 2, hoursBox.y - 40, {
      steps: 4,
      holdMsBeforeUp: 80,
    });
    await stepClock(page, 1000);

    // Advance across 12:00:00 PM rollover
    await stepClock(page, 10_000);
    await expect(getHours(page)).toHaveText('12');
    await expect(getMinutes(page)).toHaveText('00');
    await expect(getAmPm(page)).toHaveText('PM');

    // Feed pet as reward
    await getFeedButton(page).click();
    await stepClock(page, 5000);

    await expect(getPet(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('T4-02: Nightstand Bedtime Routine (StandBy Landscape Overnight)', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await setupClock(page, '2026-11-14T22:30:00');

    await getToggleTheme(page).click();
    await getToggleSeconds(page).click();
    await expect(page.locator('body')).toHaveClass(/night/);
    await expect(getSeconds(page)).toHaveClass(/hidden/);

    // Put pet to sleep
    await getSleepButton(page).click();
    await stepClock(page, 500);
    expect(await getPetState(page)).toBe('sleeping');

    // Fast-forward 8 hours overnight
    await page.clock.fastForward(8 * 3600 * 1000);
    await stepClock(page, 500);

    await expect(getHours(page)).toHaveText('06');
    await expect(getAmPm(page)).toHaveText('AM');
    await expect(getSeconds(page)).toHaveClass(/hidden/);

    // Wake and feed in the morning
    if ((await getPetState(page)) === 'sleeping') {
      await getSleepButton(page).click();
      await stepClock(page, 300);
    }
    expect(await getPetState(page)).not.toBe('sleeping');

    await getFeedButton(page).click();
    await stepClock(page, 4000);
    await expect(getPet(page)).toBeVisible();
  });

  test('T4-03: Playful Physics & Clock Demolition', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupClock(page, '2026-11-14T14:25:00');

    const minutesBox = await getBox(getMinutes(page));
    const dateBox = await getBox(getDate(page));
    const secondsBox = await getBox(getSeconds(page));

    // Fling into #minutes
    await dragPetTo(page, 100, 100, { steps: 3 });
    await dragPetTo(page, minutesBox.x + minutesBox.width / 2, minutesBox.y + 10, {
      steps: 4,
      stepMs: 10,
    });
    await stepClock(page, 1200);

    // Double-click above #date to drop a treat
    await page.mouse.dblclick(dateBox.x + dateBox.width / 2, Math.max(20, dateBox.y - 60));
    await stepClock(page, 300);
    expect(await getTreats(page).count()).toBeGreaterThanOrEqual(1);
    await stepClock(page, 3000);
    if ((await getTreats(page).count()) > 0) {
      await dragPetTo(page, dateBox.x + dateBox.width / 2, dateBox.y - 25, {
        steps: 4,
        holdMsBeforeUp: 120,
      });
      await stepClock(page, 600);
    }

    // Place pet onto #seconds, then hide #seconds
    await dragPetTo(page, secondsBox.x + secondsBox.width / 2, secondsBox.y - 25, {
      steps: 4,
      holdMsBeforeUp: 120,
    });
    await stepClock(page, 800);
    const perchedY = (await getBox(getPet(page))).y;

    await getToggleSeconds(page).click();
    await stepClock(page, 1000);
    expect((await getBox(getPet(page))).y).toBeGreaterThan(perchedY + 15);

    // Resize browser window smaller and verify containment
    await page.setViewportSize({ width: 640, height: 480 });
    await stepClock(page, 500);
    const stageBox = await getBox(getStage(page));
    const petBox = await getBox(getPet(page));
    expect(petBox.x + petBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
    expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
  });

  test('T4-04: Accessibility & Reduced-Motion User Journey', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setupClock(page, '2026-11-14T10:15:00');

    // Keyboard-operate 24H toggle
    await getToggleFormat(page).focus();
    await page.keyboard.press('Enter');
    await stepClock(page, 300);
    await expect(getAmPm(page)).toHaveText('');

    // Keyboard-operate pet
    await getPet(page).focus();
    await page.keyboard.press('Space');
    await stepClock(page, 200);

    // Keyboard-operate Feed
    await getFeedButton(page).focus();
    await page.keyboard.press('Enter');
    await stepClock(page, 200);
    expect(await getTreats(page).count()).toBeGreaterThanOrEqual(1);

    // Keyboard-operate Hide Pet then Show Pet
    await getTogglePetButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(getPet(page)).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(getPet(page)).toBeVisible();
  });

  test('T4-05: Tab-Switch & Reload Persistence', async ({ page }) => {
    await setupClock(page, '2026-11-14T16:20:00');

    await getToggleFormat(page).click();
    await getToggleTheme(page).click();
    await tapPet(page);
    await getFeedButton(page).click();
    await stepClock(page, 3000);

    // Switch away for 30s
    await setPageHidden(page, true);
    await page.clock.fastForward(30_000);
    await setPageHidden(page, false);
    await stepClock(page, 300);

    const beforeReloadBox = await getBox(getPet(page));
    const stageBox = await getBox(getStage(page));
    expect(beforeReloadBox.y + beforeReloadBox.height).toBeLessThanOrEqual(
      stageBox.y + stageBox.height + 1,
    );

    // Reload and verify persisted preferences
    await page.reload();
    await stepClock(page, 300);

    await expect(getHours(page)).toHaveText('16');
    await expect(getAmPm(page)).toHaveText('');
    await expect(page.locator('body')).toHaveClass(/night/);
    await expect(getPet(page)).toBeVisible();
  });

  test('T4-06: Resilient Recovery from Corrupted Storage', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.addInitScript(() => {
      if (!sessionStorage.getItem('t4_06_seeded')) {
        sessionStorage.setItem('t4_06_seeded', '1');
        localStorage.setItem('standby-clock-state', '{{{corrupted');
        localStorage.setItem('standby-pet-state', 'not-valid-json!!!');
      }
    });

    await setupClock(page, '2026-11-14T14:00:00');
    await stepClock(page, 300);

    // Interact with clock toggles, pet, and feed
    await getToggleFormat(page).click();
    await getToggleTheme(page).click();
    await tapPet(page);
    await getFeedButton(page).click();
    await stepClock(page, 1000);

    // Reload and verify corrupted storage was overwritten with valid state
    await page.reload();
    await stepClock(page, 300);

    await expect(getHours(page)).toHaveText('14');
    await expect(getAmPm(page)).toHaveText('');
    await expect(page.locator('body')).toHaveClass(/night/);
    await expect(getPet(page)).toBeVisible();
    expect(await getPetState(page)).not.toBeNull();
    expect(errors).toEqual([]);
  });
});
