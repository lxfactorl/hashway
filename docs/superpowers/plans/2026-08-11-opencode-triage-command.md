# opencode `triage` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped opencode command `triage` that summarizes open GitHub issues, recommends the next one, lets the user pick, and starts a brainstorm session in the same chat using the selected issue as the proposal.

**Architecture:** A single markdown command file `.opencode/command/triage.md` (mirroring the existing `.opencode/command/shoot.md`) that instructs the agent step-by-step: load issues via `gh`, write summaries, recommend one, let the user select via the `question` tool, then load the `brainstorming` skill in the same chat. No new code, dependencies, or config changes.

**Tech Stack:** Markdown command file, `gh` CLI, opencode command conventions.

## Global Constraints

- Command file lives at `.opencode/command/triage.md` with frontmatter `description` and `agent: build`.
- Only external tool allowed: `gh` (already used by `shoot.md`). No new dependencies, no changes to `opencode.json`, no plugin/script code.
- Chat conversation with the user: **Russian**. Issue summaries, recommendation, and all content quoting issues: **English**. The command file itself: **English**.
- Do **not** write to issues (no comments, no status changes, no `gh` write calls).
- Use `gh issue list --state open --limit 50 --json number,title,labels,createdAt,body,url`.
- On any failure (no `gh`, no open issues, other error): tell the user and stop.

---

### Task 1: Create the `triage` command file

**Files:**
- Create: `.opencode/command/triage.md`

**Interfaces:**
- Consumes: existing `.opencode/command/shoot.md` as the pattern reference.
- Produces: `.opencode/command/triage.md` — a standalone command opencode auto-loads from `.opencode/command/`.

- [ ] **Step 1: Write the command file**

Create `.opencode/command/triage.md` with exactly this content:

```markdown
---
description: Summarize open GitHub issues, recommend the next one, and start a brainstorm on the chosen issue.
agent: build
---

You are helping the user triage the open GitHub issues of this repository.

## Steps

1. Load the open issues:

   `gh issue list --state open --limit 50 --json number,title,labels,createdAt,body,url`

   If `gh` is unavailable, the repo has no open issues, or anything else fails, tell the user and stop.

2. For each issue, write a short 1–2 line summary in English: essence, priority labels, age, and the suspected area of the codebase. Do not dump the full issue body.

3. Recommend the single "next" issue to work on, with a 1–2 line justification in English (label priority, recency, overlap between issues). Mark it clearly as `⭐ Recommendation`.

4. Ask the user to choose via the `question` tool, single selection:
   - One option: the recommended issue.
   - One option per remaining issue (by number and short title).
   - One option: "None / skip".

5. If the user selects an issue:
   - Load the `brainstorming` skill.
   - Start a brainstorm session in this same chat where the selected issue's title and body are the proposal. The goal is a design spec and an implementation plan.
   - Do NOT write to the issue: no comments, no status changes, no `gh` write calls.
   - If the user selects "None / skip", just end.

## Rules

- Chat with the user in Russian; issue summaries, recommendation, and any content quoting issues in English.
- Never fabricate issues or issue content that `gh` did not return.
- Never include secrets, tokens, or sensitive data in summaries.
- Do not create, modify, or close any issue.
```

- [ ] **Step 2: Verify the file parses as a command**

Run:

```bash
Get-ChildItem .opencode\command
```

Expected: output lists `shoot.md` and the new `triage.md`.

- [ ] **Step 3: Verify the frontmatter matches the `shoot.md` pattern**

Run:

```bash
Get-Content .opencode\command\triage.md -TotalCount 4
```

Expected: lines 1–3 are `---`, `description: ...`, `agent: build`, matching the frontmatter shape of `.opencode/command/shoot.md`.

- [ ] **Step 4: Commit**

```bash
git add .opencode/command/triage.md
git commit -m "chore: add opencode triage command for issue triage and brainstorm handoff"
```
