// src/ports/downloads.ts
export interface DownloadsPort {
  downloadJson(filename: string, json: string): Promise<void>;
}
