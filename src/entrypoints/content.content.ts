// src/entrypoints/content.content.ts
import type { FetchTrackerResponse } from "@ports/messaging";

const MAX_TRACKER_BYTES = 25 * 1024 * 1024;

export default defineContentScript({
  matches: ["https://*/*"],
  main() {
    browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
      const req = msg as { type?: string; url?: unknown; deadline?: unknown };
      if (
        req.type !== "fetchTracker" ||
        typeof req.url !== "string" ||
        typeof req.deadline !== "number"
      ) {
        return false;
      }
      void handleFetch(req.url, req.deadline)
        .then(sendResponse)
        .catch(() => {
          sendResponse({ ok: false, reason: "network" } satisfies FetchTrackerResponse);
        });
      return true;
    });
  },
});

async function handleFetch(url: string, deadline: number): Promise<FetchTrackerResponse> {
  const controller = new AbortController();
  const remaining = Math.max(0, deadline - Date.now());
  const timer = setTimeout(() => {
    controller.abort();
  }, remaining || 1);
  try {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.origin !== location.origin) {
      return { ok: false, reason: "network" };
    }
    const res = await fetch(url, {
      credentials: "include",
      redirect: "manual",
      signal: controller.signal,
    });
    if (res.type === "opaqueredirect") return { ok: false, reason: "redirect" };
    if (!res.ok) return { ok: false, reason: "http_error", status: res.status };
    if (!res.body) return { ok: false, reason: "network" };
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_TRACKER_BYTES) {
        await reader.cancel();
        return { ok: false, reason: "oversized" };
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    if (startsWithHtmlMarker(out)) return { ok: false, reason: "session_required" };
    return { ok: true, bytes: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) };
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

function startsWithHtmlMarker(bytes: Uint8Array): boolean {
  let i = 0;
  while (
    i < bytes.length &&
    (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)
  ) {
    i += 1;
  }
  return i < bytes.length && bytes[i] === 0x3c;
}
