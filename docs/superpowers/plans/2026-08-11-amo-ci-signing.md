# AMO CI-Signing + Local Extension Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the user to use Hashway continuously in their main stable Firefox profile by having CI sign releases with Mozilla (AMO) and providing a local script that installs the signed `.xpi` into the profile, plus a project-scoped opencode skill that documents and drives the flow.

**Architecture:** Extends the existing release pipeline. `release.yml`'s `build-upload` job gains a guarded `web-ext sign` step (AMO API keys from GitHub Secrets, `--channel unlisted`) that attaches a signed `.xpi` to the Release alongside the existing `.zip`. A local PowerShell script (`scripts/update-extension.ps1`) queries the GitHub API for the latest Release, downloads the `.xpi`, and writes it to `<profile>/extensions/hashway@hashway.local.xpi` (Firefox auto-loads signed extensions from this directory). A project-scoped opencode skill (`.opencode/skills/update-extension/SKILL.md`) documents and drives the flow. The approved baseline spec is amended to permit AMO keys in CI, recorded in ADR-002.

**Tech Stack:** GitHub Actions (windows-latest), `web-ext` 10.6.0 (already pinned), PowerShell 5.1, `gh` CLI, Firefox profile directory layout, opencode skill format.

## Global Constraints

- **No secrets in git, logs, or artifacts.** AMO API keys (`AMO_API_KEY`, `AMO_API_SECRET`) live only in GitHub Secrets and are consumed by the release workflow via `${{ secrets.* }}`. They are never printed, exported to artifacts, or available to agents/local tooling.
- **`web-ext` 10.6.0** is already a pinned devDependency. No new dependencies.
- **Conventional Commits** for every commit (enforced by commitlint in CI).
- **All written artifacts in English.**
- **Do not run `npm run test:e2e` locally.**
- The user must register on AMO and create API credentials (JWT issuer + secret) as a **manual step outside the repo**; until then the CI signing step skips and releases ship only the unsigned `.zip`.
- **Agent never accesses AMO keys.** The updater script works purely from the public GitHub API.
- `.local.env` is gitignored. Provide `.local.env.example` (committed) with a placeholder value for `HASHWAY_FIREFOX_PROFILE`.

---

## File Structure (across tasks)

```text
docs/technology-stack-and-repository-requirements.md   # Task 1 (amend)
docs/decisions/ADR-002-amo-ci-signing.md               # Task 1 (create)
.github/workflows/release.yml                          # Task 2 (modify)
scripts/update-extension.ps1                           # Task 3 (create)
.local.env.example                                     # Task 3 (create)
package.json                                           # Task 3 (modify: script)
.opencode/skills/update-extension/SKILL.md             # Task 4 (create)
```

---

## Task 1: Amend the baseline spec + write ADR-002

**Files:**
- Modify: `docs/technology-stack-and-repository-requirements.md`
- Create: `docs/decisions/ADR-002-amo-ci-signing.md`

**Interfaces:** Produces the approved documentation that legalizes AMO keys in CI. Task 2's CI changes depend on this being committed first (reviewer gate).

- [ ] **Step 1: Amend the baseline spec**

Edit `docs/technology-stack-and-repository-requirements.md`:

1. Find the line containing `The agent never has access to provider tokens, AMO credentials, or any release secret. The release flow uses only the default GITHUB_TOKEN.` and replace it with:

```text
- The agent never has access to provider tokens, AMO credentials, or any release secret.
- AMO API credentials (`AMO_API_KEY` = JWT issuer, `AMO_API_SECRET` = JWT secret) are stored in
  GitHub Secrets for the release workflow only. They are consumed via `${{ secrets.* }}`, never
  logged, printed, exported to artifacts, or exposed to agents/local tooling. The updater script
  (`npm run update:extension`) uses only the public GitHub API.
```

2. Find the line `- The developer installs a new version by downloading the zip from the GitHub Release and loading it in Firefox via about:debugging → Load Temporary Add-on. No AMO signing is performed in the first release.` and replace it with:

```text
- The developer installs a new version by downloading the zip from the GitHub Release and loading
  it in Firefox via `about:debugging` → Load Temporary Add-on. From the first release that lands
  after CI signing is enabled, the Release also carries a signed `hashway-vX.Y.Z-an+fx.xpi`
  (AMO, `--channel unlisted`) for permanent installation via `npm run update:extension`, which
  writes the xpi to `<profile>/extensions/hashway@hashway.local.xpi`. AMO public/listed
  distribution and update channels remain deferred.
```

3. Find the `AMO public distribution and signing (deferred).` line (under deferred/out-of-scope) and replace it with:

```text
- AMO public/listed distribution, update channels, and marketplace publication (deferred).
  Note: AMO *signing* itself is now in scope (unlisted channel, CI-signed `.xpi`); see
  `docs/decisions/ADR-002-amo-ci-signing.md`.
```

- [ ] **Step 2: Write `docs/decisions/ADR-002-amo-ci-signing.md`**

```markdown
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

1. `release.yml` job `build-upload` gains a guarded signing step:
   `npx web-ext sign --source-dir dist --channel unlisted --api-key ${{ secrets.AMO_API_KEY }}
   --api-secret ${{ secrets.AMO_API_SECRET }} --artifacts-dir web-ext-artifacts`.
   The step runs only when both secrets are present (`if: ${{ secrets.AMO_API_KEY != '' &&
   secrets.AMO_API_SECRET != '' }}`); otherwise it skips and the Release carries only the unsigned
   zip.
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
```

- [ ] **Step 3: Commit**

```bash
git add docs/technology-stack-and-repository-requirements.md docs/decisions/ADR-002-amo-ci-signing.md
git commit -m "docs: amend baseline for AMO CI signing and add ADR-002"
```

---

## Task 2: Add the CI signing step to `release.yml`

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:** Consumes the ADR-002 decision (Task 1). Produces the workflow change so that when the owner adds `AMO_API_KEY`/`AMO_API_SECRET` secrets, future Releases carry a signed `.xpi`. Later tasks rely on the `.xpi` asset existing in Releases.

- [ ] **Step 1: Add the signing step and the xpi upload**

Edit `.github/workflows/release.yml` job `build-upload`. Keep the existing `npm ci`, `npm run build`, `Zip dist`, and zip upload steps. Insert a signing step after `Zip dist` and add a second upload step.

The final `build-upload` job should be:

```yaml
  build-upload:
    needs: release-please
    if: needs.release-please.outputs.releases_created == 'true'
    runs-on: windows-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Zip dist
        run: Compress-Archive -Path dist/* -DestinationPath hashway-v${{ needs.release-please.outputs.tag_name }}.zip
      - name: Sign extension (AMO)
        if: ${{ secrets.AMO_API_KEY != '' && secrets.AMO_API_SECRET != '' }}
        env:
          AMO_API_KEY: ${{ secrets.AMO_API_KEY }}
          AMO_API_SECRET: ${{ secrets.AMO_API_SECRET }}
        run: |
          npx web-ext sign --source-dir dist --channel unlisted `
            --api-key $env:AMO_API_KEY `
            --api-secret $env:AMO_API_SECRET `
            --artifacts-dir web-ext-artifacts
      - name: Upload zip asset
        uses: actions/upload-release-asset@e8f9f06c4b078e705bd2ea027f0926603fc9b4d5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ needs.release-please.outputs.upload_url }}
          asset_path: hashway-v${{ needs.release-please.outputs.tag_name }}.zip
          asset_name: hashway-v${{ needs.release-please.outputs.tag_name }}.zip
          asset_content_type: application/zip
      - name: Upload signed xpi
        if: ${{ secrets.AMO_API_KEY != '' && secrets.AMO_API_SECRET != '' }}
        uses: actions/upload-release-asset@e8f9f06c4b078e705bd2ea027f0926603fc9b4d5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ needs.release-please.outputs.upload_url }}
          asset_path: hashway-v${{ needs.release-please.outputs.tag_name }}-an+fx.xpi
          asset_name: hashway-v${{ needs.release-please.outputs.tag_name }}-an+fx.xpi
          asset_content_type: application/x-xpinstall
```

**Note:** the exact signed filename produced by `web-ext sign` (web-ext 10.6.0) is expected to be
`<slug>-<version>-an+fx.xpi`. If the CI run shows a different filename after real signing, update
`asset_path`/`asset_name` accordingly (record the deviation in the commit message).

- [ ] **Step 2: Validate the workflow file parses**

The `yaml` npm package is not present and `actionlint` is not installed. Validate by pushing the
branch and relying on GitHub Actions to parse the file when CI runs (Step 3 covers this). Locally,
at minimum, verify no accidental tab characters / quoting breakage by reading the file:

```bash
git diff .github/workflows/release.yml
```

- [ ] **Step 3: Open a PR and confirm CI parses the workflow**

```bash
git checkout -b feat/amo-ci-signing
git add .github/workflows/release.yml
git commit -m "ci: sign releases with AMO and upload the signed xpi"
git push -u origin feat/amo-ci-signing
gh pr create --title "ci: sign releases with AMO and upload the signed xpi" --body "Adds a guarded web-ext sign step to the release workflow. Without AMO_API_KEY/AMO_API_SECRET secrets the step skips; with them, a signed .xpi is uploaded next to the zip."
gh pr checks --watch
```

Expected: `quality`, `commitlint`, `e2e` all pass. If the workflow YAML is malformed, GitHub
Actions reports a workflow parse error in the checks — fix and re-push. Do NOT merge yet (Task 4
and the opencode skill are part of the same logical change; the plan merges once at the end, or
merge here if executing task-by-task with the user's approval).

- [ ] **Step 4: Commit (already done in Step 3) — no additional commit.**

---

## Task 3: Local updater script + npm script + `.local.env.example`

**Files:**
- Create: `scripts/update-extension.ps1`
- Create: `.local.env.example`
- Modify: `package.json` (add `update:extension` script)

**Interfaces:** Consumes the signed `.xpi` asset in GitHub Releases (Task 2). Produces `npm run update:extension`, which the opencode skill (Task 4) drives. Reads `HASHWAY_FIREFOX_PROFILE` from `.local.env` (user-supplied; gitignored).

- [ ] **Step 1: Write `scripts/update-extension.ps1`**

```powershell
# update-extension.ps1
# Downloads the latest AMO-signed Hashway .xpi from GitHub Releases and
# installs it into the configured Firefox profile.
#
# Requires:
#   - gh CLI authenticated (or GITHUB_TOKEN env var)
#   - .local.env with HASHWAY_FIREFOX_PROFILE=<full path to the profile dir>
# Usage:
#   npm run update:extension

$ErrorActionPreference = "Stop"
$repo = "lxfactorl/hashway"
$extensionId = "hashway@hashway.local"

function Load-LocalEnv {
    $envFile = Join-Path $PSScriptRoot "..\.local.env"
    if (-not (Test-Path $envFile)) {
        Write-Error "Missing .local.env. Copy .local.env.example to .local.env and set HASHWAY_FIREFOX_PROFILE."
    }
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $kv = $line -split "=", 2
            Set-Item -Path ("Env:" + $kv[0].Trim()) -Value $kv[1].Trim()
        }
    }
}

function Get-GhReleaseJson {
    param([string]$Arg)
    if ($env:GITHUB_TOKEN) {
        $headers = @{ Authorization = "Bearer $env:GITHUB_TOKEN" }
        $uri = "https://api.github.com/repos/$repo/releases/$Arg"
        return Invoke-RestMethod -Uri $uri -Headers $headers
    }
    $out = gh release view $Arg --repo $repo --json tagName,assets 2>&1
    if ($LASTEXITCODE -ne 0) { throw "gh failed: $out" }
    return ($out | ConvertFrom-Json)
}

function Write-Result {
    param([string]$Message)
    Write-Output $Message
}

try {
    Load-LocalEnv

    $profile = $env:HASHWAY_FIREFOX_PROFILE
    if ([string]::IsNullOrWhiteSpace($profile)) {
        Write-Error "HASHWAY_FIREFOX_PROFILE is empty. Set it in .local.env to the Firefox profile directory."
    }
    if (-not (Test-Path $profile)) {
        Write-Error "Firefox profile directory not found: $profile"
    }

    $release = Get-GhReleaseJson "latest"
    if (-not $release) { throw "Could not fetch the latest release." }
    $xpiAsset = $release.assets | Where-Object { $_.name -like "*.xpi" } | Select-Object -First 1

    if (-not $xpiAsset) {
        Write-Result "Release $($release.tag_name) has no signed .xpi asset yet."
        Write-Result "CI signing skips until AMO_API_KEY and AMO_API_SECRET are set in GitHub Secrets."
        exit 0
    }

    $extensionsDir = Join-Path $profile "extensions"
    if (-not (Test-Path $extensionsDir)) {
        New-Item -ItemType Directory -Path $extensionsDir -Force | Out-Null
    }

    $versionFile = Join-Path $extensionsDir "$extensionId.version"
    $installedVersion = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { "" }
    $latestVersion = $release.tag_name.TrimStart("v")

    if ($installedVersion -eq $latestVersion) {
        Write-Result "Already on latest version $latestVersion. Nothing to do."
        exit 0
    }

    $tempXpi = Join-Path $env:TEMP "hashway-$latestVersion.xpi"
    Invoke-WebRequest -Uri $xpiAsset.browser_download_url -OutFile $tempXpi

    $destXpi = Join-Path $extensionsDir "$extensionId.xpi"
    Copy-Item -Path $tempXpi -Destination $destXpi -Force
    Set-Content -Path $versionFile -Value $latestVersion
    Remove-Item -Path $tempXpi -Force

    Write-Result "Installed Hashway $latestVersion to $destXpi"
    Write-Result "Restart Firefox to load the new version."
} catch {
    Write-Error $_
    exit 1
}
```

- [ ] **Step 2: Write `.local.env.example`**

```text
# Copy to .local.env and fill in your Firefox profile directory, e.g.:
#   %APPDATA%\Mozilla\Firefox\Profiles\ive7aorw.default-release
# Find it via about:profiles in Firefox.
HASHWAY_FIREFOX_PROFILE=
```

- [ ] **Step 3: Add the npm script**

Edit `package.json` `scripts` block; add after `test:e2e`:

```json
    "update:extension": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/update-extension.ps1"
```

- [ ] **Step 4: Verify the script error paths (no live network side effects required)**

The `.local.env` does not exist yet, so the config-missing path is testable:

```bash
npm run update:extension
```

Expected: exits non-zero with `Missing .local.env. Copy .local.env.example to .local.env and set HASHWAY_FIREFOX_PROFILE.`

Then create `.local.env` with an empty `HASHWAY_FIREFOX_PROFILE=` and re-run:

```bash
npm run update:extension
```

Expected: exits non-zero with `HASHWAY_FIREFOX_PROFILE is empty...`. Remove `.local.env` afterwards
(do not commit it; it is gitignored).

- [ ] **Step 5: Commit**

```bash
git add scripts/update-extension.ps1 .local.env.example package.json
git commit -m "feat: add update:extension script that installs the signed xpi into the Firefox profile"
```

---

## Task 4: Project-scoped opencode skill

**Files:**
- Create: `.opencode/skills/update-extension/SKILL.md`

**Interfaces:** Consumes `npm run update:extension` (Task 3) and the GitHub Release artifacts (Task 2). Produces the skill an agent loads when the user asks to update Hashway in Firefox.

- [ ] **Step 1: Write `.opencode/skills/update-extension/SKILL.md`**

```markdown
---
name: update-extension
description: Use when the user wants to update or install the Hashway extension in their Firefox profile from the latest GitHub Release, or when the signed .xpi is missing, the profile path is not configured, or Firefox reports the extension as not loading. Drives `npm run update:extension` and interprets its output.
---

# Updating the Hashway Extension in Firefox

Hashway is permanently installed in the main Firefox profile as a signed AMO `.xpi`. Each GitHub
Release carries an unsigned `hashway-v<X.Y.Z>.zip` (debugging/temporary load) and, once CI signing
is configured, a signed `hashway-v<X.Y.Z>-an+fx.xpi`.

## Prerequisites

- `.local.env` at the repo root with `HASHWAY_FIREFOX_PROFILE=<full path to the profile dir>`.
  Find the profile path via `about:profiles` in Firefox. `.local.env` is gitignored; copy from
  `.local.env.example`.
- `gh` CLI authenticated (or `GITHUB_TOKEN` env var) for the GitHub API.

## Update flow

1. Run the updater:

   ```bash
   npm run update:extension
   ```

2. Interpret the output:

   - `Installed Hashway <version> to <profile>/extensions/hashway@hashway.local.xpi` — success.
     Ask the user to restart Firefox, then verify the toolbar badge shows `ON` and the Options page
     renders "Hashway".
   - `Already on latest version <version>. Nothing to do.` — up to date; no action needed.
   - Exit non-zero — see diagnostics below.

## Diagnostics

- **`Missing .local.env...`** — create `.local.env` from `.local.env.example` and set
  `HASHWAY_FIREFOX_PROFILE`.
- **`HASHWAY_FIREFOX_PROFILE is empty...`** — fill in the profile path in `.local.env`.
- **`Firefox profile directory not found: <path>`** — the path is wrong; re-check `about:profiles`.
- **`Release <tag> has no signed .xpi asset yet.`** — CI signing is not configured. Check that
  `AMO_API_KEY` and `AMO_API_SECRET` GitHub Secrets exist and that the release workflow ran the
  `Sign extension (AMO)` step. Until then, the user can load the unsigned zip temporarily via
  `about:debugging` → Load Temporary Add-on.
- **File locked / "being used by another process"** — Firefox is running; ask the user to close
  Firefox and re-run.
- **Stale version marker** — delete `<profile>/extensions/hashway@hashway.local.xpi` and the
  `hashway@hashway.local.version` sidecar, then re-run.

## Security rules

- Never log, print, or echo `AMO_API_KEY`, `AMO_API_SECRET`, `GITHUB_TOKEN`, or the Real-Debrid
  token. The updater script never touches AMO keys; it uses only the public GitHub API.
- `.local.env` must never be committed.

## Verification after update

1. Firefox restarted.
2. Toolbar badge shows `ON` (green).
3. Right-click the extension icon → Manage Extension → page shows "Hashway" and the placeholder
   text.
```

- [ ] **Step 2: Validate skill frontmatter**

`name` must be lowercase-hyphenated and match the folder name (`update-extension`), and
`description` must exist. Verify by reading the file head:

```bash
Get-Content .opencode/skills/update-extension/SKILL.md -TotalCount 4
```

- [ ] **Step 3: Commit**

```bash
git add .opencode/skills/update-extension/SKILL.md
git commit -m "feat: add project-scoped opencode skill for updating the extension"
```

Note: the skill is discovered at opencode startup. Remind the user to **quit and restart opencode**
for the skill to appear.

---

## Final verification

Run the full agent-side gate sequence (no e2e locally):

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

Then push the branch, open/update the PR from Task 2 (or a combined PR), and confirm `quality`,
`commitlint`, `e2e` pass.

## Human-gated steps

1. **AMO registration + API credentials** (outside the repo): the owner registers on
   addons.mozilla.org and creates JWT API credentials, then adds `AMO_API_KEY` and
   `AMO_API_SECRET` as GitHub Secrets (manual, with explicit user consent — never by the agent).
2. **PR approval/merge** for the CI/skill/script changes.
3. **First real signed release**: after secrets are added, the next Release must run the
   `Sign extension (AMO)` step; verify the `.xpi` asset appears and the updater installs it.
4. **opencode restart** so the new skill is discovered.
