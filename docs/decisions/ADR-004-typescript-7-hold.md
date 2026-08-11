# ADR-004: Hold TypeScript on 5.x until typescript-eslint supports TS 7

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** lxfactorl (owner), AI agent (executor)

## Context

Dependabot opened PR #6 bumping `typescript` from 5.9.3 to 7.0.2. The project's lint pipeline is built on `typescript-eslint` (currently `8.67.0`), which the ESLint config uses in its most demanding mode: `tseslint.configs.strictTypeChecked` (`.github/workflows` → `eslint.config.js:18`). This mode runs the TypeScript type checker inside ESLint and enables type-aware rules such as `no-unsafe-assignment` and `no-floating-promises`.

`typescript-eslint` declares the peer dependency `typescript: ">=4.8.4 <6.1.0"`. As of today the latest `typescript-eslint` is `8.67.0` (no newer version exists on the npm registry), and no release in the `8.x` line accepts TypeScript `>=6.1.0`. Adopting TypeScript 7 therefore:

- Breaks `npm ci` with `ERESOLVE` (confirmed in three CI runs on PR #6): npm refuses to install because `typescript@7.0.2` violates `typescript-eslint`'s peer range.
- Would force removal of `typescript-eslint` (or a switch to `--legacy-peer-deps`, which the repo does not use and which would leave the pipeline running an unsupported combination).

No drop-in replacement preserves the current guarantees:

- `@biomejs/biome` parses TypeScript 7 syntax but is not type-aware; it cannot run the `strictTypeChecked` rules the project relies on.
- `oxlint` parses TypeScript 7 with only limited type-aware rules; not equivalent to `strictTypeChecked`.
- `tslint` is deprecated since 2019.

Losing `strictTypeChecked` would weaken the lint gate that the baseline spec (`docs/technology-stack-and-repository-requirements.md:27`) pins as "Type-aware linting; warnings fail CI (`--max-warnings=0`)".

The project is in the hello-world setup-phase release; the value of a TypeScript major bump does not justify weakening the lint toolchain.

## Decision

Hold TypeScript on the `5.x` line until `typescript-eslint` releases a version whose peer range accepts TypeScript `>=6.1.0`.

Concrete actions:

1. Add a Dependabot `ignore` rule to `.github/dependabot.yml` for the `npm` ecosystem that ignores `version-update:semver-major` for `typescript`. Minor and patch updates remain enabled.
2. Close Dependabot PR #6 with a comment pointing to this ADR and the ignore rule.
3. Amend the baseline spec (`docs/technology-stack-and-repository-requirements.md`) and `AGENTS.md` to record the hold and its rationale, so future agents and contributors do not re-litigate the bump.
4. When `typescript-eslint` publishes a release whose `peerDependencies.typescript` accepts `>=6.1.0`, revert the ignore rule and re-bump TypeScript (minor/patch will flow through Dependabot automatically; the major may need a manual bump or a fresh Dependabot run once unblocked).

## Consequences

- `typescript` stays on `5.x` (currently `5.9.3`). Dependabot will still open minor/patch PRs for `typescript` within the `5.x` line; those remain eligible for auto-merge under the existing `dependabot-automerge.yml` policy.
- The type-aware lint pipeline (`strictTypeChecked`) is preserved unchanged.
- PR #6 is closed unmerged. Dependabot will not reopen the `7.0.2` bump because the `ignore` rule covers `version-update:semver-major`. Dependabot may still open a PR for a new TS 7 minor if one ships before `typescript-eslint` supports it; the ignore rule covers all major bumps regardless of the specific version, so any TS `7.x` / `8.x` major bump is also suppressed until the rule is removed.
- Removing the ignore rule is the trigger for re-evaluation; it should be done in the same PR that bumps `typescript-eslint` to a TS-7-compatible version.
- This decision is reversible: removing the `ignore` block and merging a future Dependabot TS 7 PR (once `typescript-eslint` supports it) is the intended exit path.
