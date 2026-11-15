import { test, expect } from '@playwright/test';
import {
  getStage,
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
} from './helpers/actions';

test.describe('Tier 3: Cross-Feature Combinations (Pairwise Matrix)', () => {
  test('T3-01: 12H + Seconds Hidden + Night Mode + Desktop + Perched on #hours -> Minute Tick', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupClock(page, '2026-11-14T14:05:58');

    await getToggleSeconds(page).click();
    await getToggleTheme(page).click();
    await expect(getSeconds(page)).toHaveClass(/hidden/);
    await expect(page.locator('body')).toHaveClass(/night/);

    const hoursBox = await getBox(getHours(page));
    await dragPetTo(page, hoursBox.x + hoursBox.width / 2, hoursBox.y - 25, {
      steps: 4,
      holdMsBeforeUp: 120,
    });
    await stepClock(page, 600);

    // Cross minute boundary 14:05:58 -> 14:06:01 (02:06 PM in 12H)
    await stepClock(page, 3000);

    await expect(getHours(page)).toHaveText('02');
    await expect(getMinutes(page)).toHaveText('06');
    await expect(getAmPm(page)).toHaveText('PM');
    await expect(getSeconds(page)).toHaveClass(/hidden/);
    await expect(page.locator('body')).toHaveClass(/night/);

    const hoursColor = await getHours(page).evaluate((el) => getComputedStyle(el).color);
    expect(hoursColor).toBe('rgb(255, 69, 58)');
  });

  test('T3-02: 24H + Seconds Shown + Standard Mode + Mobile Landscape (844x390) + Thrown onto #seconds', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await setupClock(page, '2026-11-14T14:05:09');

    await getToggleFormat(page).click();
    await expect(getHours(page)).toHaveText('14');
    await expect(getSeconds(page)).not.toHaveClass(/hidden/);

    const secondsBox = await getBox(getSeconds(page));
    await dragPetTo(page, secondsBox.x + secondsBox.width / 2, secondsBox.y - 60, {
      steps: 4,
      stepMs: 12,
    });
    await stepClock(page, 1200);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(overflow).toBe(true);

    const stageBox = await getBox(getStage(page));
    const petBox = await getBox(getPet(page));
    expect(petBox.x).toBeGreaterThanOrEqual(stageBox.x);
    expect(petBox.x + petBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
    expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
  });

  test('T3-03: 12H + Seconds Shown + Night Mode + Reduced Motion + Mobile Portrait (390x844) + Tap & Feed', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setupClock(page, '2026-11-14T14:05:09');

    await getToggleTheme(page).click();
    await expect(page.locator('body')).toHaveClass(/night/);

    await tapPet(page);
    await stepClock(page, 200);
    await getFeedButton(page).click();
    await stepClock(page, 4000);

    await expect(getPet(page)).toBeVisible();
    const petBox = await getBox(getPet(page));
    const stageBox = await getBox(getStage(page));
    expect(petBox.x + petBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
  });

  test('T3-04: 24H + Seconds Hidden + Standard Mode + Desktop + Sleeping -> Hide Pet + Reload', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupClock(page, '2026-11-14T14:05:09');

    await getToggleFormat(page).click();
    await getToggleSeconds(page).click();
    await getSleepButton(page).click();
    await stepClock(page, 300);
    expect(await getPetState(page)).toBe('sleeping');

    await getTogglePetButton(page).click();
    await expect(getPet(page)).toBeHidden();

    await stepClock(page, 300);
    await page.reload();
    await stepClock(page, 300);

    await expect(getHours(page)).toHaveText('14');
    await expect(getSeconds(page)).toHaveClass(/hidden/);
    await expect(getPet(page)).toBeHidden();
    await expect(getTogglePetButton(page)).toHaveText(/show pet/i);
  });

  test('T3-05: 12H + Seconds Shown + Night Mode + Desktop + Perched on #seconds -> Hide Seconds + Resize 390x844', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupClock(page, '2026-11-14T10:05:09');
    await getToggleTheme(page).click();

    const secondsBox = await getBox(getSeconds(page));
    await dragPetTo(page, secondsBox.x + secondsBox.width / 2, secondsBox.y - 25, {
      steps: 4,
      holdMsBeforeUp: 120,
    });
    await stepClock(page, 800);

    await getToggleSeconds(page).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await stepClock(page, 1200);

    const stageBox = await getBox(getStage(page));
    const petBox = await getBox(getPet(page));
    expect(petBox.x).toBeGreaterThanOrEqual(stageBox.x);
    expect(petBox.x + petBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
    expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
  });

  test('T3-06: 24H + Seconds Shown + Standard Mode + Desktop + document.hidden across Hour Tick', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupClock(page, '2026-11-14T13:59:58');
    await getToggleFormat(page).click();
    await expect(getHours(page)).toHaveText('13');

    await setPageHidden(page, true);
    await page.clock.fastForward(5000);
    await setPageHidden(page, false);
    await stepClock(page, 300);

    await expect(getHours(page)).toHaveText('14');
    await expect(getMinutes(page)).toHaveText('00');

    const stageBox = await getBox(getStage(page));
    const petBox = await getBox(getPet(page));
    expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
    expect(Number.isNaN(petBox.x)).toBe(false);
  });

  test('T3-07: 12H + Seconds Hidden + Night Mode + Mobile Landscape (844x390) + Keyboard Navigation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await setupClock(page, '2026-11-14T10:05:09');

    await getToggleSeconds(page).click();
    await getToggleTheme(page).click();

    // Tab through controls and verify keyboard activation works
    await getToggleFormat(page).focus();
    await page.keyboard.press('Enter');
    await stepClock(page, 300);
    await expect(getHours(page)).toHaveText('10');
    await expect(getAmPm(page)).toHaveText('');

    await getFeedButton(page).focus();
    await page.keyboard.press('Space');
    expect(await getTreats(page).count()).toBeGreaterThanOrEqual(1);
    await stepClock(page, 200);

    await getPet(page).focus();
    await page.keyboard.press('Enter');
    await stepClock(page, 100);
    await expect(getPet(page)).toBeVisible();
    await expect(getPet(page)).toBeFocused();
    expect(await getPetState(page)).not.toBeNull();

    const stageBox = await getBox(getStage(page));
    const petBox = await getBox(getPet(page));
    expect(petBox.x).toBeGreaterThanOrEqual(stageBox.x);
    expect(petBox.x + petBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 1);
    expect(petBox.y + petBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
  });
});
