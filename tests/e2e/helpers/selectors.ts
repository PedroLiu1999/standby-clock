import type { Locator, Page } from '@playwright/test';

export type ParticleKind = 'heart' | 'zzz' | 'sparkle' | 'crumb';

export const SELECTORS = {
  stage: '.stage',
  clockCard: '.clock-card',
  date: '#date',
  hours: '#hours',
  colon: '#colon',
  minutes: '#minutes',
  seconds: '#seconds',
  ampm: '#ampm',
  controls: '.controls',
  toggleFormat: '#toggle-format',
  toggleSeconds: '#toggle-seconds',
  toggleTheme: '#toggle-theme',
  pet: '.stage [data-testid="pet"], .stage .pet, .stage [role="img"][aria-label*="pet" i], .stage [aria-label*="digital pet" i]',
  treat: '.stage [data-testid="treat"], .stage .treat',
  particle: '.stage [data-particle], .stage .particle',
} as const;

export function getStage(page: Page): Locator {
  return page.locator(SELECTORS.stage);
}

export function getClockCard(page: Page): Locator {
  return page.locator(SELECTORS.clockCard);
}

export function getDate(page: Page): Locator {
  return page.locator(SELECTORS.date);
}

export function getHours(page: Page): Locator {
  return page.locator(SELECTORS.hours);
}

export function getColon(page: Page): Locator {
  return page.locator(SELECTORS.colon);
}

export function getMinutes(page: Page): Locator {
  return page.locator(SELECTORS.minutes);
}

export function getSeconds(page: Page): Locator {
  return page.locator(SELECTORS.seconds);
}

export function getAmPm(page: Page): Locator {
  return page.locator(SELECTORS.ampm);
}

export function getToggleFormat(page: Page): Locator {
  return page.locator(SELECTORS.toggleFormat);
}

export function getToggleSeconds(page: Page): Locator {
  return page.locator(SELECTORS.toggleSeconds);
}

export function getToggleTheme(page: Page): Locator {
  return page.locator(SELECTORS.toggleTheme);
}

export function getPet(page: Page): Locator {
  return page.locator(SELECTORS.pet).first();
}

export function getTreats(page: Page): Locator {
  return page.locator(SELECTORS.treat);
}

export function getParticles(page: Page, kind?: ParticleKind): Locator {
  if (!kind) {
    return page.locator(SELECTORS.particle);
  }
  return page.locator(
    `.stage [data-particle="${kind}" i], .stage .particle--${kind}, .stage .particle.${kind}`
  );
}

export function getFeedButton(page: Page): Locator {
  return page
    .locator(SELECTORS.controls)
    .getByRole('button', { name: /feed/i });
}

export function getSleepButton(page: Page): Locator {
  return page
    .locator(SELECTORS.controls)
    .getByRole('button', { name: /sleep|wake/i });
}

export function getTogglePetButton(page: Page): Locator {
  return page
    .locator(SELECTORS.controls)
    .getByRole('button', { name: /hide pet|show pet/i });
}
