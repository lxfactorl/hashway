// src/ports/notifications.ts
export type Badge = "ON" | "OK" | "ERR" | "";
export interface NotificationsPort {
  notify(title: string, message: string): Promise<void>;
  setBadge(badge: Badge): Promise<void>;
}
