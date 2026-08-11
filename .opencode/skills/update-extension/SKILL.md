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
