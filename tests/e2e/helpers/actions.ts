import { expect, type Locator, type Page } from '@playwright/test';
import { getPet } from './selectors.js';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DragOptions {
  steps?: number;
  stepMs?: number;
  holdMsBeforeUp?: number;
}

const KNOWN_PET_STATES = [
  'idle',
  'walking',
  'jumping',
  'falling',
  'dragged',
  'perched',
  'sleeping',
  'eating',
  'happy',
  'startled',
] as const;

export async function setupClock(
  page: Page,
  isoTime = '2026-11-14T14:05:09'
): Promise<void> {
  const targetDate = new Date(isoTime);
  await page.clock.install({ time: targetDate });
  await page.clock.pauseAt(targetDate);
  await page.goto('./');
}

export async function getBox(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box as Box;
}

export function centerOf(box: Box): { x: number; y: number } {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

export async function getPetState(page: Page): Promise<string | null> {
  const pet = getPet(page);
  return pet.evaluate((el, states) => {
    const dataState = el.getAttribute('data-state');
    if (dataState) return dataState.toLowerCase();

    for (const cls of Array.from(el.classList)) {
      const normalized = cls.replace(/^pet--|^state-/, '').toLowerCase();
      if ((states as readonly string[]).includes(normalized)) {
        return normalized;
      }
    }
    return null;
  }, KNOWN_PET_STATES);
}

export async function getPetFacing(page: Page): Promise<string | null> {
  const pet = getPet(page);
  return pet.evaluate((el) => {
    const facing = el.getAttribute('data-facing');
    if (facing) return facing.toLowerCase();

    const transform = getComputedStyle(el).transform;
    if (transform && transform !== 'none') {
      const match = transform.match(/matrix\(([^,]+),/);
      if (match) {
        const scaleX = Number.parseFloat(match[1]);
        if (!Number.isNaN(scaleX)) {
          return scaleX < 0 ? 'left' : 'right';
        }
      }
    }
    return null;
  });
}

export async function dragPetTo(
  page: Page,
  targetX: number,
  targetY: number,
  opts: DragOptions = {}
): Promise<void> {
  const steps = opts.steps ?? 5;
  const stepMs = opts.stepMs ?? 12;
  const holdMsBeforeUp = opts.holdMsBeforeUp ?? 0;

  const petBox = await getBox(getPet(page));
  const start = centerOf(petBox);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = start.x + (targetX - start.x) * t;
    const ny = start.y + (targetY - start.y) * t;
    await page.mouse.move(nx, ny);
    if (stepMs > 0) {
      await page.clock.runFor(stepMs);
    }
  }

  if (holdMsBeforeUp > 0) {
    await page.clock.runFor(holdMsBeforeUp);
  }

  await page.mouse.up();
}

export async function dragPet(
  page: Page,
  dx: number,
  dy: number,
  opts: DragOptions = {}
): Promise<void> {
  const petBox = await getBox(getPet(page));
  const start = centerOf(petBox);
  await dragPetTo(page, start.x + dx, start.y + dy, opts);
}

export async function tapPet(page: Page, movePx = 2): Promise<void> {
  const petBox = await getBox(getPet(page));
  const start = centerOf(petBox);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  if (movePx > 0) {
    await page.mouse.move(start.x + movePx, start.y);
  }
  await page.clock.runFor(16);
  await page.mouse.up();
}

export async function setPageHidden(
  page: Page,
  hidden: boolean
): Promise<void> {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => isHidden,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (isHidden ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

export async function stepClock(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
}

export async function fastForwardClock(page: Page, ms: number): Promise<void> {
  await page.clock.fastForward(ms);
}

export async function getComputedTransform(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).transform);
}

export function attachErrorListeners(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (
      msg.type() === 'error' &&
      !(msg.location()?.url?.endsWith('/favicon.ico') && msg.text().includes('404'))
    ) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  return errors;
}
