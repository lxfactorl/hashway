// tests/property/redaction.property.test.ts
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sanitizeEvent } from "@adapters/diagnostics/redaction";

const secretValue = fc
  .array(
    fc.constantFrom(
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
    ),
    {
      minLength: 1,
      maxLength: 20,
    },
  )
  .map((chars) => chars.join(""));

describe("redaction property", () => {
  it("never leaks token/passkey/authorization keys", () => {
    fc.assert(
      fc.property(
        fc.record({ token: secretValue, passkey: secretValue, ok: fc.integer() }),
        (obj) => {
          const json = JSON.stringify(sanitizeEvent(obj));
          expect(json).not.toContain(obj.token);
          expect(json).not.toContain(obj.passkey);
        },
      ),
    );
  });
  it("magnet strings never contain tr=/xs=/x.pe=/passkey", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9a-fA-F]{40}$/),
        fc.string({ maxLength: 20 }),
        (ih, dn) => {
          const out = sanitizeEvent({
            magnet: `magnet:?xt=urn:btih:${ih}&dn=${encodeURIComponent(dn)}&tr=https://t.example.com/key=P`,
          }) as { magnet: string };
          expect(out.magnet).not.toMatch(/tr=|xs=|x\.pe=|passkey|key=/);
        },
      ),
    );
  });
});
