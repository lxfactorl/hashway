// tests/property/retry-classification.property.test.ts
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { canRetry, classifyHttp, type RetryableOp } from "@domain/retry-policy";

describe("retry classification property", () => {
  it("addMagnet is never retryable regardless of status", () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 599 }), (status) => {
        expect(canRetry("addMagnet", classifyHttp(status, undefined))).toBe(false);
      }),
    );
  });
  it("selectFiles retryable only for transient statuses (429/5xx)", () => {
    const ops: RetryableOp[] = ["selectFiles", "validateToken"];
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 599 }), fc.constantFrom(...ops), (status, op) => {
        const ok = canRetry(op, classifyHttp(status, undefined));
        const transient = status === 429 || status >= 500;
        expect(ok).toBe(transient);
      }),
    );
  });
});
