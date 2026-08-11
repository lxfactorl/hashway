// tests/unit/badge.test.ts
import { describe, it, expect } from "vitest";
import { badgeSpec } from "@adapters/firefox/badge";

describe("badgeSpec", () => {
  it("OK -> check green", () => {
    expect(badgeSpec("OK")).toEqual({ text: "\u2713", color: "#0a0" });
  });
  it("ERR -> x red", () => {
    expect(badgeSpec("ERR")).toEqual({ text: "\u2717", color: "#a00" });
  });
  it("ON -> ON green", () => {
    expect(badgeSpec("ON")).toEqual({ text: "ON", color: "#0a0" });
  });
  it('"" -> empty', () => {
    expect(badgeSpec("")).toEqual({ text: "", color: "#0a0" });
  });
});
