// tests/property/display-name.property.test.ts
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { normalizeDisplayName } from "@domain/display-name";

describe("normalizeDisplayName property", () => {
  it("never returns empty", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 50 }), (s) => {
        expect(normalizeDisplayName(s).length).toBeGreaterThan(0);
      }),
    );
  });
  it("caps at 200 chars for any input", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (s) => {
        expect(normalizeDisplayName(s).length).toBeLessThanOrEqual(200);
      }),
    );
  });
  it("idempotent", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (s) => {
        expect(normalizeDisplayName(normalizeDisplayName(s))).toBe(normalizeDisplayName(s));
      }),
    );
  });
});
