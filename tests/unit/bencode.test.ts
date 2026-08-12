// tests/unit/bencode.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseTorrent,
  BencodeError,
  type ParsedTorrent,
  type BencodeErrorKind,
} from "@domain/bencode";

const fx = (n: string) => readFileSync(resolve(process.cwd(), "tests/fixtures/torrents", n));

describe("parseTorrent", () => {
  it("parses a single-file v1 torrent", () => {
    const t: ParsedTorrent = parseTorrent(new Uint8Array(fx("single-file-v1.torrent")));
    expect(t.isV1Single).toBe(true);
    expect(t.isV1Multi).toBe(false);
    expect(t.name).toBe("demo.txt");
    expect(t.infoBytes.length).toBeGreaterThan(0);
  });
  it("parses a multi-file v1 torrent", () => {
    const t = parseTorrent(new Uint8Array(fx("multi-file-v1.torrent")));
    expect(t.isV1Multi).toBe(true);
    expect(t.isV1Single).toBe(false);
    expect(t.name).toBe("demo-dir");
  });
  it("rejects malformed bytes", () => {
    expect(() => parseTorrent(new Uint8Array(fx("malformed.torrent")))).toThrow();
  });
  it("rejects v2-only metadata", () => {
    const v2 = readFileSync(resolve(process.cwd(), "tests/fixtures/torrents/v2-only.torrent"));
    expect(() => parseTorrent(new Uint8Array(v2))).toThrow(/v2_rejected|v2/);
  });
  it("rejects HTML as not_torrent", () => {
    expect(() => parseTorrent(new Uint8Array(Buffer.from("<html>")))).toThrow(
      /not_torrent|torrent/,
    );
  });
  it("rejects empty input", () => {
    expect(() => parseTorrent(new Uint8Array(0))).toThrow();
  });
  it("rejects dict not starting with 'd'", () => {
    expect(() => parseTorrent(new Uint8Array(Buffer.from("li42ee")))).toThrow();
  });
});

describe("parseTorrent defensive", () => {
  const benStr = (s: string) => `${String(s.length)}:${s}`;
  const benInt = (n: number) => `i${String(n)}e`;
  const info = (inner: string) => "d" + inner + "e";
  const torrent = (inner: string) => "d" + inner + "e";
  const v1SingleInfo = (extra: string) =>
    info(benStr("name") + benStr("a.txt") + benStr("length") + benInt(12) + extra);

  const errKind = (s: string): BencodeErrorKind | undefined => {
    try {
      parseTorrent(new Uint8Array(Buffer.from(s)));
    } catch (e) {
      if (e instanceof BencodeError) return e.kind;
    }
    return undefined;
  };

  it("rejects unterminated integer", () => {
    expect(errKind("d1:ai12")).toBe("malformed");
  });
  it("rejects integer with an invalid digit", () => {
    expect(errKind(torrent(benStr("a") + "i1xe"))).toBe("malformed");
  });
  it("rejects empty integer", () => {
    expect(errKind(torrent(benStr("a") + "ie"))).toBe("malformed");
  });
  it("rejects negative zero integer", () => {
    expect(errKind(torrent(benStr("a") + "i-0e"))).toBe("malformed");
  });
  it("rejects integer with leading zero", () => {
    expect(errKind(torrent(benStr("a") + "i01e"))).toBe("malformed");
  });
  it("rejects integer outside safe range", () => {
    expect(errKind(torrent(benStr("a") + "i99999999999999999999e"))).toBe("malformed");
  });
  it("tolerates extra keys with negative integer values", () => {
    const t = parseTorrent(
      new Uint8Array(
        Buffer.from(torrent(benStr("neg") + "i-5e" + benStr("info") + v1SingleInfo(""))),
      ),
    );
    expect(t.name).toBe("a.txt");
    expect(t.isV1Single).toBe(true);
  });
  it("rejects string content beyond end of input", () => {
    expect(errKind(torrent(benStr("a") + "5:xy"))).toBe("malformed");
  });
  it("rejects unterminated string length", () => {
    expect(errKind("d1:a1")).toBe("malformed");
  });
  it("rejects invalid string length byte", () => {
    expect(errKind(torrent(benStr("a") + "1x"))).toBe("malformed");
  });
  it("rejects string over 1 MiB as oversized", () => {
    expect(errKind(torrent(benStr("a") + "1048577:x"))).toBe("oversized");
  });
  it("rejects unterminated list", () => {
    expect(errKind("d1:al")).toBe("malformed");
  });
  it("rejects unterminated dictionary", () => {
    expect(errKind("d1:ad")).toBe("malformed");
  });
  it("rejects non-string dictionary key", () => {
    expect(errKind(torrent(benStr("a") + "i1e" + "i1e"))).toBe("malformed");
  });
  it("rejects unexpected value byte", () => {
    expect(errKind(torrent(benStr("a") + "x"))).toBe("malformed");
  });
  it("rejects value at end of input", () => {
    expect(errKind("d1:a")).toBe("malformed");
  });
  it("rejects nesting deeper than the depth limit", () => {
    expect(errKind("d0:".repeat(21) + "e".repeat(21))).toBe("malformed");
  });
  it("rejects v2 metadata as v2_rejected", () => {
    expect(
      errKind(torrent(benStr("info") + v1SingleInfo(benStr("meta version") + benInt(2)))),
    ).toBe("v2_rejected");
  });
  it("rejects non-integer meta version", () => {
    expect(
      errKind(torrent(benStr("info") + v1SingleInfo(benStr("meta version") + benStr("st")))),
    ).toBe("malformed");
  });
  it("rejects unknown meta version", () => {
    expect(
      errKind(torrent(benStr("info") + v1SingleInfo(benStr("meta version") + benInt(1)))),
    ).toBe("malformed");
  });
  it("rejects info without a name", () => {
    expect(errKind(torrent(benStr("info") + info(benStr("length") + benInt(12))))).toBe(
      "malformed",
    );
  });
  it("rejects torrent missing the info dictionary", () => {
    expect(errKind(torrent(benStr("a") + "i5e"))).toBe("malformed");
  });
  it("rejects non-dict info value", () => {
    expect(errKind(torrent(benStr("info") + benInt(5)))).toBe("malformed");
  });
  it("rejects non-string name", () => {
    expect(
      errKind(
        torrent(benStr("info") + info(benStr("name") + benInt(5) + benStr("length") + benInt(12))),
      ),
    ).toBe("malformed");
  });
  it("rejects info with both length and files", () => {
    expect(
      errKind(
        torrent(
          benStr("info") +
            info(
              benStr("name") +
                benStr("a.txt") +
                benStr("length") +
                benInt(12) +
                benStr("files") +
                "le",
            ),
        ),
      ),
    ).toBe("malformed");
  });
  it("rejects info with neither length nor files", () => {
    expect(errKind(torrent(benStr("info") + info(benStr("name") + benStr("a.txt"))))).toBe(
      "malformed",
    );
  });
  it("rejects non-integer length", () => {
    expect(
      errKind(
        torrent(
          benStr("info") + info(benStr("name") + benStr("a.txt") + benStr("length") + benStr("12")),
        ),
      ),
    ).toBe("malformed");
  });
  it("rejects non-list files", () => {
    expect(
      errKind(
        torrent(
          benStr("info") + info(benStr("name") + benStr("a.txt") + benStr("files") + benInt(3)),
        ),
      ),
    ).toBe("malformed");
  });
});
