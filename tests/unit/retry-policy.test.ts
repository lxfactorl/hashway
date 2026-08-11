// tests/unit/retry-policy.test.ts
import { describe, it, expect } from "vitest";
import { classifyHttp, canRetry, backoffMs } from "@domain/retry-policy";

describe("classifyHttp", () => {
  it("maps 401 to provider_auth", () => {
    expect(classifyHttp(401, undefined)).toBe("provider_auth");
  });
  it("maps 400/403 to provider_permanent", () => {
    expect(classifyHttp(400, undefined)).toBe("provider_permanent");
    expect(classifyHttp(403, undefined)).toBe("provider_permanent");
  });
  it("maps 429/503 to provider_transient", () => {
    expect(classifyHttp(429, undefined)).toBe("provider_transient");
    expect(classifyHttp(503, undefined)).toBe("provider_transient");
  });
  it("maps 500 to provider_transient", () => {
    expect(classifyHttp(500, undefined)).toBe("provider_transient");
  });
  it("maps 404 to provider_permanent", () => {
    expect(classifyHttp(404, undefined)).toBe("provider_permanent");
  });
});

describe("canRetry", () => {
  it("addMagnet is NEVER retried even on transient", () => {
    expect(canRetry("addMagnet", "provider_transient")).toBe(false);
    expect(canRetry("addMagnet", "provider_permanent")).toBe(false);
    expect(canRetry("addMagnet", "provider_auth")).toBe(false);
  });
  it("selectFiles retries only on transient", () => {
    expect(canRetry("selectFiles", "provider_transient")).toBe(true);
    expect(canRetry("selectFiles", "provider_auth")).toBe(false);
    expect(canRetry("selectFiles", "provider_permanent")).toBe(false);
  });
  it("validateToken retries only on transient", () => {
    expect(canRetry("validateToken", "provider_transient")).toBe(true);
    expect(canRetry("validateToken", "provider_auth")).toBe(false);
  });
});

describe("backoffMs", () => {
  it("honors Retry-After within the 30s deadline", () => {
    expect(backoffMs(1, 500)).toBe(500);
  });
  it("caps exponential backoff at 8s and the 30s deadline", () => {
    expect(backoffMs(5, undefined)).toBeLessThanOrEqual(8000);
    expect(backoffMs(5, 60000)).toBe(30000);
  });
});
