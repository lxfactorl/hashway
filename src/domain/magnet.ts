// src/domain/magnet.ts
import { normalizeDisplayName } from "@domain/display-name";

const V1_HEX_RE = /^[0-9a-fA-F]{40}$/;

export function parseMagnet(input: string): {
  readonly infohash: string;
  readonly dn: string | undefined;
} {
  const u = new URL(input); // throws on invalid URL/unsupported scheme for most cases
  if (u.protocol !== "magnet:") throw new Error("Unsupported scheme (magnet v1 only)");
  const params = new URLSearchParams(u.search);
  const xt = params.get("xt") ?? "";
  if (!xt.startsWith("urn:btih:")) throw new Error("Only v1 btih magnets are supported");
  const hex = xt.slice("urn:btih:".length).toLowerCase();
  if (!V1_HEX_RE.test(hex)) throw new Error("Invalid v1 infohash (40 lowercase hex expected)");
  const dnRaw = params.get("dn") ?? undefined;
  return { infohash: hex, dn: dnRaw !== undefined ? normalizeDisplayName(dnRaw) : undefined };
}

export function sanitizeMagnet(input: string): { readonly infohash: string; readonly dn: string } {
  const { infohash, dn } = parseMagnet(input);
  return { infohash, dn: dn ?? "Untitled torrent" };
}

export function buildMagnet(infohash: string, displayName: string): string {
  if (!V1_HEX_RE.test(infohash)) throw new Error("Invalid v1 infohash");
  const dn = normalizeDisplayName(displayName);
  return `magnet:?xt=urn:btih:${infohash}&dn=${encodeURIComponent(dn)}`;
}
