# Architecture — Send to Real-Debrid

Status: Documents the implemented behavior for the "Send to Real-Debrid" feature.

This document is the authoritative statement of the implemented architecture. The
[design spec](superpowers/specs/2026-08-10-send-to-real-debrid-design.md) defines intent and the
[technology-stack baseline](technology-stack-and-repository-requirements.md) defines the approved
stack and the original layer-boundary rules. Where this document describes actual code, the code is
authoritative.

## Layers (hexagonal / ports-and-adapters)

The codebase is a modular extension monolith with five layers, all under `src/`. Dependencies point
inward: entrypoints → application → ports/domain, with adapters implementing the ports.

| Layer       | Directory          | Responsibility                                                                                                                                                            |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain      | `src/domain/`      | Pure, browser- and provider-independent logic. No imports of adapters, application, `browser`, or WXT.                                                                    |
| Ports       | `src/ports/`       | Type-only abstractions (`ProviderPort`, `NotificationsPort`, `MessagingPort`, `StoragePort`, `DownloadsPort`, `ContextMenuPort`) that decouple application from adapters. |
| Application | `src/application/` | Use cases that depend only on ports and domain. No adapter imports, no browser APIs.                                                                                      |
| Adapters    | `src/adapters/`    | Concrete implementations of ports, grouped by concern: `firefox/`, `real-debrid/`, `storage/`, `diagnostics/`.                                                            |
| Entrypoints | `src/entrypoints/` | WXT entrypoints (`background`, `content`, `options`) that wire adapters to use cases. May import anything.                                                                |

Path aliases (`@domain/*`, `@application/*`, `@ports/*`, `@adapters/*`, `@entrypoints/*`,
`@tests/*`) are declared in `tsconfig.base.json`, `wxt.config.ts`, and `vitest.config.ts`.

## Key files

```text
src/
  domain/
    bencode.ts          # dependency-free bencode parser; bounds/depth guards; exact raw info bytes
    infohash.ts         # SHA-1 over the exact raw info dict via Web Crypto
    magnet.ts           # parseMagnet / sanitizeMagnet / buildMagnet (xt + dn only)
    display-name.ts     # normalizeDisplayName: collapse, strip control chars, cap at 200
    error-taxonomy.ts   # closed Outcome type + ErrorKind taxonomy
    retry-policy.ts     # canRetry (addMagnet never retried), backoffMs, classifyHttp
  ports/
    provider.ts         # addMagnet / selectFiles / validateToken
    notifications.ts    # notify + setBadge
    messaging.ts        # fetchTrackerBytes contract (FetchTrackerRequest/Response)
    storage.ts          # generic get/set/remove/bytesUsed
    downloads.ts        # downloadJson
    context-menu.ts     # register + onClick(LinkClickIntent)
  application/
    send-torrent.ts     # the send-torrent orchestration use case
    test-token.ts       # validate a saved token via GET /user
    credentials.ts      # saveCredentials / clearCredentials
    export-diagnostics.ts # thin use case delegating to an injected export fn
  adapters/
    firefox/
      context-menu.ts   # browser.contextMenus.create + onClick
      active-tab.ts     # classifyLink (LinkKind policy)
      messaging.ts      # browser.tabs.sendMessage fetchTracker
      notifications.ts  # browser.notifications + browserAction badge
      badge.ts          # BadgeSpec: OK=✓/#0a0, ERR=✗/#a00, ON/""=#0a0
      downloads.ts      # browser.downloads.download via data: URL
      storage.ts        # browser.storage.local
      options-page.ts   # browser.runtime.openOptionsPage
    real-debrid/
      client.ts         # HTTP client for api.real-debrid.com/rest/1.0/*
      status-map.ts     # RD statuses + error codes -> Outcome
    storage/
      versioned-storage.ts # hashway.v1.* keys, {version, events} envelope
    diagnostics/
      ring-buffer.ts    # 4 MiB bounded event log in storage.local
      redaction.ts      # sanitizeEvent / redactUrl / redactHeaders
      export.ts         # JSON export assembly via downloads port
  entrypoints/
    background.ts       # wiring: context menu, messaging, diagnostics, test-only triggers
    content.content.ts  # same-origin HTTPS fetchTracker, 25 MB cap
    options/main.ts     # token field, Test token, diagnostics view + Download diagnostics
```

## Send-torrent orchestration flow

`sendTorrent` in `src/application/send-torrent.ts` orchestrates a single action. It is a module
singleton: only one action runs at a time, and concurrent invocations fail fast with
`Busy` (`user_input`). A hard 30 s deadline (30,000 ms) bounds the whole action.

```text
classify(url, pageUrl)
  magnet_v1   -> sanitizeMagnet(url) -> buildMagnet(infohash, dn)
  https_torrent -> fetchTrackerBytes(tabId, url, deadline) -> parseTorrent(bytes)
                   -> computeV1InfoHash(infoBytes) -> buildMagnet(hash, name)
  http        -> "HTTPS only — tracker page must be secure" (user_input)
  unsupported -> "Cross-origin link not supported" (user_input)
        |
        v
provider.addMagnet({ magnet })          // NEVER retried
  accepted         -> provider.selectFiles({ id, files: "all" })  // retried (<=3) on transient
  already_active   -> "Already in Real-Debrid" + badge OK
  failed           -> notification with message + badge ERR
  unknown_outcome  -> "Unknown outcome — check your Real-Debrid account" + badge ERR
```

Link classification lives in `src/adapters/firefox/active-tab.ts` and is injected into the use
case (the application layer must not import adapters):

- `magnet_v1`: `magnet:?xt=urn:btih:<40-hex>`.
- `https_torrent`: HTTPS and same origin as the page.
- `http`: HTTP (non-HTTPS) link → rejected.
- `unsupported`: everything else — cross-origin HTTPS, non-`magnet:` schemes, invalid URLs.
  The 4-kind `LinkKind` cannot distinguish cross-origin HTTPS from garbage schemes, so both surface
  the single message "Cross-origin link not supported".

On success the user sees `Added: <display name>` and a ✓ badge; on failure a short notification and
a ✗ badge. Every outcome is recorded in the diagnostics ring buffer.

## Retry policy

- `addMagnet` is **never** retried, even on transient or ambiguous network failure — it creates a
  remote resource and the remote operation may already have succeeded.
- `selectFiles` is retried on `provider_transient` up to 3 attempts with exponential backoff
  (`backoffMs`, capped at 8 s, honoring an optional `Retry-After` up to 30 s) because RD error code
  31 makes it idempotent.
- `validateToken` is retried on transient (used by the options-page Test token action).

## Layer boundaries (enforced by ESLint)

`eslint.config.js` enforces the boundaries via `no-restricted-imports` per `files` override and
`no-restricted-syntax` for browser globals. Warnings fail (`--max-warnings=0`).

- `src/domain/**` — no `webextension-polyfill`, `wxt`, any `@adapters/*`, or `@application/*`;
  `no-restricted-syntax` rejects `MemberExpression` access to `browser.`, `chrome.`, `self.`,
  `window.`.
- `src/application/**` — no `webextension-polyfill`, `wxt`, or any `@adapters/*`.
- `src/ports/**` — no `webextension-polyfill`, `wxt`, or any `@adapters/*`.
- `src/adapters/firefox/**` — may not import `@adapters/real-debrid/*`, `@adapters/storage/*`,
  `@adapters/diagnostics/*`.
- `src/adapters/real-debrid/**` — may not import `@adapters/firefox/*`, `@adapters/storage/*`,
  `@adapters/diagnostics/*`.
- `src/adapters/storage/**` and `src/adapters/diagnostics/**` — may not import `@adapters/firefox/*`
  or `@adapters/real-debrid/*`.
- `src/entrypoints/**` — unrestricted (last mile wiring).

See the tech-stack baseline "Layer Boundaries Enforcement" for the original statement.

## Diagnostics and storage

- Storage keys are versioned (`hashway.v1.token`, `hashway.v1.diagnostics`).
- Diagnostics are a bounded 4 MiB ring buffer in `storage.local`; the stored envelope is
  `{ version: 1, events }` (see `docs/diagnostics.md`).
- The background and options entrypoints both create a `createVersionedStorage` over the Firefox
  storage adapter and a `createRingBuffer(storage, 4 * 1024 * 1024)`.

## Test-only seams

The background entrypoint handles two message types that the real UI never sends: `hashway:test:setup`
(sets a token and/or a test Real-Debrid base URL) and `hashway:test:send` (injects a full intent,
optionally routing Real-Debrid calls to a fake `baseUrl`). These exist so the geckodriver E2E can
drive the application use case without automating Firefox context-menu chrome UI; they are
unreachable from production flows. See `docs/security.md` and `docs/testing.md`.

## Evolution boundaries

New providers implement `ProviderPort` as a new adapter under `src/adapters/` and are registered at
the entrypoint wiring layer; the domain and application layers do not change. New persistence keys
follow the `hashway.v1.*` versioning scheme. The permission allowlist is fixed by the manifest
contract test — see `docs/security.md`.
