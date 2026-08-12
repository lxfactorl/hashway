import { describe, it, expect } from "vitest";
import { classifyLink } from "@adapters/firefox/active-tab";
describe("classifyLink", () => {
  it("magnet v1", () => {
    expect(
      classifyLink(
        "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
        "https://t.example.com/x",
      ),
    ).toEqual({ kind: "magnet_v1" });
  });
  it("https same-origin torrent", () => {
    expect(
      classifyLink(
        "https://t.example.com/torrents.php?action=download&id=1",
        "https://t.example.com/x",
      ),
    ).toEqual({ kind: "https_torrent" });
  });
  it("http -> http", () => {
    expect(classifyLink("http://x/a", "https://t.example.com/x")).toEqual({ kind: "http" });
  });
  it("javascript -> unsupported", () => {
    expect(classifyLink("javascript:alert(1)", "https://t.example.com/x")).toEqual({
      kind: "unsupported",
    });
  });
  it("cross-origin https -> unsupported (MVP)", () => {
    expect(classifyLink("https://cdn.other.com/x.torrent", "https://t.example.com/x")).toEqual({
      kind: "unsupported",
    });
  });
});
