// src/adapters/diagnostics/redaction.ts
import { sanitizeMagnet } from "@domain/magnet";

const DROP_KEYS = new Set(["token", "authorization", "passkey", "secret", "apikey"]);
const MAGNET_RE = /^magnet:\?/;

export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "<invalid url>";
  }
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (DROP_KEYS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function sanitizeEvent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeEvent);
  if (typeof value === "string") {
    if (MAGNET_RE.test(value)) {
      const { infohash, dn } = sanitizeMagnet(value);
      return `magnet:?xt=urn:btih:${infohash}&dn=${encodeURIComponent(dn)}`;
    }
    return value;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROP_KEYS.has(k.toLowerCase())) continue;
      out[k] = sanitizeEvent(v);
    }
    return out;
  }
  return value;
}
