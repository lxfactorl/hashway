# ADR-001: WXT for Firefox MV2, Node 25, and dependency audit policy

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** lxfactorl (owner), AI agent (executor)

## Context

The approved baseline (`docs/technology-stack-and-repository-requirements.md`) requires a
Firefox MV2 WebExtension built with WXT 0.21.3 and TypeScript. Three decisions had to be
validated before locking the toolchain:

1. **WXT MV2 gate:** WXT 0.21.3 must produce a Firefox MV2 manifest (`manifest_version: 2`,
   `browser_action`, `browser_specific_settings.gecko.id: hashway@hashway.local`). If it cannot,
   the spec prescribes a hand-written manifest plus `webextension-polyfill`.
2. **Node version:** the spec pins Node 24 LTS, but the local machine has only Node 25.3.0 and no
   version manager.
3. **npm audit level:** `image-size` (transitive dev-only dependency via `web-ext` →
   `addons-linter`) has high-severity DoS advisories with no patched version, which breaks the
   spec's `npm audit --audit-level=high` gate.

## Decision

### 1. WXT MV2 gate: passed

`wxt build` with `browser: "firefox"` and `manifestVersion: 2` produced a valid MV2 manifest at
`dist/manifest.json` containing `manifest_version: 2`, `browser_action`, the immutable
`browser_specific_settings.gecko.id: hashway@hashway.local`, `options_ui`, and the exact approved
permission allowlist. **No fallback to a hand-written manifest or `webextension-polyfill` is
needed. WXT is the build pipeline.**

WXT-specific notes recorded for future maintainers:

- `wxt.config.ts` sets `srcDir: "src"`, `browser: "firefox"`, `manifestVersion: 2`,
  `outDir: "dist"`, and `outDirTemplate: "."` so the built artifact lands directly at
  `dist/manifest.json` for `web-ext lint` and the manifest-contract test.
- `wxt/client` does **not** exist in wxt 0.21.3. The global `browser` type comes from the
  generated `.wxt/wxt.d.ts`, included via `tsconfig.json`/`tsconfig.tests.json`. `wxt prepare`
  runs before `tsc` and `eslint` (see `package.json` scripts) so CI has the generated types.
- Vitest 4 no longer exposes `@vitest/coverage-v8` as a Vite plugin; `vitest.config.ts` uses
  `test.coverage.provider: "v8"`.
- `data_collection_permissions: { required: ["none"] }` is declared because Firefox requires it
  for extensions submitted to AMO from Nov 3, 2025. Hashway collects no data. Firefox < 140
  ignores this key, producing two `web-ext lint` warnings (0 errors) that are expected and safe.

### 2. Node 25 instead of Node 24 LTS (approved deviation)

The local machine has only Node 25.3.0 and no version manager (nvm/fnm absent). Pinning to Node 24
would make every local run diverge from CI. Approved: `.nvmrc` is `25`, `engines.node` is
`">=25.0.0 <26.0.0"`, and CI's `actions/setup-node` reads `.nvmrc`. Local development mirrors CI.

### 3. `npm audit --audit-level=critical` instead of `--audit-level=high`

`npm audit fix --force` proposes downgrading `web-ext` to 5.5.0, which breaks the peer
requirement of `wxt` (`web-ext >= 9.2.0`) and is not a real fix. The offending advisories:

- `GHSA-w3rx-r6r6-pgpr` (image-size ICNS parser, DoS infinite loop)
- `GHSA-5p2g-fcmc-qvqq` (image-size JXL/HEIF parsers, DoS infinite loops)

`image-size` affected range is `<= 2.0.2` and **patched version: none**. It is a dev-only
transitive dependency (lint-time image parsing inside `addons-linter`), unreachable from shipped
extension code. Exploitability requires a crafted image buffer supplied to the linter. Approved
gate: `npm audit --audit-level=critical` (blocks criticals). Revert to `--audit-level=high` once a
patched `image-size` is released.

## Consequences

- WXT is the build pipeline for the first release and beyond; no manifest fallback.
- Node 25 toolchain across local, CI, `.nvmrc`, and `engines.node`.
- Dependency-security gate tolerates the known unpatched high advisories and blocks criticals.
- Version pinning exceptions recorded in commit messages:
  `web-ext@10.6.0` (peer requirement), `@types/selenium-webdriver@4.35.6` (4.25.0 not on registry),
  `vitest@4.1.10`/`@vitest/coverage-v8@4.1.10` (critical fix), `typescript-eslint@8.67.0`
  (eslint 10 support), `@eslint/js@10.0.1` (10.0.0 deprecated).
