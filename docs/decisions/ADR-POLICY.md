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
