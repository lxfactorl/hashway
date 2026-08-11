# Hashway

Firefox WebExtension for sending torrent intents to Real-Debrid (hello-world setup phase).

## Prerequisites

- Node 25 (`>=25.0.0 <26.0.0`, see `.nvmrc`)
- npm 11+
- Firefox Stable (for manual install verification)

## Setup

```bash
npm ci
```

## Test commands

| Command | Purpose |
| --- | --- |
| `npm run format:check` | Prettier check (warnings fail CI) |
| `npm run typecheck` | TypeScript strict type check |
| `npm run lint` | ESLint with layer-boundary enforcement |
| `npm run test:unit` | Unit tests (Vitest) |
| `npm run test:coverage` | Unit tests with coverage thresholds |
| `npm run build` | WXT MV2 build |
| `npm run test:manifest` | Manifest contract test |
| `npm run web-ext:lint` | web-ext lint on built `dist/` |
| `npm run test:e2e` | E2E (Selenium + geckodriver, CI-only, `windows-latest`) |

`npm run test:e2e` runs only in CI on `windows-latest`. It is not executed locally.

## Token safety

Never paste a Real-Debrid token into CI or tests. Local Options-page entry only.

## Requirements

See `docs/technology-stack-and-repository-requirements.md` for the approved baseline spec.

## Automated release flow

(Setup phase — described in detail once the release pipeline lands.)
