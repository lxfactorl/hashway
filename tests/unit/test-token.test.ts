// tests/unit/test-token.test.ts
import { describe, it, expect } from "vitest";
import { testToken } from "@application/test-token";
import { accepted, failed, unknown, type Outcome } from "@domain/error-taxonomy";
import type { ProviderPort } from "@ports/provider";
import type { NotificationsPort, Badge } from "@ports/notifications";

type NotificationsSpy = NotificationsPort & {
  notifications: { title: string; message: string }[];
  badges: Badge[];
};

function fakeProvider(result: Outcome): ProviderPort {
  return {
    addMagnet: () => Promise.reject(new Error("addMagnet is not exercised in test-token tests")),
    selectFiles: () =>
      Promise.reject(new Error("selectFiles is not exercised in test-token tests")),
    validateToken: () => Promise.resolve(result),
  };
}

function fakeNotifications(): NotificationsSpy {
  const spy = {
    notifications: [] as { title: string; message: string }[],
    badges: [] as Badge[],
  };
  return {
    ...spy,
    notify(title, message) {
      spy.notifications.push({ title, message });
      return Promise.resolve();
    },
    setBadge(badge) {
      spy.badges.push(badge);
      return Promise.resolve();
    },
  };
}

describe("testToken", () => {
  it("200 -> accepted + Token OK notification", async () => {
    const notifications = fakeNotifications();
    const out = await testToken({
      provider: fakeProvider(accepted({ id: "" })),
      notifications,
    });
    expect(out).toEqual(accepted({ id: "" }));
    expect(notifications.notifications).toContainEqual({ title: "Hashway", message: "Token OK" });
    expect(notifications.badges).toContain("OK");
  });

  it("401 -> failed + Invalid Real-Debrid token notification", async () => {
    const notifications = fakeNotifications();
    const out = await testToken({
      provider: fakeProvider(failed("provider_auth", "Invalid Real-Debrid token")),
      notifications,
    });
    expect(out).toEqual(failed("provider_auth", "Invalid Real-Debrid token"));
    expect(notifications.notifications).toContainEqual({
      title: "Hashway",
      message: "Invalid Real-Debrid token",
    });
    expect(notifications.badges).toContain("ERR");
  });

  it("unknown_outcome -> unknown outcome notification + ERR badge", async () => {
    const notifications = fakeNotifications();
    const out = await testToken({
      provider: fakeProvider(unknown("validateToken timed out")),
      notifications,
    });
    expect(out).toEqual(unknown("validateToken timed out"));
    expect(notifications.notifications).toContainEqual({
      title: "Hashway",
      message: "Unknown outcome — check your Real-Debrid account",
    });
    expect(notifications.badges).toContain("ERR");
  });
});
