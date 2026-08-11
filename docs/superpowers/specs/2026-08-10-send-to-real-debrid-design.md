# Specification: Send to Real-Debrid (Firefox Extension)

Date: 2026-08-10
Status: Revised to align with the approved technology-stack baseline (`docs/technology-stack-and-repository-requirements.md`, 2026-08-11). Ready for implementation planning.

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
- The extension is **personal use only**, developed and maintained by an AI agent (opencode). Distribution, CI/CD, signing, and the release pipeline are implemented and operational (see `docs/decisions/ADR-002-amo-ci-signing.md` and `AGENTS.md`).
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
| `magnet:?xt=urn:btih:<40-hex>` | Validate the v1 btih format. **Sanitize the magnet: keep only `xt` and `dn`; drop `tr`, `xs`, `x.pe`, and any other unknown parameters** to prevent tracker credential (passkey) leakage to Real-Debrid. Display name = sanitized `dn` param if present, else tab title. |
| `https://...` (torrent download link) | Fetch via content script, parse bencode, extract infohash, build a magnet with `dn` = tab title and **no tracker parameters** (`magnet:?xt=urn:btih:<hash>&dn=<dn>`). Send to RD. |
| `http://...` (non-HTTPS) | Reject with error notification. HTTPS only. |
| Any other scheme (`javascript:`, `data:`, `ftp:`, `mailto:`, etc.) | Reject with error notification. |
| v2-only or hybrid `.torrent` metadata | Reject with error notification. MVP supports v1 metadata only. |

### FR-3: Fetch the `.torrent` file
- The fetch is performed **by a content script injected into the active tab** (via `activeTab`, granted by the context-menu click).
- Only HTTPS URLs with the same origin as the active tracker page are supported. `credentials: "include"` is used so the tracker's session cookies can authenticate the request.
- **`redirect: "error"` is used. Any redirect (cross-origin OR same-origin) is rejected immediately.** This prevents tracker session cookies from reaching another origin and avoids credential leakage through redirect chains.
- Cross-origin URLs, HTTP redirects, and CDN links are rejected in MVP. They require a separate permissions and credential-handling design.
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
- Torrent display name (for the magnet `dn`) = the active tab title for `.torrent` links, or the sanitized input magnet `dn` when present.
- Normalize all display names by trimming whitespace/control characters, using `Untitled torrent` when empty, and capping the value at 200 characters.

### FR-6: Build the magnet
- Format: `magnet:?xt=urn:btih:<40-hex>&dn=<URL-encoded display name>`.
- **No tracker parameters (`tr`), no source (`xs`), no `x.pe`, and no unknown parameters are added.** The magnet contains only `xt` and `dn`.
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
- **`addMagnet` is NEVER retried.** `addMagnet` creates a remote resource; it has unsafe retry semantics because the remote operation may already have succeeded. This applies to: timeouts, connection resets, DNS failures, network errors (ambiguous), AND explicit transient provider responses (429 rate limit, 503 service unavailable). In every non-201 case the action stops and surfaces either a classified provider error (provider_transient / provider_auth / provider_permanent) or, when the outcome is ambiguous (timeout / connection reset / no definitive server response), `unknown_outcome` with the notification `Unknown outcome — check your Real-Debrid account`. Reconciliation by hash is post-MVP.
- **`selectFiles` is retried only when `addMagnet` succeeded with a concrete `id`.** `selectFiles` is idempotent (RD error code 31 = "action already done"), so retrying it on transient failure is safe.
- The closed error taxonomy (`user_input`, `configuration`, `tracker_auth`, `provider_auth`, `provider_permanent`, `provider_transient`, `unknown_outcome`, `internal`) is used for every outcome. `unknown_outcome` is never presented as either success or failure (see NFR-2).

### FR-8: Success feedback
- System notification: `Added: <display name>` where display name is the normalized display name.
- Badge on the extension icon: ✓ on success, ✗ on last error.
- RD error code 33 (`Torrent already active`) is an accepted outcome with notification `Already active in Real-Debrid`.
- RD error code 31 (`Action already done`) is success for `selectFiles`.
- **`unknown_outcome` (addMagnet timed out / ambiguous network result) produces the notification `Unknown outcome — check your Real-Debrid account` and a ✗ badge.** It is never shown as success.

### FR-9: Error feedback
- Any failure produces a system notification with a short error message (no buttons).
- If another action is active, show `Busy` and do not queue the new action.
- Notable cases:
  - Missing token → `Real-Debrid token is not configured` and open the Options page.
  - 401 / error code 8 (bad token) → "Invalid Real-Debrid token".
  - Tracker returned login HTML → "Session required on tracker".
  - Cross-origin `.torrent` link (CDN) → "Cross-origin link not supported".
  - **Any HTTP redirect (incl. same-origin) during the `.torrent` fetch → "Redirect not allowed".**
  - HTTP (non-HTTPS) link → "HTTPS only".
  - Non-torrent content / parse failure → "Not a valid .torrent file".
  - RD 503 / error code 25 / rate limit 429 or error code 34 → retry policy applies (NFR-2) **only to `selectFiles`** (never to `addMagnet`); then error text if exhausted.
  - `addMagnet` timeout / ambiguous network / explicit 503 or 429 → "Unknown outcome — check your Real-Debrid account" (no retry).
  - Malicious/unexpected scheme / cross-origin link → "Cross-origin link not supported".

## 5. Non-Functional Requirements (NFR)

| # | Category | Requirement |
|---|---|---|
| 1 | Performance | Target notification latency is ≤ 5 s on ordinary network conditions. A hard 30 s overall deadline prevents an action from hanging indefinitely. |
| 2 | Reliability | Only one active action is allowed at a time; additional clicks receive `Busy` and are not queued. Retry with exponential backoff, max 3 attempts, on transient failures (503, 429, network) **only for operations with safe retry semantics**: `selectFiles` (idempotent; RD error code 31 = already done) and `validate-token` (`GET /user`). **`addMagnet` is NEVER retried** because it creates a remote resource and the remote operation may already have succeeded. Honor `Retry-After` when it fits within the 30 s overall action deadline. Fail fast on permanent failures (401, 403, 400). Unknown outcomes are surfaced explicitly via the `unknown_outcome` taxonomy entry and never shown as success or failure. |
| 3 | Security | HTTPS only (all outbound requests, including the tracker fetch). `redirect: "error"` on the tracker fetch to reject any redirect. Token only in the `Authorization` header, never in URLs, never logged. Magnet sanitization removes `tr`, `xs`, `x.pe`, and unknown parameters to prevent passkey leakage. Minimal permissions. |
| 4 | Compatibility | Firefox stable on Windows. |
| 5 | Maintainability | Developed, tested and fixed entirely by an AI agent; automated tests; reproducible scenarios. Hexagonal architecture with enforced layer boundaries (eslint `no-restricted-imports`). |
| 6 | Observability | The extension MUST implement structured diagnostics: a bounded **4 MiB** ring-buffer event log in `storage.local` (kept below the nominal ~5 MiB storage.local quota), sanitized exception name/message/stack capture, a masked state snapshot, and an Options-page `Download diagnostics` JSON export. A separate geckodriver harness provides deterministic reproduction with fake services. |
| 7 | Language | English for all UI, notifications, code, comments, commits. |
| 8 | Install/Update | Signed release distribution via AMO CI signing (`web-ext sign --channel unlisted`) and the `npm run update:extension` flow are implemented. MVP feature development uses temporary unpacked extension installation through Firefox debugging tools for iteration; permanent installation uses the signed `.xpi` from the GitHub Release. |

### NFR-6 detail: why and what MUST be implemented

**Why:** the extension is developed and maintained exclusively by an AI agent. Runtime evidence and deterministic reproduction reduce dependence on manually reconstructed failures. Direct arbitrary-path file writes are not available to a normal Firefox WebExtension, so MVP uses an explicit JSON export rather than promising invisible direct file access.

**Mandatory (MUST):**

1. **Logging mechanism.** Every action attempt appends structured events to a bounded 4 MiB ring buffer in `storage.local`; oldest events are evicted when the cap is reached. Per-action event content:
   - Timestamp, action id, sanitized scheme/origin, sanitized magnet/hash (infohash and `dn` only; never `tr` or any tracker URL),
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

## 7. Component Outline (hexagonal architecture)

The component layout conforms to the approved technology-stack baseline. Layer boundaries are enforced by ESLint `no-restricted-imports` (configured during the setup phase; see `docs/technology-stack-and-repository-requirements.md` "Layer Boundaries Enforcement"). Path aliases (`@domain/*`, `@application/*`, `@ports/*`, `@adapters/*`, `@entrypoints/*`, `@tests/*`) are declared in `tsconfig.base.json` and mirrored in `wxt.config.ts`.

```text
src/
  domain/
    bencode.ts          # dependency-free bencode parser, bounds/depth guards, exact raw info byte-range
    infohash.ts        # SHA-1 over exact raw info bytes via Web Crypto
    magnet.ts          # magnet validation, construction, and sanitization (keep xt + dn, drop tr/xs/x.pe/unknown)
    display-name.ts    # normalization, trimming, control-char removal, 200-char cap
    error-taxonomy.ts  # closed taxonomy: user_input, configuration, tracker_auth, provider_auth,
                       #   provider_permanent, provider_transient, unknown_outcome, internal
    retry-policy.ts    # deadline (30 s), exponential backoff, max 3, addMagnet NOT retried
  application/
    send-torrent.ts    # use case: send a torrent intent to a provider (depends only on ports + domain)
    test-token.ts      # use case: test provider credentials
    credentials.ts     # use case: save/clear provider credentials
    export-diagnostics.ts # use case: export diagnostics
  ports/
    provider.ts        # abstractions for provider client (addMagnet, selectFiles, validate token)
    context-menu.ts    # context menu registration + click intent
    notifications.ts   # notification + badge surface
    storage.ts         # versioned storage gateway
    downloads.ts       # diagnostics export downloads gateway
    messaging.ts       # content <-> background message envelope contract
  adapters/
    firefox/
      context-menu.ts  # browser.contextMenus registration + click handling
      active-tab.ts    # activeTab + content script fetch orchestration (redirect: "error", credentials: "include")
      messaging.ts     # runtime.sendMessage envelopes
      notifications.ts # browser.notifications + browserAction badge
      downloads.ts     # browser.downloads export
      options-page.ts  # opening the Options page on missing token
    real-debrid/
      client.ts        # HTTP requests to https://api.real-debrid.com/rest/1.0/*
      status-map.ts    # RD HTTP statuses + error codes -> domain error taxonomy
    storage/
      versioned-storage.ts # versioned storage keys, migrations, quota enforcement (4 MiB diagnostics budget)
    diagnostics/
      ring-buffer.ts   # bounded 4 MiB ring buffer writer in storage.local
      redaction.ts     # token/passkey/authorization/sensitive-query redaction
      export.ts        # JSON export assembly
  entrypoints/
    background/        # context menu registration, action orchestration, wiring adapters to use cases
    content/           # minimal: on request from background, fetch a same-origin URL and return bytes
    options/           # token field, save/clear, Test token, diagnostics viewer + Download diagnostics
tests/
  unit/
    bencode.test.ts
    infohash.test.ts
    magnet.test.ts       # including sanitization (tr/xs/x.pe/unknown removal)
    display-name.test.ts
    error-taxonomy.test.ts
    retry-policy.test.ts  # addMagnet NOT retried on unknown outcome
    status-map.test.ts
    versioned-storage.test.ts
    redaction.test.ts
    manifest-contract.test.ts
  property/
    bencode.property.test.ts
    info-range.property.test.ts
    magnet-sanitization.property.test.ts
    display-name.property.test.ts
    retry-classification.property.test.ts
    redaction.property.test.ts
  fixtures/
    # valid v1 single-file/multi-file torrents, malformed bencode, oversized responses,
    # HTML login responses, v2-only/hybrid rejection, magnets with tr/xs/x.pe passkeys
  e2e/
    send-to-rd.e2e.ts  # geckodriver + fake tracker + fake RD; test-only trigger use case
```

### Layer boundary rules (enforced by eslint `no-restricted-imports`)

- `src/domain/**`: no `webextension-polyfill`, `wxt`, any adapter, or `@application/*`. `no-restricted-syntax` rejects `browser.`/`chrome.`/`self.`/`window.` member access.
- `src/application/**`: no `webextension-polyfill`, `wxt`, or any `@adapters/*`. Depends only on `@ports/*` and `@domain/*`.
- `src/ports/**`: no `webextension-polyfill`, `wxt`, or any concrete adapter. Only abstractions.
- `src/adapters/firefox/**`: may import `wxt`, `@ports/*`, `@domain/*`. May NOT import `@adapters/real-debrid/*`.
- `src/adapters/real-debrid/**`: may NOT import `@adapters/firefox/*`. Depends on `@ports/*` and `@domain/*`.
- `src/adapters/storage/**` and `src/adapters/diagnostics/**`: may import `@ports/*`, `@domain/*`, and sibling storage/diagnostics adapters (`@adapters/storage/versioned-storage`, `@adapters/diagnostics/redaction`, `@adapters/diagnostics/ring-buffer`). May NOT import `@adapters/firefox/*` or `@adapters/real-debrid/*`. The diagnostics ring buffer depends on the storage adapter and the redaction helper; the export helper depends on the ring buffer.
- `src/entrypoints/**`: may import anything. This is the last mile that wires adapters to application use cases.

## 8. Verification Steps (implementation-time, not blocking spec)

- Empirical test on the user's real tracker: right-click a `.torrent` link while logged in → confirm binary arrives (validates content-script fetch + cookies).
- Empirical test of cross-origin/CDN links → confirm the error path.
- Empirical test of an HTTP redirect on the `.torrent` fetch → confirm `Redirect not allowed`.
- Geckodriver smoke test: load extension in a test profile, exercise a synthetic right-click against fake services, and assert RD calls, notifications, state, and diagnostics export.
- Parser fixtures: valid v1 single-file/multi-file torrents, malformed bencode, oversized responses, HTML login responses, and v2-only/hybrid rejection.
- Magnet sanitization fixtures: magnets containing `tr` with a passkey, `xs`, `x.pe`, and unknown parameters are sanitized to only `xt` + `dn`; property tests confirm redaction invariants.

## 9. Out of Scope (deliberate)

- btdig / public-magnet search (incl. name-based fallback).
- JDownloader2 integration.
- Queue / batch input.
- Popup UI.
- Polling / instantAvailability checks / honest download-status notifications.
- File selection policy beyond "all files".
- OAuth2.
- Multi-user / sharing / public AMO publication (AMO unlisted signing IS in scope via CI; listed distribution remains deferred).
- Cross-origin/CDN tracker fetching (the `cookies` permission fallback is deferred pending a separate security review).

## 10. Deferred Items

- AMO public/listed distribution, update channels, and marketplace publication remain deferred (AMO unlisted CI signing is implemented; see `docs/decisions/ADR-002-amo-ci-signing.md`).
- `addMagnet` reconciliation by hash (to resolve unknown outcomes without requiring the user to check their RD account) is post-MVP.
- Magnet tracker-parameter sanitization is IN SCOPE for MVP (see FR-2/FR-6); no longer deferred.

## 11. Risks & Known Limitations

- Some private infohashes may have no usable public swarm → torrent can remain in RD without downloading. Accepted by user; MVP reports acceptance, not completion.
- Incoming magnet `tr`/`xs`/`x.pe`/unknown parameters are sanitized in MVP (kept `xt` + `dn` only). Passkey leakage via tracker URLs is therefore prevented for `addMagnet`.
- An unknown `addMagnet` network result is NOT reconciled in MVP; the user receives an explicit `Unknown outcome — check your Real-Debrid account` notification. `addMagnet` is never blindly retried to avoid duplicates.
- Firefox's `activeTab` + content-script fetch mechanism needs empirical verification. If cookie/partition behavior differs, same-origin fetch is considered unsupported in MVP; a `browser.cookies` fallback requires a separate permissions and security review.
- RD rate limit 250 req/min: the design issues ≤3 requests per action, well within limits.
- Real-Debrid accounts freeze after ~15 days of inactivity → token 401; surfaced as a clear error notification.