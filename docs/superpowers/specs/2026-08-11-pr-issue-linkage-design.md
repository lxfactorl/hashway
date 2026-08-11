# Design: PR↔issue linkage enforcement (issue #23)

Date: 2026-08-11

Status: Approved

## Problem

A pull request in `lxfactorl/hashway` can merge without referencing any GitHub issue, and merged
PRs do not automatically close the linked issue. There is no CI check for issue linkage and no PR
template, so PR↔issue traceability is unenforced.

## Goal

- Every human-authored PR must reference a GitHub issue via a closing keyword (`Closes #N`,
  `Fixes #N`, `Resolves #N`, or the full `Closes issue #N` spelling) in the PR body.
- A PR that does not reference an issue is blocked from merging.
- Merging a linked PR closes the referenced issue via GitHub's native auto-close behavior.
- Dependabot PRs are exempt (they do not reference issues, and issues #19/#20 automate their
  merge flow).
- An ADR (ADR-003) records the decision; the requirements doc and AGENTS.md are updated.

## Approach

A self-contained `pr-link` job added to `.github/workflows/ci.yml`, plus a
`.github/pull_request_template.md`, plus a branch-protection update on `main`.

This was chosen over two alternatives:

- **Third-party marketplace action** for PR linting: adds an external dependency that must be
  SHA-pinned and reviewed, contradicting the repo's "no arbitrary new dependencies" rule.
- **Extending the `commitlint` job** to also lint the PR body: commitlint is for commit messages,
  not PR bodies, and the job already has an open blocker (issue #20, `body-max-line-length`).

## CI check (`pr-link` job)

- **Trigger:** runs only on `pull_request` events (a `push` to `main` has no PR body).
- **Skip:** `if: github.actor != 'dependabot[bot]'` — Dependabot PRs are exempt.
- **Check:** read `github.event.pull_request.body` and search case-insensitively for a closing
  keyword + issue reference:
  - `(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#\d+`
  - or `(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+issue\s*#\d+`
- **Fail:** `exit 1` with a clear message telling the author to add `Closes #N` (or another
  closing keyword) to the PR body.
- **OS:** `ubuntu-latest` (text inspection only; no Windows needed), mirroring the `commitlint` job.

**Why a closing keyword:** GitHub natively auto-closes the referenced issue when a PR whose body
contains a closing keyword is merged (any merge method). The check only needs to *require* the
reference; GitHub handles the closing.

## Branch protection

Add `pr-link` to the required status checks on `main` (currently `quality`, `commitlint`, `e2e`;
strict mode, `enforce_admins: false`, 1 approving review). This is a one-time repo-settings change
applied via `gh api` after the workflow lands and is green, executed only with explicit owner
approval (per AGENTS.md).

## PR template

New `.github/pull_request_template.md` prompting every PR author to:

- State which issue the PR addresses.
- Use the closing keyword pattern `Closes #N` / `Fixes #N` / `Resolves #N` in the body.
- Include a short description and a test checklist.

The template guides authors to write bodies that pass the `pr-link` check automatically.

## Documentation and ADR

- **`docs/technology-stack-and-repository-requirements.md`**:
  - Update the required-check lists (line 343 and the branch-protection section) from three
    (`quality`, `commitlint`, `e2e`) to four (`quality`, `commitlint`, `pr-link`, `e2e`).
  - Add a short PR↔issue linkage policy paragraph: every human PR must reference an issue via a
    closing keyword; Dependabot PRs are exempt; GitHub auto-closes on merge.
- **`AGENTS.md`**: add a line to the "Git and remote operations" section stating PRs must
  reference an issue via a closing keyword (enforced by the `pr-link` check).
- **ADR-003** `docs/decisions/ADR-003-pr-issue-linkage.md` following the ADR-001 format
  (Status/Date/Deciders header + Context/Decision/Consequences), recording the decision, the
  Dependabot exemption, the `pr-link` check + branch protection, and reliance on GitHub's native
  auto-close. ADR-002 stays reserved for AMO CI signing.

## Non-goals

- No live provider tests or new runtime dependencies.
- No change to the Dependabot PR flow itself (issues #19/#20 handle that).
- No verification that the referenced issue exists or is open (the check only enforces the
  reference; verifying existence would require an extra API call and is out of scope).

## Files

- New: `.github/pull_request_template.md`
- New: `docs/decisions/ADR-003-pr-issue-linkage.md`
- Edit: `.github/workflows/ci.yml` (add `pr-link` job)
- Edit: `docs/technology-stack-and-repository-requirements.md` (check lists + policy paragraph)
- Edit: `AGENTS.md` (PR↔issue linkage line)
- Repo settings (not a file): add `pr-link` to `main` branch protection required checks
