// src/adapters/firefox/storage.ts
import type { StoragePort } from "@ports/storage";

export function createFirefoxStorage(): StoragePort {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const data = await browser.storage.local.get(key);
      return data[key] as T | undefined;
    },
    async set(key, value) {
      await browser.storage.local.set({ [key]: value });
    },
    async remove(key) {
      await browser.storage.local.remove(key);
    },
    async bytesUsed() {
      const data = await browser.storage.local.get();
      return JSON.stringify(data).length;
    },
  };
}
