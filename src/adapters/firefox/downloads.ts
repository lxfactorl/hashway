// src/adapters/firefox/downloads.ts
import type { DownloadsPort } from "@ports/downloads";

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function createFirefoxDownloads(): DownloadsPort {
  return {
    async downloadJson(filename, json) {
      const dataUrl = `data:application/json;base64,${toBase64(json)}`;
      await browser.downloads.download({ url: dataUrl, filename, saveAs: false });
    },
  };
}
