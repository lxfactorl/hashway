// tests/unit/infohash.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTorrent } from "@domain/bencode";
import { computeV1InfoHash } from "@domain/infohash";

const fx = (n: string) => readFileSync(resolve(process.cwd(), "tests/fixtures/torrents", n));

const EXPECTED: string = "44020936b61b241a250af90aa0d1fac4567a3f25";

describe("computeV1InfoHash", () => {
  it("produces 40 lowercase hex chars for the known fixture", async () => {
    const t = parseTorrent(new Uint8Array(fx("single-file-v1.torrent")));
    const hash = await computeV1InfoHash(t.infoBytes);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
    expect(hash).toBe(EXPECTED);
  });
});
