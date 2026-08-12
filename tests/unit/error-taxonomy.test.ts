// tests/unit/error-taxonomy.test.ts
import { describe, it, expect } from "vitest";
import {
  failed,
  accepted,
  alreadyActive,
  unknown,
  isFinal,
  type Outcome,
} from "@domain/error-taxonomy";

describe("error taxonomy", () => {
  it("accepted is final", () => {
    expect(isFinal(accepted({ id: "x" }))).toBe(true);
  });
  it("already_active is final", () => {
    expect(isFinal(alreadyActive("already"))).toBe(true);
  });
  it("failed is final", () => {
    const o: Outcome = failed("provider_transient", "503");
    expect(isFinal(o)).toBe(true);
    expect(o.kind).toBe("failed");
    if (o.kind === "failed") expect(o.error).toBe("provider_transient");
  });
  it("unknown_outcome is final and distinct from success/failure", () => {
    const u = unknown("addMagnet timed out");
    expect(u.kind).toBe("unknown_outcome");
    expect(isFinal(u)).toBe(true);
  });
  it("every ErrorKind is one of the closed set", () => {
    const kinds = [
      "user_input",
      "configuration",
      "tracker_auth",
      "provider_auth",
      "provider_permanent",
      "provider_transient",
      "unknown_outcome",
      "internal",
    ] as const;
    for (const k of kinds) {
      const o = failed(k, "x");
      expect(isFinal(o)).toBe(true);
    }
  });
});
