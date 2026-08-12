# Diagnostics — Send to Real-Debrid

Status: Documents the implemented diagnostics subsystem. The [design spec](superpowers/specs/2026-08-10-send-to-real-debrid-design.md)
NFR-6 defines the requirement; the code in `src/adapters/diagnostics/` and
`src/adapters/storage/versioned-storage.ts` is authoritative.

## Bounded ring buffer in storage.local

Diagnostics live under the versioned key `hashway.v1.diagnostics`
(`STORAGE_KEYS.diagnostics` in `src/adapters/storage/versioned-storage.ts`).

- `src/adapters/diagnostics/ring-buffer.ts` `createRingBuffer(storage, maxBytes = 4 MiB)`:
  - `append(event)` reads the current events, pushes `sanitizeEvent(event)`, then evicts oldest
    events (`.shift()`) while the serialized JSON size exceeds the 4 MiB budget.
  - `snapshot()` returns the current events array.
- The stored value is the envelope `{ version: 1, events }`
  (`DIAGNOSTICS_SCHEMA_VERSION = 1`). On read, `getDiagnostics()` unwraps the envelope, accepts a
  legacy bare array as-is, and returns `[]` for missing/unparseable values.
- Both entrypoints create the buffer with the production budget:
  `createRingBuffer(storage, 4 * 1024 * 1024)` (background and options).

The 4 MiB budget stays below the nominal `storage.local` quota so the token key and diagnostics
coexist without quota failures.

## What is recorded

The background entrypoint (`src/entrypoints/background.ts`) appends one event per action:

- Success path: `{ intent: redactIntent(intent), outcome: out }` where `outcome` is the closed
  `Outcome` (`accepted` / `already_active` / `failed` / `unknown_outcome`).
- Unexpected exception path: `{ intent: { linkUrl: redactUrl(linkUrl) }, error: message }`.
- `redactIntent` applies `redactUrl` to both `linkUrl` and `pageUrl` and keeps `tabTitle`.

The options page (`src/entrypoints/options/main.ts`) renders the current events as indented JSON in
a textarea and reloads it on page load.

## Redaction rules

`src/adapters/diagnostics/redaction.ts`:

- `DROP_KEYS = { token, authorization, passkey, secret, apikey }` — object keys matching these
  names (case-insensitive) are removed recursively by `sanitizeEvent`; header keys matching them are
  removed by `redactHeaders`.
- `sanitizeEvent(value)`: recursively sanitizes arrays and objects, rebuilding any `magnet:` string
  from `sanitizeMagnet` (only `xt` + `dn`, no tracker parameters).
- `redactUrl(url)`: returns `origin + pathname` only — query strings and fragments are dropped; an
  invalid URL becomes `<invalid url>`.

The intent recorded in diagnostics is pre-redacted in the background (`redactUrl` on link/page URL),
and the ring buffer applies `sanitizeEvent` again on append. Token, Authorization header, tracker
passkey, and sensitive query parameters never reach the buffer.

## JSON export

- `src/adapters/diagnostics/export.ts` `exportDiagnostics(downloads, buf)` snapshots the buffer and
  builds the payload envelope:
  ```json
  {
    "exportedAt": "<ISO-8601>",
    "version": 1,
    "events": [ ... ]
  }
  ```
  It writes the file `hashway-diagnostics.json` through the `DownloadsPort`.
- `src/application/export-diagnostics.ts` is the thin use case delegating to an injected export
  function.
- `src/adapters/firefox/downloads.ts` encodes the JSON to a `data:application/json;base64,` URL and
  calls `browser.downloads.download({ url, filename, saveAs: false })`. The download never hits the
  network and never includes secrets (events are already sanitized).

## Options-page Download diagnostics

The options page's **Download diagnostics** button (`#download-diagnostics`) calls the export use
case and reports "Diagnostics downloaded" (or the error) in the status line.

## Failure artifacts (E2E)

The E2E integration test (`tests/e2e/send-to-rd.e2e.ts`) does not drive a browser, so it writes no
screenshots. The `hello-world.e2e.ts` Selenium test captures SEVERE console errors only. See
`docs/testing.md`.
