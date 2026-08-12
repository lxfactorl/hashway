// src/adapters/diagnostics/export.ts
import type { DownloadsPort } from "@ports/downloads";
import type { RingBuffer } from "@adapters/diagnostics/ring-buffer";

export { createRingBuffer } from "@adapters/diagnostics/ring-buffer";

export async function exportDiagnostics(downloads: DownloadsPort, buf: RingBuffer): Promise<void> {
  const events = await buf.snapshot();
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    events,
  };
  await downloads.downloadJson("hashway-diagnostics.json", JSON.stringify(payload, null, 2));
}
