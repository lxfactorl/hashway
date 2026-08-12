// tests/unit/ring-buffer.test.ts
import { describe, it, expect } from "vitest";
import { createRingBuffer } from "@adapters/diagnostics/ring-buffer";
import { createVersionedStorage } from "@adapters/storage/versioned-storage";
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

describe("ring buffer", () => {
  it("keeps events under the byte budget by evicting oldest", async () => {
    const storage = createVersionedStorage(fakeStorage());
    const buf = createRingBuffer(storage, 200); // tiny budget for the test
    for (let i = 0; i < 50; i++) await buf.append({ i });
    const snap = await buf.snapshot();
    const size = new TextEncoder().encode(JSON.stringify(snap)).length;
    expect(size).toBeLessThanOrEqual(200);
    expect(snap.length).toBeLessThan(50);
    // newest is preserved; the last appended index should be in the snapshot
    expect((snap[snap.length - 1] as { i: number }).i).toBe(49);
  });
  it("sanitizes events on append", async () => {
    const storage = createVersionedStorage(fakeStorage());
    const buf = createRingBuffer(storage, 1 * 1024 * 1024);
    await buf.append({ token: "SECRET", ok: 1 });
    const snap = (await buf.snapshot()) as Array<Record<string, unknown>>;
    const first = snap[0];
    expect(first).not.toHaveProperty("token");
    expect(first?.["ok"]).toBe(1);
  });
});
