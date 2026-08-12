// tests/e2e/fake-tracker.ts
import { createServer } from "node:http";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface FakeTrackerRequest {
  readonly method: string;
  readonly url: string;
}

export interface FakeTracker {
  readonly requests: FakeTrackerRequest[];
  start(): Promise<{ readonly port: number }>;
  stop(): Promise<void>;
}

export function createFakeTracker(): FakeTracker {
  const requests: FakeTrackerRequest[] = [];
  const torrentBytes = readFileSync(
    resolve(process.cwd(), "tests/fixtures/torrents/single-file-v1.torrent"),
  );
  const server: Server = createServer((req, res) => {
    const method = req.method ?? "";
    const rawUrl = req.url ?? "";
    requests.push({ method, url: rawUrl });
    const pathname = rawUrl.split("?")[0] ?? rawUrl;
    if (method === "GET" && pathname === "/torrents/download") {
      res.writeHead(200, {
        "Content-Type": "application/x-bittorrent",
        "Content-Length": String(torrentBytes.length),
      });
      res.end(torrentBytes);
      return;
    }
    if (method === "GET" && pathname === "/torrents/login") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<!doctype html><html><body>login</body></html>");
      return;
    }
    req.resume();
    res.writeHead(404);
    res.end();
  });
  return {
    requests,
    start() {
      return new Promise<{ readonly port: number }>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (address === null || typeof address === "string") {
            reject(new Error("fake tracker bound to an unexpected address"));
            return;
          }
          resolve({ port: address.port });
        });
      });
    },
    stop() {
      return new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((err) => {
          if (err === undefined) resolve();
          else reject(err);
        });
      });
    },
  };
}
