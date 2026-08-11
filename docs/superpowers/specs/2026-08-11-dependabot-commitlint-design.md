# Design: unblock Dependabot PRs from the commitlint check

Date: 2026-08-11

Status: Approved

## Problem

All 9 open Dependabot PRs (#1-#9) fail the required `commitlint` status check on `main`. The
`wagoid/commitlint-github-action` job lints PR commits and the PR title against the default
`@commitlint/config-conventional` fallback (the repo has no `commitlint.config.mjs`). Dependabot
commits contain auto-generated body lines longer than 100 characters (long GitHub URLs in release
notes and commit links), which violate the default `body-max-line-length` rule. Because
`commitlint` is a required status check in strict mode, those PRs cannot merge even when `quality`
and `e2e` pass.

## Goal

Dependabot-authored PRs must not be blocked by commitlint, so they can merge when the other
required checks are green. Human-authored PRs keep the full commitlint enforcement.

## Approach

Skip the commitlint step for PRs authored by `dependabot[bot]` by adding a conditional to the
commitlint step in `.github/workflows/ci.yml`:

```yaml
      - if: github.actor != 'dependabot[bot]'
        uses: wagoid/commitlint-github-action@b948419dd99f3fd78a6548d48f94e3df7f6bf3ed
```

Why this is safe for the required check: per GitHub's own troubleshooting docs, a job skipped by a
conditional reports "Success", and check statuses `success`, `skipped`, and `neutral` all satisfy
required status checks. Skipping only the step (not the whole workflow via path filtering) means the
`commitlint` check never stays in "Pending" / "Waiting for status", so branch protection does not
block the PR.

Alternatives considered and rejected:

- **Relax `body-max-line-length` globally** (new `commitlint.config.mjs`): weakens the rule for
  human PRs too and adds a config file, more than the problem warrants.
- **Combined approach** (skip + config): redundant.

## Change details

### `.github/workflows/ci.yml`

Job `commitlint` (lines 31-37): add the `if` condition shown above to the
`wagoid/commitlint-github-action` step. For human PRs the step runs exactly as today; for
`dependabot[bot]` PRs the step is skipped and the job still reports success.

### `docs/technology-stack-and-repository-requirements.md`

- Line ~224: document that commitlint skips PRs authored by `dependabot[bot]` (auto-generated long
  commit body lines) and keeps enforcement for human PRs.
- Update the commitlint mentions (~lines 341/343/416) if they imply unconditional execution.

### `AGENTS.md`

- Line 72: note the Dependabot exception next to the Conventional Commits statement.

## Verification

- `npm run format:check` — prettier formats `.github/workflows/ci.yml`.
- `npm run lint` — keeps edited files clean (AGENTS.md is not in `.prettierignore`).
- Local YAML / GitHub-actions expression syntax check (no new dependencies).
- Real-world validation in GitHub Actions after pushing: open a Dependabot-affected scenario or
  rerun the workflow on an existing Dependabot PR and confirm the `commitlint` job succeeds.

## Non-goals

- No commitlint config file is introduced.
- No change to `body-max-line-length` for human PRs.
- No change to `quality`, `e2e`, or the release workflow.
- No new dependencies or permissions.

## Files

- Modified: `.github/workflows/ci.yml`
- Modified: `docs/technology-stack-and-repository-requirements.md`
- Modified: `AGENTS.md`
