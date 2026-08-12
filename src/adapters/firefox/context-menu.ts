// src/adapters/firefox/context-menu.ts
import type { ContextMenuPort } from "@ports/context-menu";

export function createFirefoxContextMenu(): ContextMenuPort {
  return {
    register(title) {
      browser.contextMenus.create({ id: "hashway-send", title, contexts: ["link"] });
      return Promise.resolve();
    },
    onClick(listener) {
      browser.contextMenus.onClicked.addListener((info, tab) => {
        const linkUrl = info.linkUrl;
        if (!linkUrl) return;
        listener({
          linkUrl,
          pageUrl: tab?.url ?? info.pageUrl ?? "",
          tabTitle: tab?.title ?? "",
          tabId: tab?.id ?? 0,
        });
      });
    },
  };
}
