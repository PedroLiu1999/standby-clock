import { expect, test } from '@playwright/test';
import {
  getAmPm,
  getColon,
  getDate,
  getHours,
  getMinutes,
  getSeconds,
  getToggleFormat,
  getToggleSeconds,
  getToggleTheme,
} from './helpers/selectors.js';
import { attachErrorListeners, setupClock, stepClock } from './helpers/actions.js';

test.describe('Tier 1 — Existing Clock Functionality (EC)', () => {
  test('T1-EC-01: Initial 12H clock render & date display', async ({ page }) => {
    const errors = attachErrorListeners(page);
    await setupClock(page, '2026-11-14T14:05:09');

    await expect(getHours(page)).toHaveText('02');
    await expect(getMinutes(page)).toHaveText('05');
    await expect(getSeconds(page)).toHaveText('09');
    await expect(getAmPm(page)).toHaveText('PM');
    await expect(getDate(page)).toContainText('November 14');
    await expect(getToggleFormat(page)).toHaveText('24H');
    expect(errors).toEqual([]);
  });

  test('T1-EC-02: 12H / 24H format toggle', async ({ page }) => {
    await setupClock(page, '2026-11-14T14:05:09');

    const formatBtn = getToggleFormat(page);
    await formatBtn.click();

    await expect(getHours(page)).toHaveText('14');
    await expect(getAmPm(page)).toHaveText('');
    await expect(formatBtn).toHaveText('12H');

    await formatBtn.click();

    await expect(getHours(page)).toHaveText('02');
    await expect(getAmPm(page)).toHaveText('PM');
    await expect(formatBtn).toHaveText('24H');
  });

  test('T1-EC-03: Show / Hide Seconds toggle', async ({ page }) => {
    await setupClock(page, '2026-11-14T14:05:09');

    const seconds = getSeconds(page);
    const secondsBtn = getToggleSeconds(page);

    await expect(seconds).toBeVisible();
    await expect(secondsBtn).toHaveText('Hide Seconds');

    await secondsBtn.click();
    await expect(seconds).toHaveClass(/hidden/);
    await expect(seconds).toBeHidden();
    expect(await seconds.boundingBox()).toBeNull();
    await expect(secondsBtn).toHaveText('Show Seconds');

    await secondsBtn.click();
    await expect(seconds).not.toHaveClass(/hidden/);
    await expect(seconds).toBeVisible();
    await expect(secondsBtn).toHaveText('Hide Seconds');
  });

  test('T1-EC-04: Night Mode toggle & OLED red theme', async ({ page }) => {
    await setupClock(page, '2026-11-14T14:05:09');

    const themeBtn = getToggleTheme(page);
    await expect(themeBtn).toHaveText('Night Mode');
    await expect(page.locator('body')).not.toHaveClass(/night/);

    await themeBtn.click();

    await expect(page.locator('body')).toHaveClass(/night/);
    await expect(themeBtn).toHaveText('Standard Mode');

    const color = await getHours(page).evaluate(
      (el) => getComputedStyle(el).color
    );
    expect(color).toBe('rgb(255, 69, 58)');
  });

  test('T1-EC-05: Colon blink on odd vs. even seconds', async ({ page }) => {
    await setupClock(page, '2026-11-14T10:00:00');

    const colon = getColon(page);
    await expect(colon).not.toHaveClass(/dim/);

    await stepClock(page, 1000);
    await expect(getSeconds(page)).toHaveText('01');
    await expect(colon).toHaveClass(/dim/);

    await expect
      .poll(async () =>
        Number.parseFloat(await colon.evaluate((el) => getComputedStyle(el).opacity))
      )
      .toBeLessThan(1);
  });
});
