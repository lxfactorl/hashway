// src/adapters/diagnostics/ring-buffer.ts
import type { VersionedStorage } from "@adapters/storage/versioned-storage";
import { sanitizeEvent } from "@adapters/diagnostics/redaction";

export interface RingBuffer {
  append(event: unknown): Promise<void>;
  snapshot(): Promise<unknown[]>;
}

export function createRingBuffer(
  storage: VersionedStorage,
  maxBytes: number = 4 * 1024 * 1024,
): RingBuffer {
  const enc = new TextEncoder();
  const sizeBytes = (events: unknown[]) => enc.encode(JSON.stringify(events)).length;
  return {
    async append(event) {
      const events = await storage.getDiagnostics();
      events.push(sanitizeEvent(event));
      while (events.length > 0 && sizeBytes(events) > maxBytes) events.shift();
      await storage.setDiagnostics(events);
    },
    async snapshot() {
      return storage.getDiagnostics();
    },
  };
}
