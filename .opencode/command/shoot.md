---
description: Summarize issues found during the current session and create GitHub issues after approval.
agent: build
---

You are helping the user file GitHub issue(s) for problems discovered in the current conversation while working on this codebase.

## Steps

1. Review the conversation history and identify the issue(s) the user found while working.
2. For each issue, produce:
   - **title**: concise and descriptive, at most 72 characters.
   - **body**: following the template below.
   - **label**: classify in priority order — `security` > `permissions` > `ci` > `adr` > `bug` / `enhancement`.
   - **severity**: `blocker` | `high` | `medium` | `low`, with a one-line justification.
3. Present the proposed issue(s) to the user with the `question` tool. If there are multiple, allow multi-select so the user can choose which to create and which to edit.
4. After approval, create each issue in the current repository (origin remote, `gh` uses the repo from cwd):
   `gh issue create --title "<title>" --body "<body>" --label "<label>"`
5. Reply with the created issue URL(s).

## Body template

## Context
{what was being worked on and where the problem was found — file:line references}

## Problem
{1-2 sentences describing the problem}

## Expected behavior
{what should happen instead}

## Steps to reproduce
{include if applicable, otherwise omit}

## Severity
{blocker/high/medium/low} — {one-line justification}

## Suggested fix
{include if you have an idea, otherwise omit}

## Related
{relevant PRs, commits, or files}

## Rules

- Do not fabricate facts. Only file issues grounded in the conversation and codebase.
- Never include secrets, tokens, authorization headers, or sensitive query parameters in any issue.
- Keep the body in English.
- Do not create any issue without explicit user approval.
