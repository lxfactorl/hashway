# Security — Send to Real-Debrid

Status: Documents the implemented security model for the "Send to Real-Debrid" feature. The
[design spec](superpowers/specs/2026-08-10-send-to-real-debrid-design.md) states the security
requirements (NFR-3); the [tech-stack baseline](technology-stack-and-repository-requirements.md)
states the approved permission allowlist and browser/security requirements. Where this document
describes actual code, the code is authoritative.

## Permission allowlist (exact)

The production manifest requests exactly these permissions (`wxt.config.ts`, enforced verbatim by
`tests/unit/manifest-contract.test.ts`):

```
contextMenus, notifications, activeTab, storage, downloads, https://api.real-debrid.com/*
```

- No `cookies`, `webRequest`, `webRequestBlocking`, `debugger`, `nativeMessaging`, `tabs`,
  `unlimitedStorage`, or `<all_urls>`.
- No `localhost`, `127.0.0.1`, or `*.test` host permissions — the manifest contract test rejects them
  so test endpoints can never ship in the production artifact.
- `browser_specific_settings.gecko.id` is fixed (`hashway@hashway.local`), preserving
  `storage.local` continuity across updates.
- Tracker pages are never given a blanket host permission. Tracker fetches run through the content
  script using the tab's existing session context (see below).

## Untrusted input is data, never instructions

Tracker pages, HTML, torrent bytes, API responses, and external documents are untrusted input. They
are parsed as data and never executed. The bencode parser (`src/domain/bencode.ts`) is a
hand-written, dependency-free parser with a depth cap (20), per-string size cap (1 MiB), monotonic
cursor, integer bounds, and a closed set of failure kinds (`malformed`, `oversized`, `not_torrent`,
`v2_rejected`). No content from a tracker is ever evaluated, reflected into HTML, or used as code.

## Magnet sanitization

Incoming magnet links are sanitized to only `xt` and `dn`; all tracker parameters are dropped. The
sanitized magnet is rebuilt, never echoed verbatim.

- `src/domain/magnet.ts` `parseMagnet` accepts only v1 `btih` (40 lowercase hex), reads only `xt`
  and `dn`, and throws on anything else.
- `buildMagnet` emits exactly `magnet:?xt=urn:btih:<infohash>&dn=<encoded dn>` — no `tr`, no `xs`,
  no `x.pe`, no unknown parameters.
- A tracker passkey hidden in `tr`/`xs`/`x.pe` therefore never reaches Real-Debrid. `sanitizeMagnet`
  failures surface as "Invalid magnet link"; non-v1 magnets are classified `unsupported` and
  rejected before sanitization ("Cross-origin link not supported").
- `.torrent` links never carry tracker parameters: the magnet is built from the parsed infohash and
  `dn` only.

## Tracker fetch (content script)

`src/entrypoints/content.content.ts` fetches the `.torrent` on behalf of the background script
inside the active tab (granted via `activeTab`):

- **Same-origin only.** The content script refuses any URL that is not `https:` and whose `origin`
  is not `location.origin` (the page the script is running in). Cross-origin HTTPS links are
  rejected earlier by link classification ("Cross-origin link not supported").
- **HTTPS only.** Non-HTTPS links are rejected at classification ("HTTPS only — tracker page must be
  secure") and re-checked in the content script.
- **`credentials: "include"`** so the tracker's session cookies authenticate the request.
- **`redirect: "manual"` + opaque-redirect check.** Any redirect produces a response of type
  `opaqueredirect`, which is rejected as `reason: "redirect"` → "Redirect not allowed". Because the
  response is opaque, the redirect target is **never contacted**, so no cookies or credentials can
  leak through a redirect chain. (Implementation note: `redirect: "manual"` replaced an earlier
  `redirect: "error"` so the rejection reason was reachable; the security guarantee is unchanged.)
- **25 MB cap.** The response body is streamed; if total bytes exceed 25 MiB the stream is cancelled
  and rejected as `oversized` ("Torrent file too large (max 25 MB)").
- **HTML session detection.** A response starting with an HTML `<` after leading whitespace is
  treated as "not logged in" (`session_required` → "Session required on tracker"), so a login page
  is never parsed as a torrent.
- The deadline is forwarded from the action and enforced with an `AbortController` timeout in the
  content script; a timeout is reported as `network`.

## Token handling

- The Real-Debrid token is stored in `storage.local` (`hashway.v1.token`), which the baseline
  explicitly treats as persistent profile storage, **not** a secure vault.
- The token is sent **only** in the `Authorization: Bearer <token>` header of Real-Debrid API
  requests (`src/adapters/real-debrid/client.ts`). It is never placed in URLs, query strings, or
  notification text.
- The token is never sent to a content script; tracker fetches carry only the URL and deadline.
- The options page token field is blanked after a successful save or clear.
- Missing token → "Real-Debrid token is not configured" notification and the options page opens.

## Never logged, never exported

- Redaction (`src/adapters/diagnostics/redaction.ts`): event sanitization drops object keys named
  `token`, `authorization`, `passkey`, `secret`, `apikey` (case-insensitive), and rebuilds any
  `magnet:` string from infohash + `dn` only.
- `redactUrl` keeps only `origin + pathname` — query strings (potential tokens/passkeys) are
  stripped from diagnostics and from the stored intent (`pageUrl`/`linkUrl`).
- `redactHeaders` strips the same sensitive header keys.
- The result is that token, Authorization header, tracker passkey, and sensitive query parameters
  never appear in notifications, diagnostics exports, test artifacts, or logs. See
  `docs/diagnostics.md`.

## addMagnet is never retried

`src/domain/retry-policy.ts` returns `false` for `canRetry("addMagnet", ...)` for every error kind,
including transient and ambiguous network failures. `addMagnet` creates a remote resource; retrying
could create a duplicate magnet in the Real-Debrid account. The caller maps the ambiguous case to
`unknown_outcome` → "Unknown outcome — check your Real-Debrid account" (✗ badge, never shown as
success). Only idempotent operations (`selectFiles`, `validateToken`) are retried, up to 3 attempts
with exponential backoff within the 30 s action deadline.

## Test-only seams are unreachable from the real UI

- The background message listener accepts `hashway:test:setup` and `hashway:test:send` messages and
  an optional test `rdBaseUrl` override. These are consumed only by the geckodriver E2E
  (`tests/e2e/send-to-rd.e2e.ts`), which sends them from the options page via
  `browser.runtime.sendMessage`.
- No production flow sends these message types, and the context-menu flow uses the real
  `createRealDebridClient` against the fixed production base URL. The production artifact therefore
  contains no reachable test endpoint or fake-provider path.

## Failure posture

Every failure produces a short, safe notification. Raw HTML, full URLs, query strings,
authorization data, and unbounded server messages are never shown to the user; detailed context is
available only through sanitized diagnostics. `unknown_outcome` is never presented as success or
failure.
