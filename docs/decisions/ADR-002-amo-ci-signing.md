# ADR-002: AMO CI Signing for Permanent Firefox Installation

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** lxfactorl (owner), AI agent (executor)

## Context

Stable Firefox only permits **permanent** installation of extensions signed by Mozilla (AMO).
Self-signing is not accepted. The first release (`v0.1.0`) is unsigned and can only be loaded
temporarily via `about:debugging` → Load Temporary Add-on, which disappears on browser restart.
The owner wants to use Hashway continuously in their main stable Firefox profile and to replace
the installed version from each new GitHub Release.

The approved baseline (`docs/technology-stack-and-repository-requirements.md`) originally
prohibited any AMO credentials in CI (line 379) and deferred all signing.

## Decision

Adopt **AMO signing in CI**:

1. `release.yml` job `build-upload` maps the secrets to job-level environment variables
   (`AMO_API_KEY`, `AMO_API_SECRET`) and gains a guarded signing step:
   `npx web-ext sign --source-dir dist --channel unlisted --api-key $env:AMO_API_KEY
--api-secret $env:AMO_API_SECRET --artifacts-dir web-ext-artifacts`.
   The step runs only when both env vars are present (`if: env.AMO_API_KEY != '' &&
env.AMO_API_SECRET != ''`); otherwise it skips and the Release carries only the unsigned
   zip. Secrets cannot be referenced directly in `if:` conditionals, so the guard uses the
   job-level env values instead.
2. The signed `hashway-v<X.Y.Z>-an+fx.xpi` is uploaded to the same GitHub Release.
3. A local script `npm run update:extension` (`scripts/update-extension.ps1`) downloads the latest
   signed `.xpi` from the public GitHub API and writes it to
   `<profile>/extensions/hashway@hashway.local.xpi`. Firefox auto-loads signed extensions from the
   profile `extensions/` directory on the next launch.
4. The baseline spec is amended (this ADR) to permit AMO keys in GitHub Secrets for the release
   workflow only.

## Consequences

- Every Release from the point signing lands carries a signed `.xpi`; the owner runs one command
  to update the extension in the main profile and restarts Firefox.
- AMO API keys never leave CI: they are GitHub Secrets, never logged, never in artifacts, never
  visible to agents or local tooling.
- Until the owner provides AMO credentials, CI signing skips; releases remain unsigned
  (temporary-load only). This is safe and expected.
- AMO public/listed distribution, `update_url` update channels, and marketplace publication remain
  deferred and out of scope.
