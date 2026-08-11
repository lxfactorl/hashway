// src/adapters/storage/versioned-storage.ts
import type { StoragePort } from "@ports/storage";

export const STORAGE_KEYS = {
  token: "hashway.v1.token",
  diagnostics: "hashway.v1.diagnostics",
} as const;

export interface VersionedStorage {
  getToken(): Promise<string | undefined>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  getDiagnostics(): Promise<unknown[]>;
  setDiagnostics(events: unknown[]): Promise<void>;
  bytesUsed(): Promise<number>;
}

const DIAGNOSTICS_SCHEMA_VERSION = 1;

function isEventsEnvelope(value: unknown): value is { version: number; events: unknown[] } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("events" in value)) {
    return false;
  }
  return Array.isArray(value.events);
}

export function createVersionedStorage(storage: StoragePort): VersionedStorage {
  return {
    async getToken() {
      return storage.get<string>(STORAGE_KEYS.token);
    },
    async setToken(token: string) {
      await storage.set(STORAGE_KEYS.token, token);
    },
    async clearToken() {
      await storage.remove(STORAGE_KEYS.token);
    },
    async getDiagnostics() {
      const stored = await storage.get<unknown>(STORAGE_KEYS.diagnostics);
      if (stored == null) {
        return [];
      }
      if (Array.isArray(stored)) {
        return stored as unknown[];
      }
      if (isEventsEnvelope(stored)) {
        return stored.events;
      }
      return [];
    },
    async setDiagnostics(events: unknown[]) {
      await storage.set(STORAGE_KEYS.diagnostics, {
        version: DIAGNOSTICS_SCHEMA_VERSION,
        events,
      });
    },
    async bytesUsed() {
      return storage.bytesUsed();
    },
  };
}
