# Design: opencode `triage` command (project-scoped)

Date: 2026-08-11

Status: Approved

## Problem

The repo accumulates open GitHub issues. Picking which issue to work on next is manual and
undisciplined: the user must read every issue, weigh priorities, and then manually start a
brainstorm session for the chosen one.

## Goal

A project-scoped opencode command `triage` that:

1. Loads the open GitHub issues of the current repository (up to the first 50).
2. Shows a short summary for each.
3. Recommends the single next issue to work on, with a brief justification.
4. Lets the user pick one issue (or none) via the `question` tool.
5. If the user picks an issue, starts a brainstorming session in the same chat using that issue
   as the proposal. The issue itself is left untouched.

## Approach

A single markdown command file `.opencode/command/triage.md`, mirroring the existing
`.opencode/command/shoot.md`. No new dependencies, no new code, no changes to `opencode.json`.
The only external tool used is `gh` (already used by `shoot.md`).

This was chosen over two alternatives:

- **Script-backed command** (`scripts/triage.mjs`): deterministic JSON output, but more code and
  maintenance than the task warrants.
- **TypeScript plugin command**: most deterministic and testable, but overkill and breaks the
  repo's established command pattern.

## Command behavior

1. **Load issues** — run `gh issue list --state open --limit 50 --json number,title,labels,createdAt,body,url`.
2. **Summaries** — for each issue, write a 1–2 line summary: essence, priority labels, age,
   suspected area of the codebase. Summaries are in **English** (they quote English issue content).
3. **Recommendation** — pick one "next" issue and justify in 1–2 lines: label priority, recency,
   overlap between issues. Mark it clearly as `⭐ Recommendation`.
4. **Selection** — present the choices via the `question` tool: the recommended issue plus the
   other issues by number, single selection. Allow an explicit "none / skip" option.
5. **Transition** — if an issue is selected, load the `brainstorming` skill in the same chat and
   start a brainstorm session where the selected issue's title and body are the proposal. The goal
   is a design spec and implementation plan. Do **not** write to the issue (no comments, no status
   changes, no `gh` write calls).
6. **None selected** — just end.

## Error handling

Keep it simple: if `gh` is unavailable, the repo has no open issues, or anything else fails, tell
the user and stop. No explicit handling of pagination, the 50-issue limit, long bodies, or issue
overlap — the agent handles those naturally.

## Language rules

- Chat conversation with the user: **Russian**.
- Issue summaries, recommendation, and all content quoting issues: **English**.
- The command file itself and any comments: **English**.

## Non-goals

- No updates to issues (no comments, no status changes, no assignment).
- No configurable filters, multiple repos, or persisted state.
- No pagination beyond the first 50 issues.
- No plugin or script code.

## Files

- New: `.opencode/command/triage.md`
- No other file changes.
