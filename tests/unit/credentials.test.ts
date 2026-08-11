// tests/unit/credentials.test.ts
import { describe, it, expect } from "vitest";
import { saveCredentials, clearCredentials } from "@application/credentials";
import { accepted, failed } from "@domain/error-taxonomy";
import type { NotificationsPort, Badge } from "@ports/notifications";

type NotificationsSpy = NotificationsPort & {
  notifications: { title: string; message: string }[];
  badges: Badge[];
};

function fakeStorage() {
  let token: string | undefined;
  return {
    setToken(value: string) {
      token = value;
      return Promise.resolve();
    },
    clearToken() {
      token = undefined;
      return Promise.resolve();
    },
    getToken(): Promise<string | undefined> {
      return Promise.resolve(token);
    },
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

describe("saveCredentials", () => {
  it("saves a trimmed token and notifies", async () => {
    const storage = fakeStorage();
    const notifications = fakeNotifications();
    const save = saveCredentials({ storage, notifications });
    const out = await save("  tok-123  ");
    expect(out).toEqual(accepted({ id: "" }));
    expect(await storage.getToken()).toBe("tok-123");
    expect(notifications.notifications).toContainEqual({
      title: "Hashway",
      message: "Token saved",
    });
  });

  it("empty token -> user_input failure, nothing stored, no save notification", async () => {
    const storage = fakeStorage();
    const notifications = fakeNotifications();
    const save = saveCredentials({ storage, notifications });
    const out = await save("   ");
    expect(out).toEqual(failed("user_input", "Token cannot be empty"));
    expect(await storage.getToken()).toBeUndefined();
    expect(notifications.notifications).toContainEqual({
      title: "Hashway",
      message: "Token cannot be empty",
    });
    expect(notifications.notifications).not.toContainEqual({
      title: "Hashway",
      message: "Token saved",
    });
  });
});

describe("clearCredentials", () => {
  it("clears the token and notifies", async () => {
    const storage = fakeStorage();
    const notifications = fakeNotifications();
    await storage.setToken("tok-123");
    const clear = clearCredentials({ storage, notifications });
    const out = await clear();
    expect(out).toEqual(accepted({ id: "" }));
    expect(await storage.getToken()).toBeUndefined();
    expect(notifications.notifications).toContainEqual({
      title: "Hashway",
      message: "Token cleared",
    });
  });
});
