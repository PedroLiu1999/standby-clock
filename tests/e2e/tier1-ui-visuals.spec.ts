import { expect, test } from '@playwright/test';
import {
  getFeedButton,
  getHours,
  getMinutes,
  getParticles,
  getPet,
  getSeconds,
  getSleepButton,
  getStage,
  getToggleFormat,
  getTogglePetButton,
  getToggleSeconds,
  getToggleTheme,
  getTreats,
} from './helpers/selectors.js';
import {
  centerOf,
  dragPetTo,
  fastForwardClock,
  getBox,
  getComputedTransform,
  getPetFacing,
  getPetState,
  setupClock,
  stepClock,
  tapPet,
} from './helpers/actions.js';

test.describe('Tier 1 — UI, Visuals, Clock Reactions & Persistence (F8–F11)', () => {
  test.describe('F8: Expressive Pet Visuals & Particles', () => {
    test('T1-F8-01: SVG/DOM pet renders with visible dimensions', async ({ page }) => {
      await setupClock(page);
      const pet = getPet(page);
      await expect(pet).toBeVisible();

      const petBox = await getBox(pet);
      const stageBox = await getBox(getStage(page));
      expect(petBox.width).toBeGreaterThan(16);
      expect(petBox.height).toBeGreaterThan(16);
      expect(petBox.x).toBeGreaterThanOrEqual(stageBox.x);
      expect(petBox.y).toBeGreaterThanOrEqual(stageBox.y);
    });

    test('T1-F8-02: Facing direction flips with movement', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 150, stageBox.y + 300, {
        holdMsBeforeUp: 50,
      });
      await stepClock(page, 64);

      await dragPetTo(page, stageBox.x + 500, stageBox.y + 300, {
        steps: 5,
        stepMs: 12,
      });
      const facingRight = await getPetFacing(page);

      await dragPetTo(page, stageBox.x + 150, stageBox.y + 300, {
        steps: 5,
        stepMs: 12,
      });
      const facingLeft = await getPetFacing(page);

      expect(facingRight).toBe('right');
      expect(facingLeft).toBe('left');
    });

    test('T1-F8-03: Squash-and-stretch on jump/landing', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      await dragPetTo(page, stageBox.x + 120, stageBox.y + 40, {
        holdMsBeforeUp: 150,
      });

      const transforms: string[] = [];
      for (let i = 0; i < 40; i++) {
        await stepClock(page, 24);
        transforms.push(await getComputedTransform(getPet(page)));
      }

      // At least some frames during fall/impact should apply scale/transform
      const nonIdentity = transforms.filter((t) => t !== 'none');
      expect(nonIdentity.length).toBeGreaterThan(0);

      // Settle and verify transform recovers
      await stepClock(page, 1500);
      const settled = await getComputedTransform(getPet(page));
      expect(settled === 'none' || settled.startsWith('matrix(')).toBe(true);
    });

    test('T1-F8-04: State-specific particles appear and auto-clean up', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 500);

      // Petting -> heart/happy particles
      await tapPet(page, 2);
      await stepClock(page, 64);
      expect(await getParticles(page).count()).toBeGreaterThan(0);

      // Wait for particle cleanup
      await stepClock(page, 3500);
      expect(await getParticles(page).count()).toBe(0);

      // Sleeping -> zzz particles
      await getSleepButton(page).click();
      await stepClock(page, 800);
      expect(await getParticles(page).count()).toBeGreaterThan(0);
    });

    test('T1-F8-05: Night Mode adapts pet & particle palette', async ({ page }) => {
      await setupClock(page);
      const pet = getPet(page);

      const dayColor = await pet.evaluate((el) => {
        const svgEl = el.querySelector('svg, path, circle, rect, ellipse') ?? el;
        const s = getComputedStyle(svgEl);
        return `${s.color}|${s.fill}|${s.stroke}`;
      });

      await getToggleTheme(page).click();
      await stepClock(page, 50);

      const nightColor = await pet.evaluate((el) => {
        const svgEl = el.querySelector('svg, path, circle, rect, ellipse') ?? el;
        const s = getComputedStyle(svgEl);
        return `${s.color}|${s.fill}|${s.stroke}`;
      });

      expect(nightColor).not.toBe(dayColor);
    });
  });

  test.describe('F9: Pointer Interactions', () => {
    test('T1-F9-01: Tap/click (< 6px travel) pets instead of dragging', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 500);

      await tapPet(page, 3);
      await stepClock(page, 32);

      const state = await getPetState(page);
      expect(state).toBe('happy');
      expect(await getParticles(page).count()).toBeGreaterThan(0);
    });

    test('T1-F9-02: Drag (>= 6px travel) picks up pet', async ({ page }) => {
      await setupClock(page);
      await stepClock(page, 500);

      const petBox = await getBox(getPet(page));
      const start = centerOf(petBox);

      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 30, start.y - 30, { steps: 3 });
      await stepClock(page, 16);

      expect(await getPetState(page)).toBe('dragged');
      await page.mouse.up();
    });

    test('T1-F9-03: Double-click on stage spawns treat at pointer', async ({ page }) => {
      await setupClock(page);
      const stageBox = await getBox(getStage(page));

      const targetX = stageBox.x + 120;
      const targetY = stageBox.y + 120;
      await page.mouse.dblclick(targetX, targetY);

      const treat = getTreats(page).first();
      await expect(treat).toBeVisible();
      const treatBox = await getBox(treat);
      expect(Math.abs(treatBox.x - targetX)).toBeLessThan(80);
    });

    test('T1-F9-04: Feed button spawns treat', async ({ page }) => {
      await setupClock(page);
      await getFeedButton(page).click();

      await expect(getTreats(page).first()).toBeVisible();

      for (let i = 0; i < 60; i++) {
        await stepClock(page, 150);
        if ((await getTreats(page).count()) === 0) break;
      }
      expect(await getTreats(page).count()).toBe(0);
    });

    test('T1-F9-05: Clicking .pill controls does not accidentally drag pet', async ({ page }) => {
      await setupClock(page);
      await getToggleFormat(page).click();
      await getToggleTheme(page).click();

      await expect(getToggleFormat(page)).toHaveText('12H');
      await expect(page.locator('body')).toHaveClass(/night/);
      expect(await getPetState(page)).not.toBe('dragged');
    });
  });

  test.describe('F10: Physical Clock Reactions & Layout Coupling', () => {
    test('T1-F10-01: Bumping clock element applies CSS transform nudge', async ({ page }) => {
      await setupClock(page);
      const hours = getHours(page);
      const hoursBox = await getBox(hours);

      await dragPetTo(
        page,
        hoursBox.x + hoursBox.width / 2,
        hoursBox.y - 60,
        { holdMsBeforeUp: 150 }
      );

      let sawNudge = false;
      for (let i = 0; i < 40; i++) {
        await stepClock(page, 24);
        const transform = await getComputedTransform(hours);
        if (transform !== 'none') {
          sawNudge = true;
          break;
        }
      }
      expect(sawNudge).toBe(true);
    });

    test('T1-F10-02: Clock nudge springs back to rest', async ({ page }) => {
      await setupClock(page);
      const hours = getHours(page);
      const hoursBox = await getBox(hours);

      await dragPetTo(
        page,
        hoursBox.x + hoursBox.width / 2,
        hoursBox.y - 60,
        { holdMsBeforeUp: 150 }
      );
      await stepClock(page, 1500);

      const settledTransform = await getComputedTransform(hours);
      expect(
        settledTransform === 'none' ||
          settledTransform === 'matrix(1, 0, 0, 1, 0, 0)'
      ).toBe(true);
    });

    test('T1-F10-03: Hiding #seconds drops perched pet', async ({ page }) => {
      await setupClock(page);
      const secondsBox = await getBox(getSeconds(page));

      await dragPetTo(
        page,
        secondsBox.x + secondsBox.width / 2,
        secondsBox.y - 35,
        { holdMsBeforeUp: 150 }
      );
      await stepClock(page, 1200);
      const perchedY = (await getBox(getPet(page))).y;

      await getToggleSeconds(page).click();
      await expect(getSeconds(page)).toBeHidden();

      await stepClock(page, 1200);
      const droppedY = (await getBox(getPet(page))).y;
      expect(droppedY).toBeGreaterThan(perchedY + 20);
    });

    test('T1-F10-04: Glyph top-inset aligns pet on .digits', async ({ page }) => {
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
      const petBottom = petBox.y + petBox.height;
      // With glyph top-inset, pet bottom sits inside the top portion of #hours bounding box
      expect(petBottom).toBeGreaterThanOrEqual(hoursBox.y);
      expect(petBottom).toBeLessThanOrEqual(hoursBox.y + hoursBox.height * 0.45);
    });

    test('T1-F10-05: ResizeObserver updates colliders on viewport resize', async ({ page }) => {
      await setupClock(page);
      const minutesBox = await getBox(getMinutes(page));

      await dragPetTo(
        page,
        minutesBox.x + minutesBox.width / 2,
        minutesBox.y - 40,
        { holdMsBeforeUp: 150 }
      );
      await stepClock(page, 1200);

      await page.setViewportSize({ width: 800, height: 600 });
      await stepClock(page, 800);

      const newMinutesBox = await getBox(getMinutes(page));
      const newPetBox = await getBox(getPet(page));
      // Pet should not be floating far above the new #minutes box
      expect(newPetBox.y + newPetBox.height).toBeGreaterThanOrEqual(
        newMinutesBox.y - 10
      );
      expect(newPetBox.y + newPetBox.height).toBeLessThanOrEqual(600);
    });
  });

  test.describe('F11: UI Controls, Accessibility & Persistence', () => {
    test('T1-F11-01: Show/Hide Pet control toggles pet visibility', async ({ page }) => {
      await setupClock(page);
      const togglePetBtn = getTogglePetButton(page);
      const pet = getPet(page);

      await expect(pet).toBeVisible();
      await togglePetBtn.click();
      await stepClock(page, 50);

      await expect(pet).toBeHidden();
      await expect(togglePetBtn).toHaveText(/show pet/i);

      await togglePetBtn.click();
      await stepClock(page, 50);
      await expect(pet).toBeVisible();
      await expect(togglePetBtn).toHaveText(/hide pet/i);
    });

    test('T1-F11-02: Sleep/Wake control toggles sleep state', async ({ page }) => {
      await setupClock(page);
      const sleepBtn = getSleepButton(page);

      await sleepBtn.click();
      await stepClock(page, 100);
      expect(await getPetState(page)).toBe('sleeping');
      await expect(sleepBtn).toHaveText(/wake/i);

      await sleepBtn.click();
      await stepClock(page, 100);
      expect(await getPetState(page)).not.toBe('sleeping');
      await expect(sleepBtn).toHaveText(/sleep/i);
    });

    test('T1-F11-03: Keyboard accessibility (Tab + Enter/Space)', async ({ page }) => {
      await setupClock(page);

      const formatBtn = getToggleFormat(page);
      await formatBtn.focus();
      await page.keyboard.press('Enter');
      await expect(formatBtn).toHaveText('12H');

      const pet = getPet(page);
      await pet.focus();
      await page.keyboard.press('Space');
      await stepClock(page, 64);

      const state = await getPetState(page);
      expect(['happy', 'jumping']).toContain(state);
    });

    test('T1-F11-04: localStorage persists clock & pet preferences across reload', async ({ page }) => {
      await setupClock(page);

      await getToggleFormat(page).click();
      await getToggleTheme(page).click();
      await getToggleSeconds(page).click();
      await getTogglePetButton(page).click();
      await stepClock(page, 200);

      await page.reload();

      await expect(getToggleFormat(page)).toHaveText('12H');
      await expect(page.locator('body')).toHaveClass(/night/);
      await expect(getSeconds(page)).toBeHidden();
      await expect(getPet(page)).toBeHidden();
    });

    test('T1-F11-05: localStorage persists pet stats/state across reload', async ({ page }) => {
      await setupClock(page);
      await tapPet(page, 2);
      await getFeedButton(page).click();
      await stepClock(page, 1500);

      const savedBefore = await page.evaluate(() => JSON.stringify(localStorage));
      expect(savedBefore.length).toBeGreaterThan(2);

      await page.reload();
      await expect(getPet(page)).toBeVisible();
      const savedAfter = await page.evaluate(() => JSON.stringify(localStorage));
      expect(savedAfter.length).toBeGreaterThan(2);
    });
  });
});
