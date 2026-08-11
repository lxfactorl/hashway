// src/domain/display-name.ts
const FALLBACK = "Untitled torrent";
const MAX = 200;

export function normalizeDisplayName(input: string | undefined, fallback: string = ""): string {
  const collapsed = (input ?? "").replace(/\s+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  const raw = collapsed.replace(/[\x00-\x1F\x7F]/g, "");
  const chosen = raw || fallback.trim() || FALLBACK;
  const codePoints = Array.from(chosen);
  return codePoints.length <= MAX ? chosen : codePoints.slice(0, MAX).join("");
}
