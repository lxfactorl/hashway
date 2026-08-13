// src/adapters/firefox/context-menu.ts
import type { ContextMenuPort } from "@ports/context-menu";

export function createFirefoxContextMenu(): ContextMenuPort {
  let registration = Promise.resolve();

  return {
    register(title) {
      const nextRegistration = registration
        .catch(() => undefined)
        .then(async () => {
          try {
            await Promise.resolve(browser.contextMenus.remove("hashway-send"));
          } catch {
            // The item may not exist on the first registration.
          }
          await Promise.resolve(
            browser.contextMenus.create({ id: "hashway-send", title, contexts: ["link"] }),
          );
        });
      registration = nextRegistration;
      return nextRegistration;
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
