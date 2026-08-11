// tests/unit/versioned-storage.test.ts
import { describe, it, expect } from "vitest";
import { createVersionedStorage, STORAGE_KEYS } from "@adapters/storage/versioned-storage";
import type { StoragePort } from "@ports/storage";

function fakeStorage(): StoragePort {
  const map = new Map<string, unknown>();
  let bytes = 0;
  return {
    async get(k) {
      return (await Promise.resolve(map.get(k))) as never;
    },
    async set(k, v) {
      bytes += JSON.stringify(v).length;
      map.set(k, v);
      await Promise.resolve();
    },
    async remove(k) {
      map.delete(k);
      await Promise.resolve();
    },
    async bytesUsed() {
      return await Promise.resolve(bytes);
    },
  };
}

describe("versioned storage", () => {
  it("token round-trips", async () => {
    const s = createVersionedStorage(fakeStorage());
    await s.setToken("abc");
    expect(await s.getToken()).toBe("abc");
    await s.clearToken();
    expect(await s.getToken()).toBeUndefined();
  });
  it("keys are versioned v1", () => {
    expect(STORAGE_KEYS.token).toBe("hashway.v1.token");
    expect(STORAGE_KEYS.diagnostics).toBe("hashway.v1.diagnostics");
  });
  it("diagnostics round-trips", async () => {
    const s = createVersionedStorage(fakeStorage());
    await s.setDiagnostics([{ a: 1 }, { b: 2 }]);
    expect(await s.getDiagnostics()).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it("getDiagnostics unwraps the {version, events} envelope", async () => {
    const storage = fakeStorage();
    const s = createVersionedStorage(storage);
    await s.setDiagnostics([{ a: 1 }]);
    expect(await storage.get(STORAGE_KEYS.diagnostics)).toEqual({
      version: 1,
      events: [{ a: 1 }],
    });
    expect(await s.getDiagnostics()).toEqual([{ a: 1 }]);
  });
  it("getDiagnostics returns a legacy bare array as-is", async () => {
    const storage = fakeStorage();
    await storage.set(STORAGE_KEYS.diagnostics, [{ legacy: true }]);
    const s = createVersionedStorage(storage);
    expect(await s.getDiagnostics()).toEqual([{ legacy: true }]);
  });
  it("getDiagnostics returns [] when nothing is stored", async () => {
    const s = createVersionedStorage(fakeStorage());
    expect(await s.getDiagnostics()).toEqual([]);
  });
});
