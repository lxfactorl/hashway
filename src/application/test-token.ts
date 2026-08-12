// src/application/test-token.ts
import type { Outcome } from "@domain/error-taxonomy";
import type { ProviderPort } from "@ports/provider";
import type { NotificationsPort } from "@ports/notifications";

export async function testToken(deps: {
  provider: ProviderPort;
  notifications: NotificationsPort;
}): Promise<Outcome> {
  const out = await deps.provider.validateToken(Date.now() + 30000);
  if (out.kind === "accepted") {
    await deps.notifications.notify("Hashway", "Token OK");
    await deps.notifications.setBadge("OK");
  } else if (out.kind === "failed") {
    await deps.notifications.notify("Hashway", out.message);
    await deps.notifications.setBadge("ERR");
  } else {
    await deps.notifications.notify("Hashway", "Unknown outcome — check your Real-Debrid account");
    await deps.notifications.setBadge("ERR");
  }
  return out;
}
