// src/entrypoints/background.ts
import { classifyLink } from "@adapters/firefox/active-tab";
import { createFirefoxContextMenu } from "@adapters/firefox/context-menu";
import { createFirefoxMessaging } from "@adapters/firefox/messaging";
import { createFirefoxNotifications } from "@adapters/firefox/notifications";
import { openOptionsPage } from "@adapters/firefox/options-page";
import { createFirefoxStorage } from "@adapters/firefox/storage";
import { createVersionedStorage } from "@adapters/storage/versioned-storage";
import { createRealDebridClient } from "@adapters/real-debrid/client";
import { createRingBuffer } from "@adapters/diagnostics/ring-buffer";
import { redactUrl } from "@adapters/diagnostics/redaction";
import { sendTorrent } from "@application/send-torrent";
import { parseTorrent } from "@domain/bencode";
import { computeV1InfoHash } from "@domain/infohash";
import type { LinkClickIntent } from "@ports/context-menu";

const RD_BASE_URL_KEY = "hashway.v1.rdBaseUrl";
const TEST_SETUP = "hashway:test:setup";
const TEST_SEND = "hashway:test:send";

export default defineBackground(() => {
  const notifications = createFirefoxNotifications();
  const contextMenu = createFirefoxContextMenu();
  const rawStorage = createFirefoxStorage();
  const storage = createVersionedStorage(rawStorage);
  const provider = createRealDebridClient({
    fetchFn: globalThis.fetch.bind(globalThis),
    getToken: () => storage.getToken(),
  });
  const messaging = createFirefoxMessaging();
  const ringBuffer = createRingBuffer(storage, 4 * 1024 * 1024);

  browser.runtime.onInstalled.addListener(() => {
    browser.browserAction.setBadgeText({ text: "ON" });
    browser.browserAction.setBadgeBackgroundColor({ color: "#0a0" });
    void contextMenu.register("Send to Real-Debrid");
  });

  contextMenu.onClick((intent) => {
    void sendToRealDebrid(intent);
  });

  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    const candidate = msg as { type?: string } | null;
    if (candidate?.type === TEST_SETUP) {
      const m = msg as { type: "hashway:test:setup"; token?: unknown; rdBaseUrl?: unknown };
      void (async () => {
        try {
          if (typeof m.token === "string" && m.token !== "") {
            await storage.setToken(m.token);
          }
          if (typeof m.rdBaseUrl === "string" && m.rdBaseUrl !== "") {
            await rawStorage.set(RD_BASE_URL_KEY, m.rdBaseUrl);
          }
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      })();
      return true;
    }
    if (candidate?.type !== TEST_SEND) return false;
    const m = msg as { type: "hashway:test:send"; intent?: unknown };
    void (async () => {
      try {
        const intent = m.intent;
        if (!isLinkClickIntent(intent)) {
          sendResponse({ ok: false, error: "invalid intent shape" });
          return;
        }
        const rdBaseUrl = await rawStorage.get<string>(RD_BASE_URL_KEY);
        const activeProvider =
          rdBaseUrl === undefined
            ? provider
            : createRealDebridClient({
                fetchFn: globalThis.fetch.bind(globalThis),
                getToken: () => storage.getToken(),
                baseUrl: rdBaseUrl,
              });
        const out = await sendTorrent(
          {
            provider: activeProvider,
            notifications,
            messaging,
            parser: parseTorrent,
            computeHash: computeV1InfoHash,
            classify: classifyLink,
          },
          intent,
          Date.now() + 30000,
        );
        await ringBuffer.append({ intent: redactIntent(intent), outcome: out });
        sendResponse({ ok: true, outcome: out });
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true;
  });

  async function sendToRealDebrid(intent: LinkClickIntent): Promise<void> {
    try {
      const deadline = Date.now() + 30000;
      const token = await storage.getToken();
      if (!token) {
        await notifications.notify("Hashway", "Real-Debrid token is not configured");
        await openOptionsPage();
        return;
      }
      const out = await sendTorrent(
        {
          provider,
          notifications,
          messaging,
          parser: parseTorrent,
          computeHash: computeV1InfoHash,
          classify: classifyLink,
        },
        intent,
        deadline,
      );
      await ringBuffer.append({ intent: redactIntent(intent), outcome: out });
    } catch (e) {
      await notifications.notify("Hashway", "Unexpected error — check diagnostics");
      await ringBuffer.append({
        intent: { linkUrl: redactUrl(intent.linkUrl) },
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
});

function isLinkClickIntent(value: unknown): value is LinkClickIntent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["linkUrl"] === "string" &&
    typeof v["pageUrl"] === "string" &&
    typeof v["tabTitle"] === "string" &&
    typeof v["tabId"] === "number"
  );
}

function redactIntent(intent: LinkClickIntent): {
  readonly linkUrl: string;
  readonly pageUrl: string;
  readonly tabTitle: string;
} {
  return {
    linkUrl: redactUrl(intent.linkUrl),
    pageUrl: redactUrl(intent.pageUrl),
    tabTitle: intent.tabTitle,
  };
}
