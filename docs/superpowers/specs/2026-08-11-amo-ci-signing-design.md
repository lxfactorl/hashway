# AMO-Signed Extension Updates via CI

## Status

Draft design for implementation. Not yet approved for execution.

## Date

2026-08-11

## Goal

Enable the user to use the Hashway extension continuously in their main stable Firefox profile.
Releases on GitHub are signed by Mozilla (AMO) in CI, and a local script installs the signed `.xpi`
into the user's Firefox profile. A project-scoped opencode skill documents and drives the flow.

## Background and constraint

Stable Firefox only permits **permanent** installation of extensions signed by Mozilla (AMO).
Self-signing is not accepted by Firefox. The current setup-phase release (`v0.1.0`) is unsigned and
can only be loaded temporarily via `about:debugging` → Load Temporary Add-on, which disappears on
browser restart.

The approved baseline (`docs/technology-stack-and-repository-requirements.md`) currently states:
- Line 363: "No AMO signing is performed in the first release."
- Line 379: "The agent never has access to provider tokens, AMO credentials, or any release secret.
  The release flow uses only the default `GITHUB_TOKEN`."
- Line 496 / 510: "AMO public distribution and signing (deferred)."

## Decision

Adopt **AMO signing in CI**. This requires amending the approved baseline spec and recording the
decision in an ADR. The flow:

```
GitHub Release (unsigned zip)
  → CI job: web-ext sign (AMO API keys from GitHub Secrets, channel unlisted)
  → signed hashway-v<X.Y.Z>.xpi attached to the same Release
  → user runs: npm run update:extension
  → script downloads the .xpi, writes it to <profile>/extensions/hashway@hashway.local.xpi
  → Firefox loads the signed extension on next start (persistent)
```

## Components

### 1. Spec and ADR amendment

- `docs/technology-stack-and-repository-requirements.md`:
  - Replace the line-379 prohibition with: AMO API keys (`AMO_API_KEY` issuer, `AMO_API_SECRET`)
    are stored in GitHub Secrets for the release workflow only. They are never logged, printed,
    exported to artifacts, or available to agents/local tooling.
  - Update lines 363/496: the first release remains unsigned (temporary install path), but from
    the release where signing lands, a signed `.xpi` is produced by CI and attached to the Release.
    AMO **public distribution is still deferred**; signing uses `--channel=unlisted`.
  - Line 510: "public distribution, update channels" stays deferred; note that CI signing itself
    is now in scope.
- New ADR-002 `docs/decisions/ADR-002-amo-ci-signing.md`:
  - Context: stable Firefox requires AMO signature for permanent install; user wants continuous use.
  - Decision: CI signs via `web-ext sign` with AMO API keys in GitHub Secrets, unlisted channel.
  - Consequences: signed `.xpi` attached to every Release; permanent install path via the local
    updater script; keys never leave CI; agent never accesses keys.

### 2. CI signing step

Modify `.github/workflows/release.yml` job `build-upload`:

- Keep existing build + zip steps (`npm run build`, zip of `dist/`).
- Map the secrets to job-level `env` (secrets cannot be referenced directly in `if:`
  conditionals) and add a signing step, guarded so it **skips when keys are absent**:

  ```yaml
  env:
    AMO_API_KEY: ${{ secrets.AMO_API_KEY }}
    AMO_API_SECRET: ${{ secrets.AMO_API_SECRET }}
  ```
  ```yaml
  - name: Sign extension (AMO)
    if: env.AMO_API_KEY != '' && env.AMO_API_SECRET != ''
    run: |
      npx web-ext sign --source-dir dist --channel unlisted `
        --api-key $env:AMO_API_KEY `
        --api-secret $env:AMO_API_SECRET `
        --artifacts-dir web-ext-artifacts
  ```
  The `Locate signed xpi` and `Upload signed xpi` steps use the same `env`-based guard.

- Upload **both** assets to the Release:
  - `hashway-v<X.Y.Z>.zip` (unsigned, for debugging/temporary load)
  - the signed `hashway-v<X.Y.Z>-an+fx.xpi` produced by web-ext sign (file name confirmed by
    implementer against web-ext 10.6.0 output)
- Note: `web-ext` is already a pinned devDependency (`10.6.0`), so no new dependency.

### 3. Local updater script

New file `scripts/update-extension.ps1`, wired as npm script `update:extension`.

Behavior:
1. Read the profile path from `HASHWAY_FIREFOX_PROFILE` (defined in local `.local.env`; the file is
   gitignored; provide a template `.local.env.example` with an empty/placeholder value).
2. Query the GitHub API for the latest Release of `lxfactorl/hashway` and look for an asset whose
   name ends with `.xpi`.
3. Track the installed version with a marker file next to the extension
   (e.g. `<profile>/extensions/hashway@hashway.local.xpi` plus a sidecar `.version` file, or the
   version embedded in a stored name). Compare against the latest Release version.
4. If newer: download the `.xpi` to a temp file, write it to
   `<profile>/extensions/hashway@hashway.local.xpi`, update the version marker.
5. Print the result: installed version X → Y, and "restart Firefox to load the new version".
6. Error cases reported clearly:
   - No `.xpi` asset in the Release → "CI has not signed this release yet" + hint to check the
     release workflow / AMO keys.
   - `HASHWAY_FIREFOX_PROFILE` missing or directory absent → configuration hint.
   - File locked (Firefox running) → prompt to close Firefox and retry.

### 4. Project-scoped opencode skill

New file `.opencode/skills/update-extension/SKILL.md`:
- Describes the update flow step-by-step: run `npm run update:extension`, verify the reported
  version, restart Firefox, confirm the badge "ON" and the Options page.
- Acts as executor: the agent may run the script and interpret its output.
- Documents diagnostics: no `.xpi`, profile not found, locked file, stale version marker.
- Written in English.

## Open items

- Exact signed `.xpi` filename produced by `web-ext sign` (web-ext 10.6.0) — verify during
  implementation.
- Whether the extension ID file inside the profile requires a specific directory layout for Firefox
  to auto-load a signed xpi (`extensions/hashway@hashway.local.xpi` is the documented layout).
- The user must register on AMO and create API credentials (JWT issuer + secret) — a manual step
  outside the repository; the user provides them, and they are stored as GitHub Secrets.

## Out of scope

- AMO public/listed distribution, update_url update channels, and marketplace publication.
- Automating the AMO account registration or credential creation.
- Windows Task Scheduler auto-updates.
