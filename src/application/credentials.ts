// src/application/credentials.ts
import { accepted, failed, type Outcome } from "@domain/error-taxonomy";
import type { NotificationsPort } from "@ports/notifications";

export interface CredentialsStorage {
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

export function saveCredentials(deps: {
  storage: CredentialsStorage;
  notifications: NotificationsPort;
}): (token: string) => Promise<Outcome> {
  return async (token) => {
    const trimmed = token.trim();
    if (trimmed === "") {
      const out = failed("user_input", "Token cannot be empty");
      if (out.kind === "failed") {
        await deps.notifications.notify("Hashway", out.message);
      }
      return out;
    }
    await deps.storage.setToken(trimmed);
    const out = accepted({ id: "" });
    await deps.notifications.notify("Hashway", "Token saved");
    return out;
  };
}

export function clearCredentials(deps: {
  storage: CredentialsStorage;
  notifications: NotificationsPort;
}): () => Promise<Outcome> {
  return async () => {
    await deps.storage.clearToken();
    const out = accepted({ id: "" });
    await deps.notifications.notify("Hashway", "Token cleared");
    return out;
  };
}
