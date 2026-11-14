# StandBy Clock

An Apple-style StandBy digital clock built with **Vite + TypeScript** and deployed to **GitHub Pages**.

## Development

```bash
npm ci
npm run dev
```

## Build & Typecheck

```bash
npm run build
```

## GitHub Pages

Pushes to `main` automatically build and deploy `dist/` via `.github/workflows/deploy.yml`.
Make sure **Settings → Pages → Source** is set to **GitHub Actions** in your repository.
