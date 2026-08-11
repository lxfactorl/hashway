// tests/property/bencode.property.test.ts
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseTorrent, BencodeError } from "@domain/bencode";

describe("bencode property", () => {
  it("rejects any input not starting with 'd'", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 64 }).filter((b) => b[0] !== 0x64),
        (bytes) => {
          expect(() => parseTorrent(bytes)).toThrow(BencodeError);
        },
      ),
    );
  });
  it("empty input always throws", () => {
    fc.assert(
      fc.property(fc.constant(new Uint8Array(0)), (b) => {
        expect(() => parseTorrent(b)).toThrow();
      }),
    );
  });
});
