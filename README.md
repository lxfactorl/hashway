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

| Command                    | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| `npm run format:check`     | Prettier check (warnings fail CI)                       |
| `npm run typecheck`        | TypeScript strict type check                            |
| `npm run lint`             | ESLint with layer-boundary enforcement                  |
| `npm run test:unit`        | Unit tests (Vitest)                                     |
| `npm run test:coverage`    | Unit tests with coverage thresholds                     |
| `npm run build`            | WXT MV2 build                                           |
| `npm run test:manifest`    | Manifest contract test                                  |
| `npm run web-ext:lint`     | web-ext lint on built `dist/`                           |
| `npm run update:extension` | Install latest signed `.xpi` into the Firefox profile   |
| `npm run test:e2e`         | E2E (Selenium + geckodriver, CI-only, `windows-latest`) |

`npm run test:e2e` runs only in CI on `windows-latest`. It is not executed locally.

## Requirements

See `docs/technology-stack-and-repository-requirements.md` for the approved baseline spec.

## Automated release flow

Every change reaches Firefox through: feature branch → PR → CI (`quality` + `commitlint` + `e2e`
on `windows-latest`) → human approval → squash-merge to `main`. release-please opens a release PR
with a bumped version and `CHANGELOG.md` diff. On its approval and merge, a git tag `vX.Y.Z` and
GitHub Release `vX.Y.Z` are created. The Release workflow (`release.yml`) builds the extension,
signs it with AMO via `web-ext sign --channel unlisted` (skips if the AMO secrets are absent), and
uploads both `hashway-vX.Y.Z.zip` and the signed `.xpi` as Release assets.

## Installing or updating the extension

Permanent installation into the main Firefox profile:

1. Create `.local.env` from `.local.env.example` and set
   `HASHWAY_FIREFOX_PROFILE=<full path to the Firefox profile dir>` (find it via `about:profiles`).
2. Run `npm run update:extension` — it downloads the latest signed `.xpi` from the public GitHub
   API and writes it to `<profile>/extensions/hashway@hashway.local.xpi`.
3. Restart Firefox to load the new version (badge `ON`, Options page "Hashway").

Manual temporary loading for debugging remains available via `about:debugging` → Load Temporary
Add-on; it does not survive a browser restart.

## Token safety

Never paste a Real-Debrid token into CI or tests. Local Options-page entry only. AMO API
credentials (`AMO_API_KEY`, `AMO_API_SECRET`) live only in GitHub Secrets for the release workflow;
see `docs/decisions/ADR-002-amo-ci-signing.md`.

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
