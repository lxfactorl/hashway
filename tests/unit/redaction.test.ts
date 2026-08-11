// tests/unit/redaction.test.ts
import { describe, it, expect } from "vitest";
import { redactUrl, redactHeaders, sanitizeEvent } from "@adapters/diagnostics/redaction";

describe("redactUrl", () => {
  it("strips query and fragment", () => {
    expect(redactUrl("https://t.example.com/a?b=1&passkey=Z#c")).toBe("https://t.example.com/a");
  });
  it("invalid URL yields the placeholder", () => {
    expect(redactUrl("not a url")).toBe("<invalid url>");
  });
});

describe("redactHeaders", () => {
  it("drops authorization, keeps content-type", () => {
    expect(redactHeaders({ Authorization: "Bearer xyz", "Content-Type": "text/plain" })).toEqual({
      "Content-Type": "text/plain",
    });
  });
});

describe("sanitizeEvent", () => {
  it("drops token/passkey/secret keys", () => {
    const e = { token: "abc", nested: { passkey: "x", ok: 1 } };
    const out = sanitizeEvent(e) as { nested: { ok: number } };
    expect(out).not.toHaveProperty("token");
    expect(out.nested).not.toHaveProperty("passkey");
    expect(out.nested.ok).toBe(1);
  });
  it("reduces a full magnet string to sanitized form", () => {
    const e = {
      magnet:
        "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Hi&tr=https://t.example.com/key=SECRET",
    };
    const out = sanitizeEvent(e) as { magnet: string };
    expect(out.magnet).toBe("magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Hi");
  });
  it("recurses arrays, dropping tokens inside elements", () => {
    expect(sanitizeEvent({ list: [{ token: "x" }, ["a"]] })).toEqual({ list: [{}, ["a"]] });
  });
});
