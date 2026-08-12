// tests/e2e/fake-rd.ts
import { createServer } from "node:http";
import type { Server } from "node:http";

export interface FakeRdRequest {
  readonly method: string;
  readonly url: string;
  readonly body: string;
}

export interface FakeRd {
  readonly requests: FakeRdRequest[];
  start(): Promise<{ readonly port: number }>;
  stop(): Promise<void>;
}

// The MV2 extension fetches the fake RD from its own origin without a host
// permission for 127.0.0.1, so the fake answers CORS (and private-network
// preflight) headers to stay reachable whichever way Firefox enforces this.
const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Private-Network": "true",
};

export function createFakeRd(): FakeRd {
  const requests: FakeRdRequest[] = [];
  const server: Server = createServer((req, res) => {
    const method = req.method ?? "";
    const rawUrl = req.url ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({ method, url: rawUrl, body });
      const pathname = rawUrl.split("?")[0] ?? rawUrl;
      if (method === "OPTIONS") {
        res.writeHead(204, { ...CORS_HEADERS });
        res.end();
        return;
      }
      if (method === "POST" && pathname === "/rest/1.0/torrents/addMagnet") {
        res.writeHead(201, { ...CORS_HEADERS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: "t1" }));
        return;
      }
      if (method === "POST" && pathname === "/rest/1.0/torrents/selectFiles/t1") {
        res.writeHead(202, { ...CORS_HEADERS });
        res.end();
        return;
      }
      if (method === "GET" && pathname === "/rest/1.0/user") {
        res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
        res.end("{}");
        return;
      }
      res.writeHead(404, { ...CORS_HEADERS });
      res.end();
    });
  });
  return {
    requests,
    start() {
      return new Promise<{ readonly port: number }>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (address === null || typeof address === "string") {
            reject(new Error("fake RD bound to an unexpected address"));
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
