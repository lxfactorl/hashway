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
    expect(mapAddMagnetResult(200, 8).kind === "failed").toBe(true);
  });
  it("33 -> already_active", () => {
    expect(mapAddMagnetResult(200, 33).kind).toBe("already_active");
  });
  it("429/34 -> provider_transient", () => {
    expect(mapAddMagnetResult(429, undefined).kind === "failed").toBe(true);
    expect(mapAddMagnetResult(200, 34).kind === "failed").toBe(true);
  });
  it("503/25 -> provider_transient", () => {
    expect(mapAddMagnetResult(503, undefined).kind === "failed").toBe(true);
    expect(mapAddMagnetResult(200, 25).kind === "failed").toBe(true);
  });
  it("403 -> provider_permanent", () => {
    expect(mapAddMagnetResult(403, undefined).kind === "failed").toBe(true);
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
});

describe("mapValidateTokenResult", () => {
  it("200 -> accepted", () => {
    expect(mapValidateTokenResult(200).kind).toBe("accepted");
  });
  it("401 -> provider_auth", () => {
    expect(mapValidateTokenResult(401).kind === "failed").toBe(true);
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
  it("other errors are not ambiguous", () => {
    expect(isAmbiguousNetwork(new Error("boom"))).toBe(false);
  });
});
