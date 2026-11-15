# StandBy Clock

An Apple-style StandBy digital clock with an interactive 2D-physics digital pet, built with **Vite + TypeScript** and deployed to **GitHub Pages**.

**Live Demo:** https://pedroliu1999.github.io/standby-clock/

## Features

- **StandBy Clock**: 12H/24H toggle, optional seconds, OLED **Night Mode**, and automatic control/cursor hiding after 3 seconds of inactivity.
- **2D Gravity & Throw Physics**: Pick up, drag, and fling the pet across the screen with realistic gravity, bouncing, friction, and viewport containment.
- **Clock Element Interactions**:
  - Per-digit glyph ink-bound colliders (`#hours`, `#minutes`, `#colon`, `#seconds`, `#ampm`, `#date`, and `.pill` controls) so the pet lands and perches directly on the rendered digits.
  - Damped-spring nudge reactions when the pet bumps into or lands on clock elements.
  - Time-driven reactions on second pulses, minute ticks, and hour rollovers.
- **Interactive Pet Care**:
  - **Tap / Click** to pet (`happy` hearts), **Drag & Throw**, **Feed** button or **Double-Click** anywhere on the stage to drop a treat, and **Sleep / Wake** toggle (plus automatic sleep on inactivity or Night Mode).
  - Keyboard accessible (`Tab` to focus pet, `ArrowLeft` / `ArrowRight` / `ArrowUp` to move & jump, `Enter` / `Space` to pet).
  - Respects `prefers-reduced-motion` and persists state in `localStorage`.

## Development

```bash
npm ci
npm run dev
```

## Build, Typecheck & Tests

```bash
npm run typecheck
npm test
npm run build
```

To run the Playwright end-to-end suite:

```bash
npx --prefix tests/e2e playwright test --config tests/e2e/playwright.config.ts
```

## GitHub Pages

Pushes to `main` automatically build and deploy `dist/` via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) to https://pedroliu1999.github.io/standby-clock/.
Make sure **Settings → Pages → Source** is set to **GitHub Actions** in your repository.
