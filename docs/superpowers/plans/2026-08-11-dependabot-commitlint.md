# Unblock Dependabot PRs from commitlint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the required `commitlint` status check pass for PRs authored by `dependabot[bot]` so Dependabot PRs can merge when the other required checks are green, without weakening commitlint for human PRs.

**Architecture:** Add a step-level `if: github.actor != 'dependabot[bot]'` condition to the `wagoid/commitlint-github-action` step in the `commitlint` job of `.github/workflows/ci.yml`. For Dependabot PRs the step is skipped and the job reports success (per GitHub docs, a job/step skipped by a conditional reports "Success", and `success`/`skipped`/`neutral` all satisfy required status checks), so branch protection does not block the merge. Human PRs run commitlint exactly as today. Documentation (tech-stack doc + AGENTS.md) records the exception.

**Tech Stack:** GitHub Actions (YAML), `wagoid/commitlint-github-action` (Docker action, SHA-pinned), commitlint `@commitlint/config-conventional` (default fallback config, no config file in repo), prettier (format gate), js-yaml (transitive dep in `node_modules`, used only for local YAML syntax validation).

## Global Constraints

- Commit messages must follow Conventional Commits (enforced in CI by commitlint).
- Do not change the SHA-pinned versions of any GitHub Actions used in `ci.yml`.
- The repo has **no** commitlint config file; `wagoid/commitlint-github-action` falls back to `@commitlint/config-conventional` (default `body-max-line-length: 100`). Do not introduce a commitlint config.
- `docs/technology-stack-and-repository-requirements.md` is in `.prettierignore`; `.github/workflows/ci.yml` and `AGENTS.md` are formatted by prettier and must stay prettier-clean.
- Mandatory pre-PR gate (AGENTS.md): `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm run test:unit -- --run`, `npm run test:coverage`, `npm run build`, `npm run test:manifest`, `npm run web-ext:lint`, `npm audit --audit-level=critical`.
- Do not push, merge, or dispatch workflows without explicit approval.
- Work happens on the `fix/dependabot-commitlint-skip` branch (already created).
- The `if` expression must be exactly `github.actor != 'dependabot[bot]'` — the single quotes are required so the GitHub expression parser treats `dependabot[bot]` as a literal string.

---

### Task 1: Skip commitlint for Dependabot-authored PRs

**Files:**
- Modify: `.github/workflows/ci.yml:31-37` (the `commitlint` job)

**Interfaces:**
- Consumes: none.
- Produces: the `commitlint` job reports success for PRs whose `github.actor` is `dependabot[bot]`, and behaves exactly as today for all other PRs.

- [ ] **Step 1: Add the conditional to the commitlint step**

Edit `.github/workflows/ci.yml` so the `commitlint` job becomes:

```yaml
  commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          fetch-depth: 0
      - if: github.actor != 'dependabot[bot]'
        uses: wagoid/commitlint-github-action@b948419dd99f3fd78a6548d48f94e3df7f6bf3ed
```

Only the `- if: github.actor != 'dependabot[bot]'` line is added (before the `uses:` key of the
`wagoid/commitlint-github-action` step). Nothing else in the file changes.

- [ ] **Step 2: Validate YAML syntax**

Run:

```powershell
node -e "const fs=require('fs');const yaml=require('js-yaml');yaml.load(fs.readFileSync('.github/workflows/ci.yml','utf8'));console.log('YAML OK')"
```

Expected: prints `YAML OK`. If `require('js-yaml')` fails, use `node -e "const yaml=require('js-yaml');..."` with the absolute path `C:\Projects\hashway\node_modules\js-yaml`.

- [ ] **Step 3: Verify prettier formatting**

Run: `npx prettier --check .github/workflows/ci.yml`
Expected: exits 0 with `(check passed)` for the file.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: skip commitlint for dependabot PRs"
```

---

### Task 2: Document the Dependabot exception

**Files:**
- Modify: `docs/technology-stack-and-repository-requirements.md:224`
- Modify: `AGENTS.md:72`

**Interfaces:**
- Consumes: Task 1 (the ci.yml behavior change being documented).
- Produces: nothing consumed by later tasks; just accurate docs.

- [ ] **Step 1: Update the tech-stack doc**

In `docs/technology-stack-and-repository-requirements.md`, extend the Conventional Commits
enforcement bullet (line 224) by appending:

> PRs authored by `dependabot[bot]` are exempt from the commitlint check: Dependabot's
> auto-generated commit bodies contain long URLs that violate the default `body-max-line-length`
> rule, and its commits already follow Conventional Commits. Human-authored PRs keep full
> enforcement.

Resulting line 224 (after the existing text):

```text
- Require commit messages to follow the Conventional Commits specification. Enforcement is CI-only via the `wagoid/commitlint-github-action` job (no local husky or pre-commit hooks). The job validates both the PR commits and the PR title, since the PR title becomes the squashed commit message. PRs authored by `dependabot[bot]` are exempt from the commitlint check: Dependabot's auto-generated commit bodies contain long URLs that violate the default `body-max-line-length` rule, and its commits already follow Conventional Commits. Human-authored PRs keep full enforcement.
```

Keep this file within the 100-column print width used elsewhere in the repo (reflow if needed);
it is prettier-ignored, so `format:check` will not enforce it.

- [ ] **Step 2: Update AGENTS.md**

In `AGENTS.md`, change line 72 from:

```text
- Commit messages must follow Conventional Commits (enforced in CI by commitlint).
```

to:

```text
- Commit messages must follow Conventional Commits (enforced in CI by commitlint; `dependabot[bot]` PRs are exempt because Dependabot's auto-generated commit bodies exceed the default `body-max-line-length` rule).
```

- [ ] **Step 3: Verify prettier formatting**

Run: `npx prettier --check AGENTS.md`
Expected: exits 0 with `(check passed)` for `AGENTS.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/technology-stack-and-repository-requirements.md AGENTS.md
git commit -m "docs: document commitlint dependabot exception"
```

---

### Task 3: Run the mandatory pre-PR gate

**Files:**
- No file changes expected; run the gate to confirm nothing regressed.

**Interfaces:**
- Consumes: Tasks 1-2 (the working tree state to validate).

- [ ] **Step 1: Run the full gate**

Run each command from the repo root and confirm every one exits 0:

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

Expected: all exit 0. `npm audit --audit-level=critical` is expected to report the known
unfixable high-severity `image-size` advisory (via `web-ext` → `addons-linter`) — that is allowed;
the gate blocks criticals only.

- [ ] **Step 2: Confirm the final diff**

Run: `git log --oneline -3` and `git status`
Expected: two commits on `fix/dependabot-commitlint-skip` (from Tasks 1-2), working tree clean.

- [ ] **Step 3: Report readiness**

State that the change is complete, the gate is green, and the real-world validation step
(pushing the branch and confirming a Dependabot-triggered `commitlint` run reports success, or
re-running the workflow on an existing Dependabot PR) requires user approval per AGENTS.md.
