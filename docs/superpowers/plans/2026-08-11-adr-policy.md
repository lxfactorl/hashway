# ADR Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a single authoritative ADR policy (triggers, defaults, process, lifecycle) plus a canonical template, and link it from `AGENTS.md` and the requirements doc.

**Architecture:** Pure documentation change. Creates `docs/decisions/ADR-POLICY.md` (unnumbered meta-doc) and `docs/decisions/templates/ADR-template.md` (fill-in template with instruction comments), then adds a concise `## ADR policy` section to `AGENTS.md` and replaces the ADR line in `docs/technology-stack-and-repository-requirements.md` with a pointer to the policy.

**Tech Stack:** Markdown. Prettier formats `.md` files under `docs/decisions/` (verified: `docs/superpowers/` and the requirements doc are prettier-ignored; `docs/decisions/` is NOT ignored, so created files must pass `npm run format:check`).

## Global Constraints

- Statuses: `Accepted` / `Superseded` / `Deprecated`, with cross-references `Supersedes: ADR-00Y` / `Superseded by: ADR-00X`.
- New ADRs are created as `Accepted`; numbering is sequential, next free number (ADR-005 and beyond).
- The agent proposes an ADR in discussion before implementation; the file is created only after explicit owner approval. The ADR is committed with the implementing change or as a standalone PR.
- ADR not required for: bugfixes, refactors without boundary changes, UI/text changes, test coverage, routine dependency updates inside approved policies.
- Trigger examples: deviation from the approved baseline spec; new runtime dependency; layers/boundaries; storage schema; event schema; retry strategy; E2E topology; token/threat-model changes; material change to a previously accepted decision.
- Existing ADRs ADR-001..004 are NOT modified.
- The policy doc is unnumbered (`ADR-POLICY.md`), carries its own header (`Status: Accepted`, `Date`, `Deciders`).
- Requirements doc line 320 (`docs/decisions/ADR-*.md (beyond ADR-001): major choices...`) is replaced with a pointer to `ADR-POLICY.md`; the requirements doc is prettier-ignored.
- `AGENTS.md` gets a concise `## ADR policy` section (no full duplication of the policy).

---

### Task 1: Create `docs/decisions/ADR-POLICY.md`

**Files:**
- Create: `docs/decisions/ADR-POLICY.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/decisions/ADR-POLICY.md` — the authoritative policy that Tasks 3 and 4 link to; the template reference target is `templates/ADR-template.md` (Task 2).

- [ ] **Step 1: Create the policy file**

Create `docs/decisions/ADR-POLICY.md` with this exact content:

```markdown
# ADR Policy: triggers, template, and lifecycle

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** lxfactorl (owner), AI agent (executor)

## Purpose

This document is the single authoritative policy for Architecture Decision Records (ADRs) in
this repository. It defines when an ADR must be created, what format it must follow, how it is
approved, and how its status evolves. It exists so agents and contributors do not decide
ad-hoc whether a decision deserves an ADR.

## When an ADR is required (triggers)

Create an ADR for:

- **Deviation from the approved baseline.** Any change that contradicts
  `docs/technology-stack-and-repository-requirements.md` or a policy stated in `AGENTS.md`
  (for example the permission allowlist, the Node version hold, or the dependency audit gate).
- **Architectural decisions.** New runtime dependency, changes to layers or module boundaries,
  storage schema, event schema, retry strategy, Firefox E2E topology, or token/threat-model
  handling.
- **Material change to a previously accepted decision.** When a new decision supersedes or
  deprecates an existing ADR (see Lifecycle).

## When an ADR is NOT required (defaults)

No ADR is needed for:

- Bugfixes.
- Refactors that do not change module boundaries.
- UI or copy/text changes.
- Test coverage additions.
- Routine dependency updates inside approved policies (for example the `npm audit
  --audit-level=critical` gate in ADR-001, the TypeScript hold in ADR-004, or the Dependabot
  automation policy).

When in doubt, propose an ADR and let the owner decide.

## Process

1. The agent proposes the ADR text in discussion **before** implementation.
2. The ADR file is created only after explicit owner approval.
3. The ADR file is committed together with the implementing change (same PR) or as a standalone
   PR, depending on the situation.
4. The number is the next free one in sequence (ADR-005 and beyond), assigned when the file is
   created.

## Lifecycle

- **Accepted** — the decision is current. Every new ADR is created in this status.
- **Superseded** — the decision has been replaced by another ADR. The header gains
  `Superseded by: ADR-00X`.
- **Deprecated** — the decision is obsolete or withdrawn without a replacement.

When one ADR supersedes another, both files are updated in the same PR: the new ADR gains
`Supersedes: ADR-00Y` in its header, and the replaced ADR's status changes to `Superseded`
with `Superseded by: ADR-00X`.

## Template

Every ADR follows the canonical template in `templates/ADR-template.md`, which mirrors the
structure used by ADR-001 (`Context` / `Decision` / `Consequences`).

## Consequences

- ADR proposals become consistent across sessions: agents follow the triggers and defaults
  instead of deciding ad-hoc.
- Every ADR is traceable: numbering is sequential, statuses carry cross-references, and the
  file travels with the change it records.
- The policy itself is intentionally unnumbered; numbers ADR-00X are reserved for actual
  architecture decisions.
```

- [ ] **Step 2: Verify the file parses as expected**

Run: `Get-Content docs/decisions/ADR-POLICY.md`
Expected: the file exists with the 8 sections (Purpose, When an ADR is required, When an ADR is
NOT required, Process, Lifecycle, Template, Consequences) plus the header block.

- [ ] **Step 3: Run the format check**

Run: `npx prettier --check docs/decisions/ADR-POLICY.md`
Expected: PASS (no output or `All matched files use Prettier code style!`).

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/ADR-POLICY.md
git commit -m "docs: add ADR policy (triggers, defaults, process, lifecycle)"
```

---

### Task 2: Create `docs/decisions/templates/ADR-template.md`

**Files:**
- Create: `docs/decisions/templates/ADR-template.md`

**Interfaces:**
- Consumes: the ADR-001 structure (header block + Context/Decision/Consequences); referenced
  by `ADR-POLICY.md` as `templates/ADR-template.md`.
- Produces: the canonical template file used by agents when creating any future ADR.

- [ ] **Step 1: Create the template file**

Create `docs/decisions/templates/ADR-template.md` with this exact content:

```markdown
<!-- Copy this file to docs/decisions/ADR-NNN-<kebab-case-topic>.md and fill it in. -->
# ADR-NNN: <Short decision name>

<!-- A new ADR is created as Accepted. -->
- **Status:** Accepted
- **Date:** <YYYY-MM-DD>
- **Deciders:** lxfactorl (owner), AI agent (executor)
<!-- Only when this ADR replaces or is replaced by another ADR: -->
<!-- - **Supersedes:** ADR-00Y -->
<!-- - **Superseded by:** ADR-00X -->

## Context

<!-- Describe the problem the decision addresses: why the decision is needed, what conflicts or
constraints exist, and which options were considered. State facts, not conclusions. -->

## Decision

<!-- State what was decided, concretely and unambiguously. Use numbered points for multiple
sub-decisions. If this decision deviates from the approved baseline
(docs/technology-stack-and-repository-requirements.md), say so explicitly. -->

## Consequences

<!-- Describe what changes in the project: positive and negative effects, risks, what must now
be followed, and what is out of scope. List any code or documentation that must be updated. -->
```

- [ ] **Step 2: Verify the file parses as expected**

Run: `Get-Content docs/decisions/templates/ADR-template.md`
Expected: the file exists with title, header block, and Context/Decision/Consequences sections.

- [ ] **Step 3: Run the format check**

Run: `npx prettier --check docs/decisions/templates/ADR-template.md`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/templates/ADR-template.md
git commit -m "docs: add canonical ADR template"
```

---

### Task 3: Add the `## ADR policy` section to `AGENTS.md`

**Files:**
- Modify: `AGENTS.md` (insert new section between `## Git and remote operations` and
  `## Testing and documentation`)

**Interfaces:**
- Consumes: `docs/decisions/ADR-POLICY.md` (Task 1) and `docs/decisions/templates/ADR-template.md` (Task 2) as link targets.
- Produces: an `## ADR policy` section in `AGENTS.md` that all future agents read.

- [ ] **Step 1: Read the insertion point**

Read `AGENTS.md` lines 108-112 to confirm the exact text at the boundary between
`## Git and remote operations` and `## Testing and documentation`.

- [ ] **Step 2: Insert the ADR policy section**

Insert the following between line 109 (`- Do not start implementation on `main` without
explicit user consent.`) and line 111 (`## Testing and documentation`):

```markdown

## ADR policy

- Propose an ADR (draft text in discussion) before implementation for: deviations from the
  approved baseline spec (`docs/technology-stack-and-repository-requirements.md`), and
  architectural decisions (new runtime dependency, layers/boundaries, storage schema, event
  schema, retry strategy, E2E topology, token/threat-model changes).
- Never create an ADR file without explicit owner approval. Commit it with the implementing
  change or as a standalone PR.
- No ADR is needed for bugfixes, refactors without boundary changes, UI/text changes, test
  coverage, or routine dependency updates inside approved policies.
- Statuses: Accepted / Superseded / Deprecated, with `Supersedes` / `Superseded by`
  cross-references. Numbering is sequential; the next number is the next free one (ADR-005 and
  beyond).
- See `docs/decisions/ADR-POLICY.md` and `docs/decisions/templates/ADR-template.md`.
```

- [ ] **Step 3: Verify the section**

Run: `Get-Content AGENTS.md`
Expected: a `## ADR policy` section exists between `## Git and remote operations` and
`## Testing and documentation`, containing the 5 bullets above.

- [ ] **Step 4: Run the format check**

Run: `npx prettier --check AGENTS.md`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add ADR policy section to AGENTS.md"
```

---

### Task 4: Point the requirements doc at the ADR policy

**Files:**
- Modify: `docs/technology-stack-and-repository-requirements.md` (line 320)

**Interfaces:**
- Consumes: `docs/decisions/ADR-POLICY.md` (Task 1) as the link target.
- Produces: a requirements-doc line that references the policy instead of duplicating ADR rules.

- [ ] **Step 1: Read the target line**

Read `docs/technology-stack-and-repository-requirements.md` lines 314-322 to confirm the exact
text of the feature-phase documentation list.

- [ ] **Step 2: Replace the ADR line**

Replace this line (line 320):

```text
- `docs/decisions/ADR-*.md` (beyond ADR-001): major choices such as token storage, retry behavior, and Firefox E2E topology, written when the decision is actually made.
```

with:

```text
- `docs/decisions/ADR-*.md`: architecture decisions and baseline deviations, created per the ADR policy (`docs/decisions/ADR-POLICY.md`).
```

- [ ] **Step 3: Verify the edit**

Run: `Get-Content docs/technology-stack-and-repository-requirements.md | Select-String "ADR-POLICY"`
Expected: exactly one line matching, containing
`created per the ADR policy (docs/decisions/ADR-POLICY.md)`.

- [ ] **Step 4: Commit**

```bash
git add docs/technology-stack-and-repository-requirements.md
git commit -m "docs: link requirements ADR line to the ADR policy"
```

---

### Task 5: Final verification

**Files:**
- Verify: all files from Tasks 1-4

**Interfaces:**
- Consumes: everything produced by Tasks 1-4.

- [ ] **Step 1: Run the full format check**

Run: `npm run format:check`
Expected: PASS (all files including the two new `docs/decisions/` files).

- [ ] **Step 2: Cross-check the spec coverage**

Run: `git status` and review the diff (`git diff main...HEAD`).
Expected: exactly 4 changed commits and these paths:
- `docs/decisions/ADR-POLICY.md` (new)
- `docs/decisions/templates/ADR-template.md` (new)
- `AGENTS.md` (modified)
- `docs/technology-stack-and-repository-requirements.md` (modified)

- [ ] **Step 3: Content consistency spot-check**

Confirm by reading the files:
- `AGENTS.md` ADR policy section links to `docs/decisions/ADR-POLICY.md` and the template.
- The requirements doc line links to `docs/decisions/ADR-POLICY.md`.
- `ADR-POLICY.md` references `templates/ADR-template.md`.
- No existing ADR (001-004) was modified.
- The requirements doc contains the policy link only once.

- [ ] **Step 4: Run the mandatory quality gates**

Run (per `AGENTS.md` before any PR):

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

Expected: all pass (documentation-only change; no code paths affected).
