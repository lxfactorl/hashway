// tests/unit/status-map.test.ts
import { describe, it, expect } from "vitest";
import {
  mapAddMagnetResult,
  mapSelectFilesResult,
  mapValidateTokenResult,
  isAmbiguousNetwork,
} from "@adapters/real-debrid/status-map";

describe("mapAddMagnetResult", () => {
  it("201 is accepted", () => {
    expect(mapAddMagnetResult(201, undefined).kind).toBe("accepted");
  });
  it("401 / error 8 -> provider_auth", () => {
    expect(
      mapAddMagnetResult(401, undefined).kind === "failed" &&
        (mapAddMagnetResult(401, undefined) as { error: string }).error,
    ).toBe("provider_auth");
    const error8 = mapAddMagnetResult(200, 8);
    expect(error8.kind === "failed").toBe(true);
    if (error8.kind === "failed") {
      expect(error8.error).toBe("provider_auth");
      expect(error8.message).toBe("Invalid Real-Debrid token");
    }
  });
  it("33 -> already_active", () => {
    const o = mapAddMagnetResult(200, 33);
    expect(o.kind).toBe("already_active");
    if (o.kind === "already_active") expect(o.message).toBe("Already active in Real-Debrid");
  });
  it("429/34 -> provider_transient", () => {
    expect(mapAddMagnetResult(429, undefined).kind === "failed").toBe(true);
    expect(mapAddMagnetResult(200, 34).kind === "failed").toBe(true);
    const o = mapAddMagnetResult(429, undefined);
    if (o.kind === "failed") expect(o.message).toBe("Rate limited");
  });
  it("503/25 -> provider_transient", () => {
    expect(mapAddMagnetResult(503, undefined).kind === "failed").toBe(true);
    expect(mapAddMagnetResult(200, 25).kind === "failed").toBe(true);
    const o = mapAddMagnetResult(503, undefined);
    if (o.kind === "failed") expect(o.message).toBe("RD unavailable");
  });
  it("403 -> provider_permanent", () => {
    expect(mapAddMagnetResult(403, undefined).kind === "failed").toBe(true);
    const o = mapAddMagnetResult(403, undefined);
    if (o.kind === "failed") expect(o.error).toBe("provider_permanent");
  });
  it("500 -> provider_transient fallback", () => {
    const o = mapAddMagnetResult(500, undefined);
    expect(o.kind).toBe("failed");
    if (o.kind === "failed") {
      expect(o.error).toBe("provider_transient");
      expect(o.message).toBe("RD error 500");
    }
  });
  it("418 -> provider_permanent fallback", () => {
    const o = mapAddMagnetResult(418, undefined);
    expect(o.kind).toBe("failed");
    if (o.kind === "failed") expect(o.error).toBe("provider_permanent");
  });
  it("200, no error code -> internal fallback", () => {
    const o = mapAddMagnetResult(200, undefined);
    expect(o.kind).toBe("failed");
    if (o.kind === "failed") {
      expect(o.error).toBe("internal");
      expect(o.message).toBe("Unexpected status 200");
    }
  });
});

describe("mapSelectFilesResult", () => {
  it("202/204 -> accepted", () => {
    expect(mapSelectFilesResult(202, undefined).kind).toBe("accepted");
    expect(mapSelectFilesResult(204, undefined).kind).toBe("accepted");
  });
  it("31 (already done) -> accepted", () => {
    expect(mapSelectFilesResult(200, 31).kind).toBe("accepted");
  });
  it("401 -> provider_auth", () => {
    const o = mapSelectFilesResult(401, undefined);
    if (o.kind === "failed") expect(o.error).toBe("provider_auth");
  });
  it("503 -> provider_transient", () => {
    const o = mapSelectFilesResult(503, undefined);
    if (o.kind === "failed") {
      expect(o.error).toBe("provider_transient");
      expect(o.message).toBe("RD unavailable");
    }
  });
  it("200, no error code -> internal fallback", () => {
    const o = mapSelectFilesResult(200, undefined);
    expect(o.kind).toBe("failed");
    if (o.kind === "failed") expect(o.error).toBe("internal");
  });
});

describe("mapValidateTokenResult", () => {
  it("200 -> accepted", () => {
    expect(mapValidateTokenResult(200).kind).toBe("accepted");
  });
  it("401 -> provider_auth", () => {
    expect(mapValidateTokenResult(401).kind === "failed").toBe(true);
  });
  it("503 -> provider_transient", () => {
    const o = mapValidateTokenResult(503);
    if (o.kind === "failed") {
      expect(o.error).toBe("provider_transient");
      expect(o.message).toBe("RD unavailable");
    }
  });
  it("418 -> provider_permanent", () => {
    const o = mapValidateTokenResult(418);
    if (o.kind === "failed") expect(o.error).toBe("provider_permanent");
  });
});

describe("isAmbiguousNetwork", () => {
  it("TypeError is ambiguous", () => {
    expect(isAmbiguousNetwork(new TypeError("failed to fetch"))).toBe(true);
  });
  it("AbortError (timeout) is ambiguous", () => {
    const e = new Error("timeout");
    e.name = "AbortError";
    expect(isAmbiguousNetwork(e)).toBe(true);
  });
  it("TimeoutError is ambiguous", () => {
    const e = new Error("timeout");
    e.name = "TimeoutError";
    expect(isAmbiguousNetwork(e)).toBe(true);
  });
  it("other errors are not ambiguous", () => {
    expect(isAmbiguousNetwork(new Error("boom"))).toBe(false);
  });
});
