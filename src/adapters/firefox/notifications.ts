// src/adapters/firefox/notifications.ts
import { badgeSpec } from "@adapters/firefox/badge";
import type { NotificationsPort } from "@ports/notifications";
import type { Browser } from "wxt/browser";

export function createFirefoxNotifications(): NotificationsPort {
  return {
    async notify(title, message) {
      await browser.notifications.create({
        type: "basic",
        title,
        message,
      } as Browser.notifications.NotificationCreateOptions);
    },
    setBadge(badge) {
      const spec = badgeSpec(badge);
      browser.browserAction.setBadgeText({ text: spec.text });
      browser.browserAction.setBadgeBackgroundColor({ color: spec.color });
      return Promise.resolve();
    },
  };
}
