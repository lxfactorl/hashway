# Testing — Send to Real-Debrid

Status: Documents the implemented testing strategy. The [design spec](superpowers/specs/2026-08-10-send-to-real-debrid-design.md)
section 8 (verification) and the [tech-stack baseline](technology-stack-and-repository-requirements.md)
"Testing Requirements" define the intent; the files and commands below are authoritative.

## Test layers

| Layer                 | Directory / file                       | Runner                              | Runs where                 |
| --------------------- | -------------------------------------- | ----------------------------------- | -------------------------- |
| Unit + contract       | `tests/unit/*.test.ts`                 | Vitest (node env)                   | local + CI                 |
| Property (fast-check) | `tests/property/*.property.test.ts`    | Vitest (node env)                   | local + CI                 |
| Manifest contract     | `tests/unit/manifest-contract.test.ts` | Vitest against `dist/manifest.json` | local + CI                 |
| Browser E2E           | `tests/e2e/*.e2e.ts`                   | Vitest + Selenium + geckodriver     | CI only (`windows-latest`) |

Fake services used by E2E live next to the E2E file: `tests/e2e/fake-rd.ts` and
`tests/e2e/fake-tracker.ts`. Committed torrent fixtures are in `tests/fixtures/torrents/`.

## Unit tests

Node-environment Vitest tests exercise domain logic, application use cases, and adapter contracts
with hand-written fakes (never a live provider). Notable files:

- `bencode.test.ts`, `infohash.test.ts` — canonical parse, malformed input, depth/bounds, exact raw
  `info` byte-range SHA-1, v2/hybrid rejection.
- `magnet.test.ts`, `display-name.test.ts` — validation, `tr`/`xs`/`x.pe`/unknown-parameter
  sanitization, normalization, control-char removal, idempotency.
- `retry-policy.test.ts`, `error-taxonomy.test.ts` — retry classification (addMagnet never retried),
  backoff, closed taxonomy.
- `status-map.test.ts`, `real-debrid-client.test.ts` — RD `201`/`202`/`204`/`400`/`401`/`403`/
  `429`/`503` and error-code mapping, network-ambiguity handling, token/Authorization-header usage.
- `send-torrent.test.ts` — the full orchestration use case with injected real `classifyLink`:
  magnet and `.torrent` paths, every failure branch, Busy, deadline, retries, notifications/badges.
- `active-tab.test.ts` — `classifyLink` policy (magnet v1, same-origin https, http, cross-origin →
  unsupported, javascript → unsupported).
- `versioned-storage.test.ts` — versioned keys, `{version, events}` envelope unwrap, legacy bare
  array, unparseable-value → `[]`.
- `ring-buffer.test.ts`, `redaction.test.ts`, `export-diagnostics.test.ts` — bounded eviction,
  sanitization, export shape.
- `credentials.test.ts`, `test-token.test.ts`, `badge.test.ts` — options/notification behavior.
- `ci-pr-link-contract.test.ts`, `dependabot-verdict.test.ts` — CI workflow contract checks.

## Property tests (fast-check)

Deterministic, seeded fast-check properties in `tests/property/`:

- `bencode.property.test.ts` — arbitrary/malformed bencode bytes, parser invariants.
- `magnet-sanitization.property.test.ts` — sanitized magnets contain only `xt` + `dn`.
- `display-name.property.test.ts` — normalization idempotency and bounds.
- `retry-classification.property.test.ts` — retry decision vs error kind / operation.
- `redaction.property.test.ts` — sensitive keys/values never survive sanitization.

## Manifest contract test

`tests/unit/manifest-contract.test.ts` validates the built `dist/manifest.json`:

- Firefox MV2, `browser_action` present, immutable `gecko.id` (`hashway@hashway.local`).
- Permissions exactly equal the approved allowlist.
- No forbidden permissions (`cookies`, `webRequest`, `webRequestBlocking`, `debugger`,
  `nativeMessaging`, `tabs`, `unlimitedStorage`, `<all_urls>`).
- No `localhost` / `127.0.0.1` / `*.test` host permissions.
- `options_ui` and `background` present; content-script matches HTTPS-only if present.

## E2E integration (CI only)

`tests/e2e/send-to-rd.e2e.ts` drives the **real** `sendTorrent` use case and the **real**
`createRealDebridClient` against a live HTTP fake RD (and a live fake tracker) — no browser is
involved:

- **Fake tracker** serves the committed `single-file-v1.torrent` fixture and a login page.
- **Fake RD** answers `/torrents/addMagnet` → 201 `{ id: "t1" }`, `/torrents/selectFiles/t1` → 202,
  `/user` → 200, with CORS headers; it records each request's method, URL, and body.
- Asserts: a magnet link is sanitized to only `xt`+`dn` before it reaches RD (a tracker passkey in
  `tr` never survives); a `.torrent` fetched through the messaging port is parsed, hashed to the
  fixture's real v1 infohash, and added; a session-required page maps to `tracker_auth`; a
  cross-origin link is rejected. The background has **no** test-only message handlers.

geckodriver forbids navigation to `moz-extension://` URLs, so the extension's own pages cannot be
driven reliably in Selenium. `hello-world.e2e.ts` still loads the built extension in a real headless
Firefox profile and asserts it starts without SEVERE console errors. The real context-menu click on
a live tracker page is a **manual smoke step**:

1. `npm run update:extension` (or `about:debugging` → Load Temporary Add-on) to install the build.
2. Open an HTTPS tracker page, log in, and right-click a `.torrent` link → **Send to Real-Debrid**.
3. Confirm the notification "Added: …", the `✓` badge, and the magnet appearing under
   `https://real-debrid.com/torrents`.

The E2E never uses a personal token; the fixture magnet and token are test-only values.

## Local quality gate

Run before any PR (from `AGENTS.md` and the tech-stack baseline). All must pass locally:

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test:unit -- --run
npm run test:coverage
npm run build
npm run test:manifest
npm run web-ext:lint
npm audit --audit-level=critical
```

`npm run test:e2e` runs **only** in CI on `windows-latest` — do **not** run it locally. The local
gate includes coverage; see below.

## Coverage thresholds

`vitest.config.ts` (v8 provider, `src/**/*.{ts,tsx}`):

- lines 90, functions 90, branches 85, statements 90.
- Excludes `src/entrypoints/**`, `src/adapters/firefox/**`, config files, and the adapter
  re-export `src/**/index.ts`. A regression below any threshold fails CI.
