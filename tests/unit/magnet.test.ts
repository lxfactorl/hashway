// tests/unit/magnet.test.ts
import { describe, it, expect } from "vitest";
import { parseMagnet, sanitizeMagnet, buildMagnet } from "@domain/magnet";

describe("parseMagnet", () => {
  it("extracts v1 btih and dn", () => {
    const m = parseMagnet("magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Hello");
    expect(m.infohash).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(m.dn).toBe("Hello");
  });
  it("rejects non-magnet scheme", () => {
    expect(() => parseMagnet("https://example.com/x")).toThrow();
  });
  it("rejects v2 btmh", () => {
    expect(() => parseMagnet("magnet:?xt=urn:btmh:...")).toThrow(/v1|btih/);
  });
  it("rejects bad hex length", () => {
    expect(() => parseMagnet("magnet:?xt=urn:btih:abc")).toThrow();
  });
});

describe("sanitizeMagnet", () => {
  it("keeps only xt and dn, drops tr/xs/x.pe/unknown", () => {
    const s = sanitizeMagnet(
      "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Hello&tr=https://tracker.example.com/announce?key=SECRET&xs=ignored&x.pe=ignored&foo=bar",
    );
    expect(s.infohash).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(s.dn).toBe("Hello");
    // No tr/xs/x.pe/foo survive — they are simply not returned.
  });
  it("falls back to Untitled torrent when dn missing", () => {
    const s = sanitizeMagnet("magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567");
    expect(s.dn).toBe("Untitled torrent");
  });
});

describe("buildMagnet", () => {
  it("emits exactly xt and dn", () => {
    const m = buildMagnet("0123456789abcdef0123456789abcdef01234567", "Hello World");
    expect(m).toBe("magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Hello%20World");
    expect(
      m
        .slice("magnet:?".length)
        .split("&")
        .filter((p) => p.startsWith("xt=") || p.startsWith("dn=")),
    ).toHaveLength(2);
    expect(m).not.toMatch(/tr=|xs=|x\.pe=/);
  });
});
