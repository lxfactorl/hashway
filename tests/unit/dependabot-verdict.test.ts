// tests/unit/dependabot-verdict.test.ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const script = resolve(process.cwd(), "scripts/dependabot-verdict.ps1");

function runVerdict(input: {
  updateType: string;
  mergeableState: string;
  auditExit: number;
}): string {
  const stdout = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-InputJson",
      JSON.stringify(input),
    ],
    { encoding: "utf8" },
  );
  return stdout.trim();
}

describe("dependabot verdict", () => {
  it("auto-merges minor npm dev bump with clean audit", () => {
    expect(
      runVerdict({
        updateType: "version-update:semver-minor",
        mergeableState: "clean",
        auditExit: 0,
      }),
    ).toBe("auto-merge");
  });

  it("auto-merges patch prod bump", () => {
    expect(
      runVerdict({
        updateType: "version-update:semver-patch",
        mergeableState: "clean",
        auditExit: 0,
      }),
    ).toBe("auto-merge");
  });

  it("auto-merges minor github-actions bump (audit skipped -> 0)", () => {
    expect(
      runVerdict({
        updateType: "version-update:semver-minor",
        mergeableState: "clean",
        auditExit: 0,
      }),
    ).toBe("auto-merge");
  });

  it("flags major bump of any ecosystem", () => {
    expect(
      runVerdict({
        updateType: "version-update:semver-major",
        mergeableState: "clean",
        auditExit: 0,
      }),
    ).toBe("needs-review");
  });

  it("flags dirty (merge conflict) even for minor bump", () => {
    expect(
      runVerdict({
        updateType: "version-update:semver-minor",
        mergeableState: "dirty",
        auditExit: 0,
      }),
    ).toBe("needs-review");
  });

  it("flags audit failure (nonzero auditExit)", () => {
    expect(
      runVerdict({
        updateType: "version-update:semver-patch",
        mergeableState: "clean",
        auditExit: 1,
      }),
    ).toBe("needs-review");
  });

  it("flags major + dirty + audit failure as needs-review", () => {
    expect(
      runVerdict({
        updateType: "version-update:semver-major",
        mergeableState: "dirty",
        auditExit: 2,
      }),
    ).toBe("needs-review");
  });

  it("treats behind state as auto-merge (GitHub updates branch first)", () => {
    expect(
      runVerdict({
        updateType: "version-update:semver-patch",
        mergeableState: "behind",
        auditExit: 0,
      }),
    ).toBe("auto-merge");
  });

  it("treats unknown mergeable_state as auto-merge (only dirty blocks)", () => {
    expect(
      runVerdict({
        updateType: "version-update:semver-patch",
        mergeableState: "",
        auditExit: 0,
      }),
    ).toBe("auto-merge");
  });
});
