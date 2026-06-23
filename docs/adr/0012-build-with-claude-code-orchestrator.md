# ADR 0012 — Build OU7 v2 with a Claude Code orchestrator + subagents (hands-off)

**Status:** Accepted · **Date:** 2026-06-23 · **Deciders:** Eddy (Transformation)

## Context

Eddy is non-technical and wants to be **hands-off** during the v2 build — no per-task approvals.
The v2 scope is fully specified in `docs/V2-PRD.md` (epics 17–24) and `docs/V2-UX-AUDIT.md`, with
a green-CI merge gate already in place (`.github/workflows/ci.yml`). We evaluated using OpenAI
Codex (CLI / MCP / GitHub) as the implementer, but Eddy has a Claude subscription and Claude Code
already provides a native orchestrator + subagent model, so no second vendor is needed.

## Decision

1. **The top-level Claude Code session is the orchestrator.** It plans, writes a per-story brief,
   delegates to subagents, reviews their output strictly, runs the gate, commits, and opens one PR
   per story. Eddy is not in the per-task loop; the orchestrator + gate + CI are the approval
   authority. (Subagents do work and report back; they do not orchestrate each other.)

2. **Four subagents, in `.claude/agents/`:** `implementer-core` (pure `core/` + exhaustive Vitest),
   `implementer-app` (`app/`+`components/`+`lib/`, tokens/themes/a11y), `test-runner` (the DoD gate
   + E2E), and `code-reviewer` (opus, brutally strict, read-only, hard pass/fail).

3. **Three independent gate layers:** the `Stop` hook (`.claude/hooks/gate.sh` → typecheck + lint +
   test + build, exit 2 blocks), the `code-reviewer` subagent, and the GitHub `build-and-test` job.
   A change ships only when all three agree.

4. **Safety rails in `.claude/settings.json`:** `acceptEdits` mode for a no-prompt loop, but a
   deny-list blocks pushing/merging to `main`, force-push, `reset --hard`, destructive shell, DB
   mutations, raw network, and `.env` access. Work lands via feature branches + PRs only.

5. **Merge policy (chosen 2026-06-23): auto-merge on green + milestone audits.** Since Eddy
   reviews nothing per-PR, a manual merge click would add no real safety. PRs auto-merge once
   the `build-and-test` check passes (`gh pr merge --auto --squash`); the `--admin` override is
   denied. This **requires GitHub branch protection** on `main` (required `build-and-test`
   check, no direct pushes) — that is the actual guard. Oversight is via **milestone audits**:
   the orchestrator pauses at each phase boundary and an independent reviewer (a fresh Cowork
   session or a scheduled task) reports progress + a live-deploy walkthrough in plain English;
   Eddy says go/pause.

Full operating procedure: `docs/BUILD-WORKFLOW.md`.

## Consequences

- Eddy gets a hands-off build with the existing guardrails enforced by an opus reviewer + the gate.
- The build process uses an LLM, but **only at build time** — this does not touch ADR-0003
  ("no AI/ML at runtime"), which is about OU7's running app.
- Multi-agent runs cost ~3–7× the tokens of a single session; a Claude Max plan is recommended.
- The orchestrator must **pause for Eddy** on unsettled product decisions, repeated gate failures,
  or anything needing a new ADR (notably **Epic 24 multi-year storage → ADR-0013 first**; the
  locked allowance-engine logic stays unchanged).

## Alternatives considered

- **OpenAI Codex (CLI/MCP/GitHub) as implementer** — workable (`codex exec`, `codex mcp`, GitHub
  app) but adds a second paid vendor and key management; rejected since Claude Code covers it under
  Eddy's existing subscription.
- **`bypassPermissions` / `--dangerously-skip-permissions` as the default** — rejected as the
  standing config; too broad for an unattended non-technical operator. Offered only as an opt-in
  for a throwaway clone. The `acceptEdits` + deny-list is the safer default.
- **Manual click-to-merge on green** — rejected: Eddy reviews nothing per-PR, so the click would
  be a rubber-stamp that adds no safety while implying control he isn't exercising. Replaced by
  auto-merge + milestone audits (point 5), which puts oversight at a cadence he'll actually use.
