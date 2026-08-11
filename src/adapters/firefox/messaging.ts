// src/adapters/firefox/messaging.ts
import type { FetchTrackerRequest, FetchTrackerResponse, MessagingPort } from "@ports/messaging";

type FetchFailure = Extract<FetchTrackerResponse, { readonly ok: false }>;

const TRACKER_FAILURE_REASONS: readonly string[] = [
  "http_error",
  "redirect",
  "oversized",
  "non_torrent",
  "session_required",
  "network",
];

function isFetchTrackerReason(value: unknown): value is FetchFailure["reason"] {
  return typeof value === "string" && TRACKER_FAILURE_REASONS.includes(value);
}

function isFetchTrackerResponse(value: unknown): value is FetchTrackerResponse {
  if (typeof value !== "object" || value === null) return false;
  if (!("ok" in value)) return false;
  const ok: unknown = value.ok;
  if (ok === true) {
    return "bytes" in value && value.bytes instanceof ArrayBuffer;
  }
  if (ok !== false) return false;
  return "reason" in value && isFetchTrackerReason(value.reason);
}

export function createFirefoxMessaging(): MessagingPort {
  return {
    async fetchTrackerBytes(tabId, url, deadline) {
      try {
        const response = await browser.tabs.sendMessage<
          FetchTrackerRequest & { readonly type: "fetchTracker" },
          unknown
        >(tabId, { type: "fetchTracker", url, deadline });
        if (isFetchTrackerResponse(response)) return response;
        return { ok: false, reason: "network" };
      } catch {
        return { ok: false, reason: "network" };
      }
    },
  };
}
