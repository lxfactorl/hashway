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

| Command                 | Purpose                                                 |
| ----------------------- | ------------------------------------------------------- |
| `npm run format:check`  | Prettier check (warnings fail CI)                       |
| `npm run typecheck`     | TypeScript strict type check                            |
| `npm run lint`          | ESLint with layer-boundary enforcement                  |
| `npm run test:unit`     | Unit tests (Vitest)                                     |
| `npm run test:coverage` | Unit tests with coverage thresholds                     |
| `npm run build`         | WXT MV2 build                                           |
| `npm run test:manifest` | Manifest contract test                                  |
| `npm run web-ext:lint`  | web-ext lint on built `dist/`                           |
| `npm run test:e2e`      | E2E (Selenium + geckodriver, CI-only, `windows-latest`) |

`npm run test:e2e` runs only in CI on `windows-latest`. It is not executed locally.

## Token safety

Never paste a Real-Debrid token into CI or tests. Local Options-page entry only.

## Requirements

See `docs/technology-stack-and-repository-requirements.md` for the approved baseline spec.

## Automated release flow

Every change reaches Firefox through: feature branch → PR → CI (`quality` + `commitlint` + `e2e`
on `windows-latest`) → human approval → squash-merge to `main`. release-please opens a release PR
with a bumped version and `CHANGELOG.md` diff. On its approval and merge, a git tag `vX.Y.Z` and
GitHub Release `vX.Y.Z` are created. `release-assets.yml` builds and uploads
`hashway-vX.Y.Z.zip` as a Release asset. Download the zip and load it in Firefox via
`about:debugging` → Load Temporary Add-on.

## Local verification

Run these agent-side gates before any PR:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test:unit
npm run test:coverage
npm run build
npm run test:manifest
npm run web-ext:lint
npm audit --audit-level=critical
```

`npm audit --audit-level=critical` is used instead of `--audit-level=high` because the transitive
dev-only dependency `image-size` (via `web-ext` → `addons-linter`) has a known high-severity DoS
advisory with no patched version. See `docs/decisions/ADR-001-wxt-firefox-mv2.md`.

`npm run test:e2e` runs only in CI on `windows-latest`; it is not executed locally.
