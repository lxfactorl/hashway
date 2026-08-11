# Dependabot Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Dependabot PR queue from accumulating by adding a GitHub Actions workflow that triages each new Dependabot PR, posts an idempotent summary comment, auto-merges safe minor/patch updates, and flags major bumps, conflicts, and audit failures with a `needs-review` label for the human.

**Architecture:** A new workflow `.github/workflows/dependabot-automerge.yml` triggers on `pull_request_target` for `dependabot[bot]` PRs. Job `triage` fetches Dependabot metadata, runs `npm audit --audit-level=critical` on the PR head (npm PRs only), resolves `mergeable_state` via the REST API, and computes a verdict (`auto-merge` | `needs-review`) with a small PowerShell script `scripts/dependabot-verdict.ps1` (JSON input, stdout verdict). Job `act` applies the verdict: posts/updates a marker-prefixed comment, adds/removes the `needs-review` label, and enables GitHub auto-merge (`gh pr merge --auto --squash`) — GitHub completes the merge only when all required checks pass. Verdict logic is unit-tested from vitest by spawning PowerShell.

**Tech Stack:** GitHub Actions (`pull_request_target`), `dependabot/fetch-metadata` (pinned SHA), `gh` CLI, PowerShell (`pwsh` on ubuntu-latest, `powershell.exe` in tests on windows-latest), vitest.

## Global Constraints

- **Conservative merge policy.** Auto-merge only minor/patch updates (npm dev + prod, and GitHub Actions) with a passing audit and non-dirty state. Major bumps, conflicts (`mergeable_state == dirty`), and audit failures go to `needs-review`.
- **`pull_request_target` security.** The workflow runs in the base-repo context with the token. Never run `npm ci`, `build`, or tests on the PR head — only `npm audit` (lockfile analysis). Never `eval`/`Invoke-Expression` untrusted PR content; interpolate into JSON only.
- **Trusted code only.** `scripts/dependabot-verdict.ps1` used by the workflow must come from the default checkout (base/main), never from the PR head.
- **Pinned actions.** Every `uses:` in the new workflow pinned to a full commit SHA, matching `ci.yml`/`release.yml`. `dependabot/fetch-metadata` SHA to be re-verified at implementation time (`gh api repos/dependabot/fetch-metadata/commits?per_page=1`).
- **Required checks unchanged.** `quality`, `commitlint`, `e2e` remain the only required status checks on `main`. This workflow is not added to branch protection.
- **Conventional Commits** for every commit. **All written artifacts in English.**
- **Do not run `npm run test:e2e` locally.** Do not merge/push without the user's approval.
- `needs-review` PRs are never merged, approved, or commented with merge instructions by the workflow — the decision stays with the human.
- Issue #20 (commitlint/Dependabot blocker) is fixed in a **separate worktree**; this plan does not touch `ci.yml` commitlint behavior.

---

## File Structure (across tasks)

```text
scripts/dependabot-verdict.ps1              # Task 1 (create)
tests/unit/dependabot-verdict.test.ts       # Task 1 (create)
.github/workflows/dependabot-automerge.yml  # Task 2 (create)
docs/technology-stack-and-repository-requirements.md  # Task 3 (modify: workflow list)
AGENTS.md                                   # Task 3 (modify: dependabot policy)
```

---

## Task 1: Verdict script + unit tests

**Files:**
- Create: `scripts/dependabot-verdict.ps1`
- Create: `tests/unit/dependabot-verdict.test.ts`

**Interfaces:** Produces `scripts/dependabot-verdict.ps1` with the contract: one mandatory positional parameter `-InputJson` (a JSON string), reads `updateType`, `mergeableState`, `auditExit`; writes exactly `auto-merge` or `needs-review` to stdout; exits 0. Task 2 invokes it from `pwsh`; Task 1's tests invoke it from `powershell.exe`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --run tests/unit/dependabot-verdict.test.ts`
Expected: FAIL — PowerShell errors because `scripts/dependabot-verdict.ps1` does not exist.

- [ ] **Step 3: Write the minimal implementation**

```powershell
# scripts/dependabot-verdict.ps1
# Computes the merge verdict for a Dependabot PR.
#
# Usage:
#   pwsh -NoProfile -File scripts/dependabot-verdict.ps1 -InputJson '<json>'
#
# Input JSON:
#   {
#     "updateType": "version-update:semver-major|semver-minor|semver-patch",
#     "mergeableState": "clean|dirty|behind|...",
#     "auditExit": 0
#   }
#
# Output: writes exactly "auto-merge" or "needs-review" to stdout. Exit code 0.

param(
  [Parameter(Mandatory = $true)]
  [string]$InputJson
)

$ErrorActionPreference = "Stop"

$data = $InputJson | ConvertFrom-Json

$isMajor = $data.updateType -eq "version-update:semver-major"
$isDirty = $data.mergeableState -eq "dirty"
$auditFailed = $data.auditExit -ne 0

if ($isMajor -or $isDirty -or $auditFailed) {
  Write-Output "needs-review"
} else {
  Write-Output "auto-merge"
}

exit 0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- --run tests/unit/dependabot-verdict.test.ts`
Expected: PASS (9 cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/dependabot-verdict.ps1 tests/unit/dependabot-verdict.test.ts
git commit -m "feat: add dependabot merge verdict script with unit tests"
```

---

## Task 2: Dependabot automation workflow

**Files:**
- Create: `.github/workflows/dependabot-automerge.yml`

**Interfaces:** Consumes `scripts/dependabot-verdict.ps1` from Task 1 (invoked via `pwsh`). Produces the workflow that auto-merges safe Dependabot PRs and labels the rest. Task 3 documents it.

- [ ] **Step 1: Verify the `dependabot/fetch-metadata` pin**

```bash
gh api repos/dependabot/fetch-metadata/commits?per_page=1 --jq '.[0].sha'
```

Use the returned SHA for the `dependabot/fetch-metadata` `uses:` line below. For `actions/checkout`, reuse the SHA already used in `ci.yml` (`11d5960a326750d5838078e36cf38b85af677262`).

- [ ] **Step 2: Write `.github/workflows/dependabot-automerge.yml`**

```yaml
name: Dependabot Automation

on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  triage:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    outputs:
      verdict: ${{ steps.verdict.outputs.verdict }}
      dependency_names: ${{ steps.metadata.outputs.dependency-names }}
      ecosystem: ${{ steps.metadata.outputs.package-ecosystem }}
      update_type: ${{ steps.metadata.outputs.update-type }}
      dependency_type: ${{ steps.metadata.outputs.dependency-type }}
    steps:
      - name: Checkout default branch (trusted code)
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262

      - name: Fetch Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@15c49302c4a0a37e326ec87971fba5d1e4322d97
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Checkout PR head for audit
        if: steps.metadata.outputs.package-ecosystem == 'npm'
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          path: pr-head

      - name: npm audit (critical)
        id: audit
        if: steps.metadata.outputs.package-ecosystem == 'npm'
        working-directory: pr-head
        shell: pwsh
        run: |
          npm audit --audit-level=critical
          if ($LASTEXITCODE -eq 0) {
            "audit_exit=0" >> $env:GITHUB_OUTPUT
          } else {
            "audit_exit=$LASTEXITCODE" >> $env:GITHUB_OUTPUT
          }

      - name: Resolve mergeable state via API
        id: mergeable
        shell: pwsh
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          $state = gh api "repos/$($env:GITHUB_REPOSITORY)/pulls/${{ github.event.pull_request.number }}" --jq '.mergeable_state'
          "mergeable_state=$state" >> $env:GITHUB_OUTPUT

      - name: Compute verdict
        id: verdict
        shell: pwsh
        run: |
          $auditExit = "${{ steps.audit.outputs.audit_exit }}"
          if ([string]::IsNullOrWhiteSpace($auditExit)) { $auditExit = "0" }
          $json = @{
            updateType     = "${{ steps.metadata.outputs.update-type }}"
            mergeableState = "${{ steps.mergeable.outputs.mergeable_state }}"
            auditExit      = [int]$auditExit
          } | ConvertTo-Json -Compress
          $verdict = pwsh -NoProfile -File scripts/dependabot-verdict.ps1 -InputJson $json
          "verdict=$verdict" >> $env:GITHUB_OUTPUT

  act:
    needs: triage
    runs-on: ubuntu-latest
    if: needs.triage.result == 'success'
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PR_NUMBER: ${{ github.event.pull_request.number }}
      PR_URL: ${{ github.event.pull_request.html_url }}
    steps:
      - name: Post or update triage comment
        shell: pwsh
        run: |
          $marker = "## :robot: Dependabot triage"
          $verdict = "${{ needs.triage.outputs.verdict }}"
          $depNames = "${{ needs.triage.outputs.dependency_names }}"
          $ecosystem = "${{ needs.triage.outputs.package-ecosystem }}"
          $updateType = "${{ needs.triage.outputs.update-type }}"
          $depType = "${{ needs.triage.outputs.dependency-type }}"
          $risk = if ($verdict -eq "needs-review") { "high" } else { "low" }
          $body = @"
$marker

- Dependency: $depNames
- Ecosystem: $ecosystem
- Update type: $updateType
- Dependency type: $depType
- Risk: $risk
- Verdict: $verdict
"@
          $comments = gh api "repos/$env:GITHUB_REPOSITORY/issues/$env:PR_NUMBER/comments" --jq '.[] | {id: .id, body: .body}' | ConvertFrom-Json
          $existing = $comments | Where-Object { $_.body.StartsWith($marker) } | Select-Object -First 1
          if ($existing) {
            gh api -X PATCH "repos/$env:GITHUB_REPOSITORY/issues/comments/$($existing.id)" -f body=$body
          } else {
            gh api -X POST "repos/$env:GITHUB_REPOSITORY/issues/$env:PR_NUMBER/comments" -f body=$body
          }

      - name: Ensure needs-review label exists
        shell: pwsh
        run: |
          gh label create needs-review --color "fbca04" --description "Requires human review" 2>$null

      - name: Apply needs-review label
        if: needs.triage.outputs.verdict == 'needs-review'
        shell: pwsh
        run: |
          gh api -X POST "repos/$env:GITHUB_REPOSITORY/issues/$env:PR_NUMBER/labels" -f labels[]=needs-review

      - name: Remove needs-review label
        if: needs.triage.outputs.verdict == 'auto-merge'
        shell: pwsh
        run: |
          gh api -X DELETE "repos/$env:GITHUB_REPOSITORY/issues/$env:PR_NUMBER/labels/needs-review" 2>$null

      - name: Enable auto-merge
        if: needs.triage.outputs.verdict == 'auto-merge'
        shell: pwsh
        run: |
          gh pr merge $env:PR_NUMBER --auto --squash
```

- [ ] **Step 3: Validate YAML syntax and open the PR**

No local YAML parser is installed. Validate by reading the file for tab/indent errors, then push and open the PR. GitHub reports a workflow parse error in the Actions tab if the YAML is malformed; since `pull_request_target` only runs the file from `main`'s copy, the merged run (Step 5) is the definitive parse check.

```bash
git add .github/workflows/dependabot-automerge.yml
git commit -m "ci: add dependabot automation workflow"
git push -u origin feat/dependabot-automation
gh pr create --title "ci: add dependabot automation workflow" --body "Adds a pull_request_target workflow that triages Dependabot PRs, posts a summary comment, auto-merges minor/patch updates with a clean audit, and flags major bumps/conflicts/audit failures with a needs-review label."
```

- [ ] **Step 4: Confirm CI passes on the PR**

Run: `gh pr checks --watch`
Expected: `quality`, `commitlint`, `e2e` all pass. Do not merge yet (Task 3 is part of the same logical change; merge once at the end with user approval).

- [ ] **Step 5: Post-merge parse check**

After merging to `main`, confirm the workflow appears and parses:

```bash
gh workflow list
```

Expected: `Dependabot Automation` listed. The workflow file is only executed from `main` (per `pull_request_target` semantics); the next real Dependabot PR triggers it.

---

## Task 3: Document the workflow and policy

**Files:**
- Modify: `docs/technology-stack-and-repository-requirements.md`
- Modify: `AGENTS.md`

**Interfaces:** Consumes the workflow from Task 2. Produces the docs that record the new CI file and the auto-merge/`needs-review` policy so future agents know the Dependabot queue is automated.

- [ ] **Step 1: Add the workflow to the CI listing**

In `docs/technology-stack-and-repository-requirements.md`, find the line beginning `15. .github/workflows/ci.yml (` and extend the workflow list with `.github/workflows/dependabot-automerge.yml`:

```text
15. `.github/workflows/ci.yml` (`quality`, `commitlint`, `e2e` jobs), `.github/workflows/release.yml`
    (release-please), `.github/workflows/release-assets.yml` (build + upload zip on
    `release: published`), `.github/workflows/dependabot-automerge.yml` (Dependabot PR triage:
    auto-merge minor/patch on green checks, `needs-review` for major/conflicts/audit failures),
    `.github/dependabot.yml` (npm weekly + github-actions weekly).
```

- [ ] **Step 2: Add the policy to AGENTS.md**

In `AGENTS.md`, under the `## Dependencies and permissions` section, add a bullet:

```text
- Dependabot PRs are triaged automatically by `.github/workflows/dependabot-automerge.yml`:
  minor/patch updates (npm and GitHub Actions) with green required checks and a clean
  `npm audit --audit-level=critical` are auto-merged; major bumps, merge conflicts, and audit
  failures are labeled `needs-review` and require a human decision. Human review still applies to
  every dependency update that reaches the `needs-review` state.
```

- [ ] **Step 3: Run the agent-side quality gate**

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test:unit -- --run
npm run test:coverage
npm run build
npm run test:manifest
npm run web-ext:lint
npm audit --audit-level=critical
```

Expected: all pass. `test:coverage` thresholds apply only to `src/**`, so the new test file (in `tests/`) adds no coverage pressure. No `test:e2e` locally.

- [ ] **Step 4: Commit**

```bash
git add docs/technology-stack-and-repository-requirements.md AGENTS.md
git commit -m "docs: document dependabot automation workflow and policy"
```

---

## Final verification

1. Push the branch and re-confirm `quality`, `commitlint`, `e2e` pass on the PR (`gh pr checks --watch`).
2. Merge the PR (with user approval).
3. Post-merge: `gh workflow list` shows `Dependabot Automation`; `gh label list` shows `needs-review`.
4. When the next real Dependabot PR arrives (or the user reopens one of #1-#9 after the #20 fix merges), verify a triage comment appears, the label is applied/removed correctly, and minor/patch PRs get auto-merged while major/conflict/audit-failing PRs stay open with `needs-review`.

## Human-gated steps

1. **PR approval/merge** of this change (per AGENTS.md).
2. **Reopening or waiting for a Dependabot PR** to observe the workflow end-to-end — the workflow only triggers for `dependabot[bot]` actors.
3. **Issue #20 merge** (separate worktree) before Dependabot PRs can go green and auto-merge.

