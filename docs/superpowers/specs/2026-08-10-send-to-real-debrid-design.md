# Specification: Send to Real-Debrid (Firefox Extension)

Date: 2026-08-10
Status: Draft (revised after PRD review)

## 1. Context

The user is a member of private torrent trackers and uses Real-Debrid (RD) to download torrents at high speed. The current manual workflow is multi-step and painful:

1. Find a torrent on the private tracker.
2. Obtain its infohash.
3. Go to btdig.com to find a public magnet for the same content (Real-Debrid cannot join private swarms).
4. Paste the magnet into the Real-Debrid web UI to get a debrid link.
5. Feed the debrid link to JDownloader2 for fast download.

Goal: collapse this into ONE step. Right-click a `.torrent` (or `magnet:`) link on any tracker page, choose "Send to Real-Debrid", and the torrent is added to the user's Real-Debrid account automatically.

## 2. Key Assumptions

- **Approximately 90% of tested popular private-tracker infohashes were found through the available swarm** (empirically tested by the user). We build the magnet directly from the infohash; btdig is NOT part of the product.
- MVP is best-effort: private torrents are not blocked or inspected for `private=1`. The success notification means "accepted/queued by RD", not "will download".
- A torrent that cannot be found through the available swarm may remain in RD without downloading. This is an accepted product limitation; no polling or download verification is performed in MVP.
- The extension is **personal use only**, developed and maintained by an AI agent (opencode). Distribution/CI/CD design is deferred (see Open Items).
- Target platform: **Firefox stable on Windows**.
- User has a **premium Real-Debrid account** (the API rejects non-premium accounts with 403).

## 3. Product Shape

A Firefox WebExtension (MV2) named "Send to Real-Debrid".

- Context menu item on links: "Send to Real-Debrid".
- Options page with a password token field, save/clear controls, a `Test token` action, diagnostics viewer/export, and a link to `https://real-debrid.com/apitoken`.
- No popup UI, no queue, no polling, no JDownloader integration, no btdig.

## 4. Functional Requirements (FR)

### FR-1: Context menu entry
- Register a context menu item "Send to Real-Debrid" on `contexts: ["link"]`.
- Registered globally, but usable only on supported HTTPS tracker pages; Firefox restricted pages may not expose or execute the action.

### FR-2: Link handling by type
| Link type | Behavior |
|---|---|
| `magnet:?xt=urn:btih:<40-hex>` | Validate the v1 btih format. Send to RD as-is in MVP. Display name = `dn` param from the link if present, else tab title. Tracker-parameter sanitization is post-MVP. |
| `https://...` (torrent download link) | Fetch via content script, parse bencode, extract infohash, build magnet with `dn` = tab title, send to RD. |
| `http://...` (non-HTTPS) | Reject with error notification. HTTPS only. |
| Any other scheme (`javascript:`, `data:`, `ftp:`, `mailto:`, etc.) | Reject with error notification. |
| v2-only or hybrid `.torrent` metadata | Reject with error notification. MVP supports v1 metadata only. |

### FR-3: Fetch the `.torrent` file
- The fetch is performed **by a content script injected into the active tab** (via `activeTab`, granted by the context-menu click).
- Only HTTPS URLs with the same origin as the active tracker page are supported. `credentials: include` is used so the tracker's session cookies can authenticate the request.
- Cross-origin URLs, cross-origin redirects, HTTP redirects, and CDN links are rejected in MVP. They require a separate permissions and credential-handling design.
- The `.torrent` bytes are transferred to the background script via `runtime.sendMessage` (structured clone / ArrayBuffer).
- The download URL does not need to end in `.torrent` (Gazelle/UNIT3D-style links like `torrents.php?action=download&id=...` are common); detection is content-based, not URL-extension-based.

### FR-4: Validate the downloaded bytes
- Stream the response and enforce a hard 25 MB size cap before retaining the full buffer. A response exceeding the cap is rejected.
- Require a successful HTTP response before parsing.
- Reject if the content is not bencode: first byte must be `d` (bencode dictionary), and a full parse must yield a top-level dict containing an `info` dict with `name` and (`length` XOR `files`).
- HTML responses (first char `<`) are treated as "session required / not logged in" errors.

### FR-5: Extract the infohash
- Hand-written bencode parser, no dependencies. MVP supports v1 metadata only; v2-only and hybrid metadata are rejected.
- The infohash is SHA-1 over the **exact raw bytes** of the `info` dictionary as they appear in the original file (record byte offsets during parsing; never re-encode).
- Hash computed with Web Crypto API (`crypto.subtle.digest("SHA-1", bytes)`).
- Parser must be defensive: depth limit (~20), string length limits, monotonic cursor, integer bounds; on malformed input fail with a clear error.
- Torrent display name (for the magnet `dn`) = the active tab title for `.torrent` links, or the input magnet `dn` when present.
- Normalize all display names by trimming whitespace/control characters, using `Untitled torrent` when empty, and capping the value at 200 characters.

### FR-6: Build the magnet
- Format: `magnet:?xt=urn:btih:<40-hex>&dn=<URL-encoded tab title>`.
- `dn` is mandatory so the torrent is recognizable in the Real-Debrid account.

### FR-7: Add to Real-Debrid
- Auth: `Authorization: Bearer <token>`, token from the options page, stored in `storage.local`.
- Sequence:
  1. `POST https://api.real-debrid.com/rest/1.0/torrents/addMagnet` with body `magnet=<magnet>`.
     - Success = HTTP **201** (not 200). Response contains the torrent `id`.
  2. `POST https://api.real-debrid.com/rest/1.0/torrents/selectFiles/{id}` with body `files=all`.
     - Success = HTTP **202** ("action already done") or **204** (no content).
- "All files" is the file-selection policy (no filter).
- Sending `files=all` immediately after `addMagnet` is the documented RD pattern; RD completes selection once metadata resolves (torrent may sit in `waiting_files_selection`/`magnet_conversion`).
- MVP does not reconcile an unknown `addMagnet` result by hash. Blind retry behavior follows NFR-2 and may leave an unknown or duplicate remote outcome; reconciliation is post-MVP.

### FR-8: Success feedback
- System notification: `Added: <display name>` where display name is the normalized display name.
- Badge on the extension icon: ✓ on success, ✗ on last error.
- RD error code 33 (`Torrent already active`) is an accepted outcome with notification `Already active in Real-Debrid`.
- RD error code 31 (`Action already done`) is success for `selectFiles`.

### FR-9: Error feedback
- Any failure produces a system notification with a short error message (no buttons).
- If another action is active, show `Busy` and do not queue the new action.
- Notable cases:
  - Missing token → `Real-Debrid token is not configured` and open the Options page.
  - 401 / error code 8 (bad token) → "Invalid Real-Debrid token".
  - Tracker returned login HTML → "Session required on tracker".
  - Cross-origin `.torrent` link (CDN) → "Cross-origin link not supported".
  - HTTP (non-HTTPS) link → "HTTPS only".
  - Non-torrent content / parse failure → "Not a valid .torrent file".
  - RD 503 / error code 25 / rate limit 429 or error code 34 → retry policy applies (NFR-2), then error text if exhausted.
  - Malicious/unexpected scheme → "Unsupported link".

## 5. Non-Functional Requirements (NFR)

| # | Category | Requirement |
|---|---|---|
| 1 | Performance | Target notification latency is ≤ 5 s on ordinary network conditions. A hard 30 s overall timeout prevents an action from hanging indefinitely. |
| 2 | Reliability | Only one active action is allowed at a time; additional clicks receive `Busy` and are not queued. Retry with exponential backoff, max 3 attempts, on transient failures (503, 429, timeout, network). Fail fast on permanent failures (401, 403, 400). Unknown outcomes are surfaced explicitly. |
| 3 | Security | HTTPS only (all outbound requests, including the tracker fetch). Token only in the `Authorization` header, never in URLs, never logged. Minimal permissions. |
| 4 | Compatibility | Firefox stable on Windows. |
| 5 | Maintainability | Developed, tested and fixed entirely by an AI agent; automated tests; reproducible scenarios. |
| 6 | Observability | The extension MUST implement structured diagnostics: a bounded 5 MB ring-buffer event log in `storage.local`, sanitized exception name/message/stack capture, a masked state snapshot, and an Options-page `Download diagnostics` JSON export. A separate geckodriver harness provides deterministic reproduction with fake services. |
| 7 | Language | English for all UI, notifications, code, comments, commits. |
| 8 | Install/Update | Signed release distribution is deferred. MVP development uses temporary unpacked extension installation through Firefox debugging tools. |

### NFR-6 detail: why and what MUST be implemented

**Why:** the extension is developed and maintained exclusively by an AI agent. Runtime evidence and deterministic reproduction reduce dependence on manually reconstructed failures. Direct arbitrary-path file writes are not available to a normal Firefox WebExtension, so MVP uses an explicit JSON export rather than promising invisible direct file access.

**Mandatory (MUST):**

1. **Logging mechanism.** Every action attempt appends structured events to a bounded 5 MB ring buffer in `storage.local`; oldest events are evicted when the cap is reached. Per-action event content:
   - Timestamp, action id, sanitized scheme/origin, magnet/hash,
   - per-step durations (fetch, parse, addMagnet, selectFiles),
   - RD HTTP status plus bounded/redacted error data, retry attempts, final outcome,
   - caught exception name, sanitized message, and stack trace.
   - MUST NOT contain the token, Authorization header, tracker passkey, or sensitive query parameters. The normalized tab title / dn is acceptable.
   - The Options page MUST provide `Download diagnostics`, exporting the current log and masked state snapshot as JSON through the Firefox Downloads API.

2. **Reproduction path.** A geckodriver harness launches Firefox with a test profile, loads the extension, drives a synthetic tracker page and verifies the extension flow against a fake tracker and fake RD API. Network assertions are made through those fake services or a test proxy; geckodriver alone is not a network capture tool. Live RD tests with a personal token are manual and never run in CI.

## 6. Permissions (manifest)

- `contextMenus`, `notifications`, `activeTab`, `storage`, `downloads`.
- `permissions` (MV2): `https://api.real-debrid.com/*`.
- NO `webRequest`, NO `cookies`, NO `<all_urls>`.
- Fixed `browser_specific_settings.gecko.id` so `storage.local` (token, logs, state) survives reloads.

## 7. Component Outline

- `manifest.json` — MV2, permissions above, fixed gecko.id.
- `background.js` — context menu registration, action orchestration, RD API calls, notifications, badge, log writer.
- `content.js` — minimal: on request from background, fetch a same-origin URL and return bytes; no DOM access.
- `bencode.js` — dependency-free bencode parser with bounds/depth guards, returns the exact raw byte range of the `info` dict.
- `options.html` / `options.js` — password token field, save/clear controls, "Test token" button calling `GET /user`, link to /apitoken, and diagnostics export/viewer.
- `log.js` — ring-buffer log writer (bounded), download-as-file export.
- `test/` — deterministic fixtures, fake tracker/RD services, parser tests, and geckodriver harness.

## 8. Verification Steps (implementation-time, not blocking spec)

- Empirical test on the user's real tracker: right-click a `.torrent` link while logged in → confirm binary arrives (validates content-script fetch + cookies).
- Empirical test of cross-origin/CDN links → confirm the error path.
- Geckodriver smoke test: load extension in a test profile, exercise a synthetic right-click against fake services, and assert RD calls, notifications, state, and diagnostics export.
- Parser fixtures: valid v1 single-file/multi-file torrents, malformed bencode, oversized responses, HTML login responses, and v2-only/hybrid rejection.

## 9. Out of Scope (deliberate)

- btdig / public-magnet search (incl. name-based fallback).
- JDownloader2 integration.
- Queue / batch input.
- Popup UI.
- Polling / instantAvailability checks / honest download-status notifications.
- File selection policy beyond "all files".
- OAuth2.
- Multi-user / sharing / public AMO publication.
- Magnet tracker-parameter sanitization and cross-origin/CDN fetch support.

## 10. Deferred Items

- Signed release channel, Mozilla Add-ons unlisted distribution, and update mechanism — deferred to a later session.
- Tech stack, linters, test framework, project culture, AGENTS.md, agentic flows — to be defined in subsequent sessions before development begins.

## 11. Risks & Known Limitations

- Some private infohashes may have no usable public swarm → torrent can remain in RD without downloading. Accepted by user; MVP reports acceptance, not completion.
- Incoming magnet `tr` parameters are passed through in MVP; a tracker URL may contain a private passkey. Sanitization is post-MVP.
- An unknown `addMagnet` network result is not reconciled in MVP; the user receives an explicit unknown-status notification.
- Firefox's `activeTab` + content-script fetch mechanism needs empirical verification. If cookie/partition behavior differs, same-origin fetch is considered unsupported in MVP; a `browser.cookies` fallback requires a separate permissions and security review.
- RD rate limit 250 req/min: the design issues ≤3 requests per action, well within limits.
- Real-Debrid accounts freeze after ~15 days of inactivity → token 401; surfaced as a clear error notification.
