# 2026-08-11 ADR Policy: triggers, template, and lifecycle — design

## Problem

There is no authoritative policy stating when an ADR must be created, what format it
must follow, or how its status evolves. Agents decide ad-hoc whether to suggest an ADR,
which causes inconsistent proposals across sessions. The only written definition is a
single line in `docs/technology-stack-and-repository-requirements.md:320`; `AGENTS.md`
references ADRs but defines no criteria, format, or lifecycle. The issue proposing this
work is `lxfactorl/hashway#22`.

## Goal

A single authoritative policy that defines:

- triggers for creating an ADR,
- defaults (when an ADR is not needed),
- the proposal/approval process,
- the status lifecycle with cross-references,
- a canonical template based on the ADR-001 structure.

## Out of scope

- Editing existing ADRs ADR-001..004 (they already match the format).
- Enforcing the policy in CI (documentation policy only).
- A `Proposed`/`Draft` file status (proposals happen in discussion, not as files).

## Decisions

### 1. Document identity

The policy lives in an unnumbered meta-document `docs/decisions/ADR-POLICY.md`. It
governs ADRs but is not itself a numbered ADR; numbers ADR-00X are reserved for actual
architecture decisions. The policy file carries its own header (`Status: Accepted`,
`Date`, `Deciders`) for consistency with the ADR files.

### 2. Policy content

Structure of `ADR-POLICY.md`:

1. **Header** — `Status: Accepted`, `Date`, `Deciders`.
2. **Purpose** — single source of truth; eliminates ad-hoc agent decisions.
3. **Triggers** — an ADR is required for:
   - deviations from the approved baseline spec
     (`docs/technology-stack-and-repository-requirements.md`) or from policies in
     `AGENTS.md`;
   - architectural decisions: new runtime dependency, layers/boundaries changes,
     storage schema, event schema, retry strategy, E2E topology, token/threat-model
     changes;
   - a material change to a previously accepted decision (see lifecycle).
4. **Defaults** — an ADR is NOT required for: bugfixes, refactors without boundary
   changes, UI/text changes, test coverage, routine dependency updates inside approved
   policies (audit gate, TypeScript hold, dependabot automation). When in doubt,
   propose an ADR and let the owner decide.
5. **Process**:
   - the agent proposes the ADR text in discussion **before** implementation;
   - the file is created only after explicit owner approval;
   - the file is committed together with the implementing change (same PR) **or** as a
     standalone PR, depending on the situation;
   - the number is the next free one (ADR-005 and beyond), assigned at file creation.
6. **Lifecycle** — statuses:
   - `Accepted` — current decision; every new ADR is created in this status;
   - `Superseded` — replaced by another ADR; header gains `Superseded by: ADR-00X`;
   - `Deprecated` — obsolete/withdrawn without replacement.
   When one ADR supersedes another, both files are updated in the same PR: the new ADR
   gains `Supersedes: ADR-00Y`, the replaced one gains `Superseded by: ADR-00X`.
7. **Template reference** — link to `templates/ADR-template.md`.
8. **Consequences** — consistency, traceability, prevention of ad-hoc decisions.

### 3. Template

`docs/decisions/templates/ADR-template.md` is the canonical template following the
ADR-001 structure with instruction comments (`<!-- ... -->`) per field:

- Title `# ADR-NNN: <short decision name>`.
- Header block: `**Status:** Accepted`, `**Date:** <YYYY-MM-DD>`,
  `**Deciders:** lxfactorl (owner), AI agent (executor)`, optional
  `**Supersedes:** ADR-00Y` / `**Superseded by:** ADR-00X`.
- Sections `## Context` (problem, constraints, considered options), `## Decision`
  (what was decided, numbered sub-decisions, explicit note when it deviates from the
  baseline), `## Consequences` (changes, pros, cons, risks, obligations, out of scope).

### 4. Integration into existing docs

- `AGENTS.md`: new `## ADR policy` section summarizing triggers, defaults, process,
  statuses, numbering, and linking to `ADR-POLICY.md` and the template.
- `docs/technology-stack-and-repository-requirements.md:320`: the line about
  `docs/decisions/ADR-*.md (beyond ADR-001)` is replaced with a line that points to the
  ADR policy as the authoritative rule.

## Files

| Action | File |
| --- | --- |
| Create | `docs/decisions/ADR-POLICY.md` |
| Create | `docs/decisions/templates/ADR-template.md` |
| Edit | `AGENTS.md` (add `## ADR policy` section) |
| Edit | `docs/technology-stack-and-repository-requirements.md` (line ~320) |

## Verification

- All four files exist; the two existing-doc edits are minimal and contain links to
  `ADR-POLICY.md`.
- `npm run format:check` passes (prettier covers `.md`).
- Content consistency: the AGENTS.md summary does not contradict the policy; the
  requirements doc points to the policy without duplicating rules.
