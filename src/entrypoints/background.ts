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
import { registerExtensionLifecycle } from "@application/extension-lifecycle";
import { parseTorrent } from "@domain/bencode";
import { computeV1InfoHash } from "@domain/infohash";
import type { LinkClickIntent } from "@ports/context-menu";

export default defineBackground(() => {
  const notifications = createFirefoxNotifications();
  const contextMenu = createFirefoxContextMenu();
  const storage = createVersionedStorage(createFirefoxStorage());
  const provider = createRealDebridClient({
    fetchFn: globalThis.fetch.bind(globalThis),
    getToken: () => storage.getToken(),
  });
  const messaging = createFirefoxMessaging();
  const ringBuffer = createRingBuffer(storage, 4 * 1024 * 1024);

  const initializeExtension = () => {
    browser.browserAction.setBadgeText({ text: "ON" });
    browser.browserAction.setBadgeBackgroundColor({ color: "#0a0" });
    void contextMenu.register("Send to Real-Debrid");
  };

  registerExtensionLifecycle(browser.runtime, initializeExtension);

  contextMenu.onClick((intent) => {
    void sendToRealDebrid(intent);
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
