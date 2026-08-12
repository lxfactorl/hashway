// src/adapters/firefox/badge.ts
import type { Badge } from "@ports/notifications";

export interface BadgeSpec {
  readonly text: string;
  readonly color: string;
}

export function badgeSpec(badge: Badge): BadgeSpec {
  switch (badge) {
    case "OK":
      return { text: "\u2713", color: "#0a0" };
    case "ERR":
      return { text: "\u2717", color: "#a00" };
    case "ON":
      return { text: "ON", color: "#0a0" };
    case "":
      return { text: "", color: "#0a0" };
  }
}
