// src/adapters/firefox/active-tab.ts
export type LinkClassification =
  | { readonly kind: "magnet_v1" }
  | { readonly kind: "https_torrent" }
  | { readonly kind: "http" }
  | { readonly kind: "unsupported" };

const MAGNET_V1_PATTERN = /^magnet:\?xt=urn:btih:[0-9a-fA-F]{40}/;

export function classifyLink(linkUrl: string, pageUrl: string): LinkClassification {
  if (MAGNET_V1_PATTERN.test(linkUrl)) return { kind: "magnet_v1" };
  if (linkUrl.startsWith("magnet:")) return { kind: "unsupported" };
  try {
    const url = new URL(linkUrl);
    if (url.protocol === "https:") {
      return url.origin === new URL(pageUrl).origin
        ? { kind: "https_torrent" }
        : { kind: "unsupported" };
    }
    if (url.protocol === "http:") return { kind: "http" };
  } catch {
    // invalid URL
  }
  return { kind: "unsupported" };
}
