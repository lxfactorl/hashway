// tests/unit/display-name.test.ts
import { describe, it, expect } from "vitest";
import { normalizeDisplayName } from "@domain/display-name";

describe("normalizeDisplayName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeDisplayName("  The Matrix  ")).toBe("The Matrix");
  });
  it("removes control characters", () => {
    expect(normalizeDisplayName("a\u0000b\u0007c")).toBe("abc");
  });
  it("trims trailing whitespace left by removed control characters", () => {
    expect(normalizeDisplayName("x \u0007")).toBe("x");
  });
  it("is idempotent", () => {
    const once = normalizeDisplayName("  x \u0007  ");
    expect(normalizeDisplayName(once)).toBe(once);
  });
  it("collapses internal whitespace runs", () => {
    expect(normalizeDisplayName("The   Matrix\tReloaded")).toBe("The Matrix Reloaded");
  });
  it("uses fallback when input is empty/whitespace", () => {
    expect(normalizeDisplayName("   ", "Tab title")).toBe("Tab title");
  });
  it("uses Untitled torrent when both empty", () => {
    expect(normalizeDisplayName("", "")).toBe("Untitled torrent");
    expect(normalizeDisplayName(undefined)).toBe("Untitled torrent");
  });
  it("caps at 200 characters", () => {
    const long = "x".repeat(250);
    expect(normalizeDisplayName(long).length).toBe(200);
  });
});
