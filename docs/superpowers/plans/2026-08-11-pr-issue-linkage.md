# PR↔Issue Linkage Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce that every human-authored PR references a GitHub issue via a closing keyword in
its body, add `pr-link` to the required checks on `main`, and record the decision in ADR-003.

**Architecture:** A new `pr-link` job in `.github/workflows/ci.yml` reads
`github.event.pull_request.body` and fails unless the body contains a closing keyword + issue
number (e.g. `Closes #23`); Dependabot PRs skip the check at the step level. GitHub's native
auto-close closes the referenced issue on merge, so the check only has to *require* the reference.
A PR template guides authors, and ADR-003 + docs record the policy.

**Tech Stack:** GitHub Actions (YAML), POSIX grep (`grep -Eiqz`), bash, vitest (contract test),
Markdown (template + ADR + docs).

## Global Constraints

- Commit messages must follow Conventional Commits (commitlint enforced in CI); keep commit body
  lines ≤ 100 chars.
- Run every local gate before the PR: `npm run format:check`, `npm run typecheck`,
  `npm run lint`, `npm run test:unit -- --run`, `npm run test:coverage`, `npm run build`,
  `npm run test:manifest`, `npm run web-ext:lint`, `npm audit --audit-level=critical`.
- Do **not** run `npm run test:e2e` locally (CI-only on `windows-latest`).
- No arbitrary new dependencies. No changes to `package.json` / `package-lock.json`.
- Existing required checks on `main`: `quality`, `commitlint`, `e2e` (strict, `enforce_admins:
  false`, 1 approving review). This work adds `pr-link` as a 4th required check.
- `.prettierignore` excludes `docs/superpowers/` and
  `docs/technology-stack-and-repository-requirements.md`; all other touched files must satisfy
  `npm run format:check`.
- Do not start implementation on `main`. Start from a new feature branch (e.g.
  `feat/pr-issue-linkage`).
- The implementing PR's own body must contain `Closes #23` so the new `pr-link` check passes on
  itself.
- Branch protection update is a repo-settings change and requires explicit owner approval before
  execution (AGENTS.md).
- Chat with the user in Russian; all files and commit messages in English.

---

### Task 1: `pr-link` CI check (contract test + workflow job)

**Files:**
- Create: `tests/unit/ci-pr-link-contract.test.ts`
- Modify: `.github/workflows/ci.yml` (insert the `pr-link` job after the `commitlint` job, i.e.
  between the `wagoid/commitlint-github-action` step and the `e2e:` job)

**Interfaces:**
- Consumes: nothing (reads `.github/workflows/ci.yml` from disk).
- Produces: a `pr-link` job that is the 4th required status check on `main`; later tasks
  (Task 2 template, Task 4 docs) reference the job and the closing-keyword policy it enforces.

- [ ] **Step 1: Write the failing contract test**

Create `tests/unit/ci-pr-link-contract.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- --run tests/unit/ci-pr-link-contract.test.ts`

Expected: FAIL — `.github/workflows/ci.yml` has no `pr-link` job ("defines a pr-link job" and the
following tests fail).

- [ ] **Step 3: Add the `pr-link` job to `.github/workflows/ci.yml`**

Insert after the `commitlint` job (after its `wagoid/commitlint-github-action` step) and before
`e2e:`:

```yaml
  pr-link:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - name: Check PR references an issue
        if: github.actor != 'dependabot[bot]'
        env:
          PR_BODY: ${{ github.event.pull_request.body }}
        run: |
          if ! printf '%s' "$PR_BODY" | grep -Eiqz '(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)[[:space:]]+(issue[[:space:]]*)?#[0-9]+'; then
            echo "::error::PR body must reference a GitHub issue with a closing keyword (e.g. 'Closes #23')."
            exit 1
          fi
```

Notes on the design:
- The job-level `if: github.event_name == 'pull_request'` keeps the job from running on `push` to
  `main` (no PR body there).
- The step-level `if: github.actor != 'dependabot[bot]'` exempts Dependabot PRs while the job still
  completes successfully, so branch protection does not block them.
- `grep -Eiqz`: `-E` extended regex, `-i` case-insensitive, `-q` quiet, `-z` treats the whole body
  as one record so `[[:space:]]` can match across newlines (`Closes\n#23`).
- The regex accepts `Closes #23`, `Fixes issue #456`, `RESOLVE #789` (case-insensitive) and
  requires a closing keyword before `#<digits>`.
- The PR body is passed via the `PR_BODY` env var, not interpolated into the shell command, to avoid
  shell-injection from untrusted PR content (AGENTS.md: untrusted input is data).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- --run tests/unit/ci-pr-link-contract.test.ts`

Expected: PASS (all 12 tests).

- [ ] **Step 5: Format and run the local gate**

Run:
```bash
npx prettier --write .github/workflows/ci.yml tests/unit/ci-pr-link-contract.test.ts
npm run format:check
npm run typecheck
npm run lint
npm run test:unit -- --run
npm run build
npm run test:manifest
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/ci-pr-link-contract.test.ts .github/workflows/ci.yml
git commit -m "ci: enforce PR references a GitHub issue via closing keyword"
```

---

### Task 2: PR template

**Files:**
- Create: `.github/pull_request_template.md`

**Interfaces:**
- Consumes: the closing-keyword policy enforced by `pr-link` (Task 1).
- Produces: the template every PR author sees; guides authors to bodies that pass `pr-link`.

- [ ] **Step 1: Create `.github/pull_request_template.md`**

```markdown
## Description

<!-- What does this PR do? Why? -->

## Related issue

<!--
REQUIRED: replace `N` below with the issue number this PR closes. The `pr-link`
CI check fails unless a closing keyword + issue number appears in the PR body.
Examples: Closes #123, Fixes #456, Resolves issue #789. GitHub auto-closes the
referenced issue on merge.
-->

Closes #N

## Checklist

- [ ] Tests and docs updated for this change
- [ ] Local gates pass: `npm run format:check`, `typecheck`, `lint`,
      `test:unit`, `test:coverage`, `build`, `test:manifest`, `web-ext:lint`,
      `npm audit --audit-level=critical`
```

- [ ] **Step 2: Format and verify**

Run:
```bash
npx prettier --write .github/pull_request_template.md
npm run format:check
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add .github/pull_request_template.md
git commit -m "ci: add pull request template with closing keyword guidance"
```

---

### Task 3: ADR-003

**Files:**
- Create: `docs/decisions/ADR-003-pr-issue-linkage.md`

**Interfaces:**
- Consumes: the decisions made in Tasks 1–2 (closing-keyword requirement, `pr-link` check,
  Dependabot exemption, native auto-close).
- Produces: the authoritative record that `docs/technology-stack-and-repository-requirements.md`
  (Task 4) and `AGENTS.md` (Task 4) link to.

- [ ] **Step 1: Create `docs/decisions/ADR-003-pr-issue-linkage.md`**

```markdown
# ADR-003: Enforce PR↔issue linkage in CI

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** lxfactorl (owner), AI agent (executor)

## Context

Every PR in `lxfactorl/hashway` must be connected to a GitHub issue, the merge must close that
issue, and PRs that do not target an issue must be rejected. The existing CI
(`.github/workflows/ci.yml`) enforces only Conventional Commits (`commitlint`) and the
quality/E2E gates; nothing validates issue linkage, and there is no PR template. As a result a PR
can merge without referencing any issue, and merged PRs do not automatically close the linked
issue.

## Decision

1. **Require a closing keyword in the PR body.** Every human-authored PR must reference a GitHub
   issue via a closing keyword + issue number in the PR body: `Closes #N`, `Fixes #N`,
   `Resolves #N`, or the full `Closes issue #N` spelling (case-insensitive). The PR title alone is
   not sufficient.
2. **`pr-link` CI check.** A new `pr-link` job in `ci.yml` (ubuntu-latest) reads
   `github.event.pull_request.body` and fails unless the body contains a closing keyword + issue
   number. It runs only on `pull_request` events. `pr-link` is added to the required status checks
   on `main` (alongside `quality`, `commitlint`, `e2e`), so a PR that does not reference an issue
   cannot merge.
3. **Dependabot exemption.** PRs authored by `dependabot[bot]` skip the check at the step level,
   so the job still reports success and branch protection does not block them. Dependabot PRs do
   not reference issues, and their merge flow is automated (see issues #19/#20).
4. **Reliance on GitHub native auto-close.** GitHub automatically closes the referenced issue when
   a PR whose body contains a closing keyword merges (any merge method). The check only requires
   the reference; closing is delegated to GitHub.
5. **PR template.** `.github/pull_request_template.md` prompts authors to state the addressed
   issue and use a closing keyword, so well-formed PRs pass the check by construction.

## Consequences

- Every human PR carries a traceable issue reference; PR↔issue traceability is enforced by CI and
  branch protection rather than convention.
- Merged PRs close their linked issues automatically via GitHub's native behavior.
- Dependabot PRs remain mergeable without an issue reference.
- PRs without a closing keyword fail `pr-link` and are blocked from merging until the body is
  fixed (no code change required).
- Future workflow edits must keep the `pr-link` job present and the closing-keyword regex intact;
  `tests/unit/ci-pr-link-contract.test.ts` guards this contract.
```

- [ ] **Step 2: Format and verify**

Run:
```bash
npx prettier --write docs/decisions/ADR-003-pr-issue-linkage.md
npm run format:check
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/ADR-003-pr-issue-linkage.md
git commit -m "docs: add ADR-003 for PR-issue linkage enforcement"
```

---

### Task 4: Requirements doc + AGENTS.md

**Files:**
- Modify: `docs/technology-stack-and-repository-requirements.md:343` (required check list)
- Modify: `docs/technology-stack-and-repository-requirements.md:416` (end-to-end flow step 4)
- Modify: `docs/technology-stack-and-repository-requirements.md:445` (step 15, ci.yml jobs)
- Modify: `docs/technology-stack-and-repository-requirements.md:448` (branch protection step 18)
- Modify: `AGENTS.md:69-73` (Git and remote operations section)

**Interfaces:**
- Consumes: the `pr-link` check (Task 1) and ADR-003 (Task 3).
- Produces: the authoritative baseline-spec documentation of the new required check and policy.

- [ ] **Step 1: Update the required check list (line 343)**

Change:

```text
The CI workflow defines three required status checks that branch protection enforces: `quality`,
`commitlint`, and `e2e`. Each must pass before a PR can merge.
```

To:

```text
The CI workflow defines four required status checks that branch protection enforces: `quality`,
`commitlint`, `pr-link`, and `e2e`. Each must pass before a PR can merge.

Every human-authored PR must reference a GitHub issue in its body via a closing keyword
(`Closes #N`, `Fixes #N`, `Resolves #N`, or the `... issue #N` spelling) so GitHub auto-closes the
issue on merge. The `pr-link` check (ubuntu-latest, runs only on `pull_request`) enforces this;
Dependabot PRs are exempt. See `docs/decisions/ADR-003-pr-issue-linkage.md`.
```

- [ ] **Step 2: Update the end-to-end flow (line 416)**

Change:

```text
4. `commitlint` (`ci.yml` separate job) validates the PR commits and PR title against Conventional Commits.
```

To:

```text
4. `commitlint` (`ci.yml` separate job) validates the PR commits and PR title against Conventional Commits. `pr-link` (`ci.yml` separate job) requires the PR body to reference a GitHub issue via a closing keyword (Dependabot PRs exempt).
```

- [ ] **Step 3: Update the setup-phase file list (line 445)**

Change `(quality`, `commitlint`, `e2e` jobs)` to `(quality`, `commitlint`, `pr-link`, `e2e` jobs)`
in step 15's `ci.yml` description.

- [ ] **Step 4: Update the branch protection step (line 448)**

Change:

```text
18. Branch protection on `main`: required reviews = 1, required status checks = `quality`, `commitlint`, `e2e`, `enforce_admins: false`.
```

To:

```text
18. Branch protection on `main`: required reviews = 1, required status checks = `quality`, `commitlint`, `pr-link`, `e2e`, `enforce_admins: false`.
```

- [ ] **Step 5: Update `AGENTS.md` (Git and remote operations section)**

Add a new bullet after the Conventional Commits bullet (line 72):

```markdown
- Every PR must reference a GitHub issue via a closing keyword in its body (`Closes #N`,
  `Fixes #N`, `Resolves #N`); enforced by the `pr-link` CI check. Dependabot PRs are exempt.
```

- [ ] **Step 6: Format and verify**

Run:
```bash
npx prettier --write AGENTS.md
npm run format:check
npm run typecheck
npm run lint
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add docs/technology-stack-and-repository-requirements.md AGENTS.md
git commit -m "docs: record PR-issue linkage as a required check"
```

---

### Task 5: Full verification gate

**Files:** none (verification only).

**Interfaces:** Consumes all of Tasks 1–4.

- [ ] **Step 1: Run the full mandatory gate**

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

Expected: all green. If any fix is needed, make it, re-run, then commit with a Conventional Commit
message (`fix:`, `test:`, `ci:`, `docs:` as appropriate).

- [ ] **Step 2: Confirm the diff contains only intended changes**

Run: `git status --short` and `git log --oneline -6`

Expected: only the 4 feature commits plus any fix commits, touching only:
`.github/workflows/ci.yml`, `.github/pull_request_template.md`,
`tests/unit/ci-pr-link-contract.test.ts`, `docs/decisions/ADR-003-pr-issue-linkage.md`,
`docs/technology-stack-and-repository-requirements.md`, `AGENTS.md`.

---

### Task 6: Update branch protection (requires explicit owner approval)

**Files:** none — repo-settings change via `gh api`.

**Interfaces:** Consumes the `pr-link` job (Task 1). Adds `pr-link` to the required status checks
on `main`.

> **Gate:** Do **not** execute this task until (a) the owner explicitly approves, and (b) the
> Task 1 workflow has been merged to `main` and a PR has shown a green `pr-link` check (otherwise
> branch protection would report `pr-link` as "Expected — Waiting for status" on existing PRs).

- [ ] **Step 1: Read current protection**

```bash
gh api repos/lxfactorl/hashway/branches/main/protection
```

- [ ] **Step 2: PUT protection with `pr-link` added, preserving every other setting**

```powershell
$current = gh api repos/lxfactorl/hashway/branches/main/protection | ConvertFrom-Json
$current.required_status_checks.strict = $true
$contexts = @($current.required_status_checks.contexts | Where-Object { $_ -ne 'pr-link' })
$current.required_status_checks.contexts = $contexts + 'pr-link'
$current | ConvertTo-Json -Depth 10 | Set-Content -Path "$env:TEMP\branch-protection.json" -Encoding utf8
gh api -X PUT repos/lxfactorl/hashway/branches/main/protection --input "$env:TEMP\branch-protection.json"
Remove-Item -Path "$env:TEMP\branch-protection.json" -Force
```

- [ ] **Step 3: Verify**

```bash
gh api repos/lxfactorl/hashway/branches/main/protection --jq .required_status_checks.contexts
```

Expected: `["quality", "commitlint", "pr-link", "e2e"]` (order may vary; must contain `pr-link`).

- [ ] **Step 4: Close issue #23**

After the feature PR is merged and branch protection is updated, close issue #23 with a comment
summarizing what shipped (the feature PR body already contains `Closes #23`, so it closes
automatically on merge).
