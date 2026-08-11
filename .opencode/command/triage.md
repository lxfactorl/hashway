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
