// src/application/send-torrent.ts
import { failed, type Outcome } from "@domain/error-taxonomy";
import { BencodeError, type ParsedTorrent } from "@domain/bencode";
import { buildMagnet, sanitizeMagnet } from "@domain/magnet";
import { backoffMs, canRetry, type RetryableOp } from "@domain/retry-policy";
import type { ProviderPort } from "@ports/provider";
import type { NotificationsPort } from "@ports/notifications";
import type { MessagingPort } from "@ports/messaging";
import type { LinkClickIntent } from "@ports/context-menu";

let active = false;

async function withRetry(
  op: RetryableOp,
  run: () => Promise<Outcome>,
  deadline: number,
): Promise<Outcome> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() >= deadline) return failed("internal", "action deadline exceeded");
    const out = await run();
    if (out.kind === "accepted" || out.kind === "already_active") return out;
    if (out.kind === "failed" && canRetry(op, out.error)) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt, undefined)));
      continue;
    }
    return out; // permanent or unknown -> terminal
  }
  return failed("provider_transient", "retry budget exhausted");
}

async function notifyFailure(notifications: NotificationsPort, out: Outcome): Promise<Outcome> {
  if (out.kind !== "failed") return out;
  await notifications.notify("Hashway", out.message);
  await notifications.setBadge("ERR");
  return out;
}

export async function sendTorrent(
  deps: {
    provider: ProviderPort;
    notifications: NotificationsPort;
    messaging: MessagingPort;
    parser: (bytes: Uint8Array) => ParsedTorrent;
    computeHash: (infoBytes: Uint8Array) => Promise<string>;
  },
  intent: LinkClickIntent,
  deadline: number,
): Promise<Outcome> {
  if (active) return failed("user_input", "Busy");
  active = true;
  try {
    const { provider, notifications, messaging, parser, computeHash } = deps;
    const url = intent.linkUrl;

    let magnet: string;
    let displayName: string;

    if (url.startsWith("magnet:")) {
      let sanitized: { readonly infohash: string; readonly dn: string };
      try {
        sanitized = sanitizeMagnet(url);
      } catch {
        return await notifyFailure(notifications, failed("user_input", "Invalid magnet link"));
      }
      magnet = buildMagnet(sanitized.infohash, sanitized.dn);
      displayName = sanitized.dn;
    } else if (url.startsWith("https:")) {
      const fetched = await messaging.fetchTrackerBytes(intent.tabId, url, deadline);
      if (!fetched.ok) {
        switch (fetched.reason) {
          case "session_required":
            return await notifyFailure(
              notifications,
              failed("tracker_auth", "Session required on tracker"),
            );
          case "non_torrent":
            return await notifyFailure(
              notifications,
              failed("provider_permanent", "Not a valid .torrent file"),
            );
          case "redirect":
            return await notifyFailure(
              notifications,
              failed("provider_permanent", "Redirect not allowed"),
            );
          case "http_error":
            return await notifyFailure(
              notifications,
              failed("provider_permanent", "Tracker error"),
            );
          case "oversized":
            return await notifyFailure(
              notifications,
              failed("provider_permanent", "Torrent file too large (max 25 MB)"),
            );
          case "network":
            return await notifyFailure(
              notifications,
              failed("provider_transient", "Network error fetching torrent"),
            );
        }
      }
      let parsed: ParsedTorrent;
      try {
        parsed = parser(new Uint8Array(fetched.bytes));
      } catch (e) {
        if (!(e instanceof BencodeError)) throw e;
        switch (e.kind) {
          case "not_torrent":
          case "malformed":
            return await notifyFailure(
              notifications,
              failed("provider_permanent", "Not a valid .torrent file"),
            );
          case "oversized":
            return await notifyFailure(
              notifications,
              failed("provider_permanent", "Torrent file too large"),
            );
          case "v2_rejected":
            return await notifyFailure(
              notifications,
              failed("user_input", "BitTorrent v2 torrents are not supported"),
            );
        }
      }
      const hash = await computeHash(parsed.infoBytes);
      magnet = buildMagnet(hash, parsed.name);
      displayName = parsed.name;
    } else if (url.startsWith("http://")) {
      return await notifyFailure(
        notifications,
        failed("user_input", "HTTPS only — tracker page must be secure"),
      );
    } else {
      return await notifyFailure(notifications, failed("user_input", "Unsupported link"));
    }

    const addOutcome = await provider.addMagnet({ magnet }, deadline);
    if (addOutcome.kind === "accepted") {
      const sfOutcome = await withRetry(
        "selectFiles",
        () => provider.selectFiles({ id: addOutcome.id, files: "all" }, deadline),
        deadline,
      );
      if (sfOutcome.kind === "accepted") {
        await notifications.notify("Hashway", `Added: ${displayName}`);
        await notifications.setBadge("OK");
        return sfOutcome;
      }
      if (sfOutcome.kind === "already_active") {
        await notifications.notify("Hashway", "Already in Real-Debrid");
        await notifications.setBadge("OK");
        return sfOutcome;
      }
      if (sfOutcome.kind === "failed") return await notifyFailure(notifications, sfOutcome);
      await notifications.notify("Hashway", "Unknown outcome — check your Real-Debrid account");
      await notifications.setBadge("ERR");
      return sfOutcome;
    }
    if (addOutcome.kind === "already_active") {
      await notifications.notify("Hashway", "Already in Real-Debrid");
      await notifications.setBadge("OK");
      return addOutcome;
    }
    if (addOutcome.kind === "failed") return await notifyFailure(notifications, addOutcome);
    await notifications.notify("Hashway", "Unknown outcome — check your Real-Debrid account");
    await notifications.setBadge("ERR");
    return addOutcome;
  } finally {
    active = false;
  }
}
