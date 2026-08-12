// tests/property/magnet-sanitization.property.test.ts
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sanitizeMagnet, buildMagnet } from "@domain/magnet";

const hex40 = fc.stringMatching(/^[0-9a-fA-F]{40}$/);
// eslint-disable-next-line no-control-regex
const safeStr = fc.string({ maxLength: 50 }).map((s) => s.replace(/[\x00-\x1F\x7F]/g, " "));

describe("magnet sanitization property", () => {
  it("buildMagnet never contains tr=/xs=/x.pe= for sanitized inputs", () => {
    fc.assert(
      fc.property(hex40, safeStr, (ih, dn) => {
        const m = buildMagnet(ih, dn);
        expect(m).not.toMatch(/tr=|xs=|x\.pe=/);
      }),
    );
  });
  it("sanitizeMagnet preserves the infohash exactly", () => {
    fc.assert(
      fc.property(hex40, safeStr, (ih, dn) => {
        const input = `magnet:?xt=urn:btih:${ih}&dn=${encodeURIComponent(dn)}&tr=https://t.example.com/key=SECRET`;
        expect(sanitizeMagnet(input).infohash).toBe(ih.toLowerCase());
      }),
    );
  });
});
