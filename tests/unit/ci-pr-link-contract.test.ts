import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ciPath = resolve(process.cwd(), ".github/workflows/ci.yml");

const closingKeywordEre =
  "(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)[[:space:]]+(issue[[:space:]]*)?#[0-9]+";

function compact(yaml: string): string {
  return yaml.replace(/\s+/g, "");
}

function hasClosingKeyword(body: string): boolean {
  return new RegExp(
    "(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\\s+(?:issue\\s*)?#\\d+",
    "i",
  ).test(body);
}

describe("ci pr-link contract", () => {
  it(".github/workflows/ci.yml exists", () => {
    expect(existsSync(ciPath)).toBe(true);
  });

  it("defines a pr-link job", () => {
    const ci = readFileSync(ciPath, "utf8");
    expect(ci).toMatch(/^\s{2}pr-link:/m);
  });

  it("runs only on pull_request events", () => {
    const ci = readFileSync(ciPath, "utf8");
    const prLink = ci.split("pr-link:")[1] ?? "";
    expect(prLink).toContain("github.event_name == 'pull_request'");
  });

  it("skips dependabot PRs", () => {
    const ci = readFileSync(ciPath, "utf8");
    const prLink = ci.split("pr-link:")[1] ?? "";
    expect(prLink).toContain("dependabot[bot]");
  });

  it("checks the pull request body for a closing keyword + issue number", () => {
    const ci = readFileSync(ciPath, "utf8");
    const prLink = ci.split("pr-link:")[1] ?? "";
    expect(prLink).toContain("github.event.pull_request.body");
    expect(compact(prLink)).toContain(compact(closingKeywordEre));
  });
});

describe("closing keyword matching", () => {
  it("matches Closes #N", () => {
    expect(hasClosingKeyword("Closes #23")).toBe(true);
  });

  it("matches Fixes issue #N", () => {
    expect(hasClosingKeyword("Fixes issue #456")).toBe(true);
  });

  it("matches resolve #N case-insensitively", () => {
    expect(hasClosingKeyword("RESOLVE #789")).toBe(true);
  });

  it("matches Closed #N in prose", () => {
    expect(hasClosingKeyword("This closes #3.")).toBe(true);
  });

  it("rejects a bare issue number without a keyword", () => {
    expect(hasClosingKeyword("See #23")).toBe(false);
  });

  it("rejects a keyword without an issue number", () => {
    expect(hasClosingKeyword("Closes the issue")).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(hasClosingKeyword("")).toBe(false);
  });
});
