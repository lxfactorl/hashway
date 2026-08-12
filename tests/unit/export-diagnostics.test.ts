// tests/unit/export-diagnostics.test.ts
import { describe, it, expect } from "vitest";
import { exportDiagnostics, createRingBuffer } from "@adapters/diagnostics/export";
import { createVersionedStorage } from "@adapters/storage/versioned-storage";
import { exportDiagnosticsUseCase } from "@application/export-diagnostics";
import type { StoragePort } from "@ports/storage";
import type { DownloadsPort } from "@ports/downloads";

function fakeStorage(): StoragePort {
  const map = new Map<string, unknown>();
  return {
    async get(k) {
      return (await Promise.resolve(map.get(k))) as never;
    },
    async set(k, v) {
      map.set(k, v);
      await Promise.resolve();
    },
    async remove(k) {
      map.delete(k);
      await Promise.resolve();
    },
    async bytesUsed() {
      return await Promise.resolve(0);
    },
  };
}

describe("exportDiagnostics", () => {
  it("downloads a sanitized JSON via the downloads port", async () => {
    const storage = createVersionedStorage(fakeStorage());
    const buf = createRingBuffer(storage, 1 * 1024 * 1024);
    await buf.append({ step: "addMagnet", status: 201 });
    let saved: { filename: string; json: string } | undefined;
    const downloads: DownloadsPort = {
      downloadJson(filename, json) {
        saved = { filename, json };
        return Promise.resolve();
      },
    };
    await exportDiagnostics(downloads, buf);
    if (saved === undefined) {
      throw new Error("downloadJson was not called");
    }
    expect(saved.filename).toBe("hashway-diagnostics.json");
    const parsed = JSON.parse(saved.json) as { exportedAt?: unknown; events?: unknown[] };
    expect(parsed).toHaveProperty("exportedAt");
    expect(parsed.events).toBeInstanceOf(Array);
  });
});

describe("exportDiagnosticsUseCase", () => {
  it("delegates to the injected export function", async () => {
    let called = 0;
    await exportDiagnosticsUseCase({
      exportFn: () => {
        called++;
        return Promise.resolve();
      },
    });
    expect(called).toBe(1);
  });
});
