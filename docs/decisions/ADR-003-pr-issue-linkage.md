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
