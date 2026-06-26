# OU7 — Hands-off build workflow (Claude Code orchestrator + subagents)

**Status:** Set up 2026-06-23 · **Decision:** ADR-0012 · **Owner:** Eddy (hands-off)

This is how OU7 gets built (v2 shipped, **v3 now active**) **without Eddy in the per-task approval loop**. A single **orchestrator** (the top-level Claude Code session, running in this repo) plans the work, writes a precise brief for each story, hands it to **subagents** that do the work, then reviews their output brutally and only lets it through when it compiles, passes the gate, and meets the acceptance criteria. Eddy stays hands-off; the orchestrator + the gate + CI are the approval authority.

> Why the orchestrator is the *top-level* session (not itself a subagent): Claude Code dispatches reliably from the top level down. Subagents do the work and report back; they are not asked to manage each other.

## The cast (in `.claude/agents/`)

| Agent | Role | Model |
|---|---|---|
| **orchestrator** | The top-level session. Reads **`docs/V3-PRD.md` (active backlog)** + `docs/EPICS.md` + `docs/V2-PRD.md` (shipped context) + `CLAUDE.md`, picks the next story, writes the brief, delegates, reviews, runs the gate, commits, opens the PR. Strict approver. | (the session you launch) |
| **implementer-core** | Writes deterministic, pure `core/` logic (the allowance engine etc.) with exhaustive Vitest tests. | sonnet |
| **implementer-app** | Writes `app/` + `components/` + `lib/` (UI, server actions, Prisma) honouring tokens, light/dark, WCAG AA. | sonnet |
| **test-runner** | Runs the full Definition-of-Done gate + relevant Playwright E2E; reports exact failures. | sonnet |
| **code-reviewer** | Brutally strict, read-only. Gatekeeps against ACs, guardrails, DoD, and edge cases. Returns hard pass/fail. | opus |

## The per-story loop (what the orchestrator runs, autonomously)

1. **Pick** the next story from `docs/V3-PRD.md` (epics 25→33), smallest useful slice first, respecting the build phasing (A–E).
2. **Brief** — write a JSON brief: `{ story, goal, acceptance_criteria[], files_in_scope[], constraints[] }`, derived from the epic's AC + the relevant audit finding IDs (`V2-UX-AUDIT.md` for v2; `WHOSOFF-V3-FEATURE-MAP.md` + the V3-PRD "Integration map" hook points for v3) + the guardrails.
3. **Branch** — `git switch -c feat/<epic>-<slug>`.
4. **Delegate** to `implementer-core` (for `core/` work) or `implementer-app` (for UI/server). It returns changed files + self-checks.
5. **Test** — delegate to `test-runner`. If red, loop back to the implementer with the exact failures.
6. **Review** — delegate to `code-reviewer`. If `passed:false`, loop back to the implementer with the listed `required_fix`es. Repeat 4–6 until green **and** the reviewer passes.
7. **Commit** (Conventional Commits, e.g. `feat(dashboard): …`) and **push** the feature branch.
8. **PR** — `gh pr create` against `main`. The GitHub Actions `build-and-test` job is the merge gate.
9. **Merge** — see the merge policy below. Then move to the next story (one story ≈ one PR).

## The brutal gate — three independent layers

A change only ships if **all three** agree:
1. **The `Stop` hook** (`.claude/hooks/gate.sh`) runs `typecheck → lint → test → build` every time the agent tries to finish; a failure (exit 2) forces it to keep working.
2. **`code-reviewer` (opus)** independently checks the ACs, the ADR-backed guardrails, the DoD, and edge cases — read-only, assumes the code is wrong until proven right.
3. **GitHub Actions `build-and-test`** re-runs the gate in CI on the PR. Green in CI = mergeable (per `CLAUDE.md`).

## Safety rails (so hands-off can't break things)

Two layers, in `.claude/settings.json` + `.claude/hooks/guard.cjs`:
- **The `guard.cjs` PreToolUse hook is the hard rail** (it runs even in skip-permissions mode and exits 2 to block): no `rm -rf`, no push/force-push to `main`, no `git reset --hard`, no `gh pr merge --admin` (the override that skips checks), no DB mutations (`db:migrate`/`db:deploy`/`db:seed`/`prisma migrate reset`/`psql`), no raw network (`curl`/`wget`), and `.env` is unwritable. Feature-branch pushes and `gh pr merge --auto` are allowed.
- **The settings `allow`/`deny` list** is the second layer (active when prompts are on): same denials, plus an allow-list of the routine read/build/git/gh commands so plain `claude` rarely prompts.
- **Branches only / no admin merge.** Everything lands via PRs; `main` can't be pushed or force-merged. Auto-merge runs only on green CI.

> Recommended belt-and-braces: turn on **GitHub branch protection** for `main` with the `build-and-test` check **required**. Then even an automated merge can never land a red build.

## Merge policy — CHOSEN: auto-merge on green + milestone audits (2026-06-23)

Eddy reviews nothing per-PR, so a manual "click merge" would add no real safety. The chosen model:

- **PRs auto-merge when CI is green.** The orchestrator opens each PR and queues `gh pr merge --auto --squash`; GitHub merges it only once the required `build-and-test` check passes. The orchestrator can never merge red, and `--admin` (the override that bypasses checks) is denied in `.claude/settings.json`.
- **This REQUIRES GitHub branch protection on `main`** (required status check = `build-and-test`, no direct pushes) — that is what makes auto-merge safe. One-time setup, see below.
- **Safety net (none of it needs Eddy to read code):** nothing red can land; every merge is reversible via git; and `main` is still only the **test** deploy — real staff don't see anything until the separate go-live cutover.

### Step 0 — one-time bootstrap (orchestrator runs this once, before the first story)
The repo's `gh` CLI is already authenticated on Eddy's Mac, so the orchestrator enables auto-merge and protects `main` itself — Eddy does nothing. The required status check name is `build-and-test` (the job id in `.github/workflows/ci.yml`). Run once and verify:

```
gh repo edit adwinalias/ou7 --enable-auto-merge
gh api -X PUT repos/adwinalias/ou7/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["build-and-test"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
```

This requires every change to go through a PR (no direct pushes to `main`), requires `build-and-test` to be green before merge, and needs zero human approvals — so auto-merge can complete on its own. If the check name ever differs, read it from `gh pr checks` on an open PR and update `contexts`.

**Manual fallback (no terminal):** on `github.com/adwinalias/ou7` — Settings → General → Pull Requests → tick **Allow auto-merge**; then Settings → Branches → protect `main`: require a PR, require status check **`build-and-test`**, no direct pushes.

### Milestone audits (your actual oversight — plain English, no code)
The orchestrator **pauses at each phase boundary** (phases A–E in `docs/V3-PRD.md`) and writes a plain-English milestone summary (what shipped, what's left, anything needing a decision). At that point an **independent reviewer** — Claude in a fresh Cowork session, or a scheduled audit task — reviews the merged diffs *and* clicks through the live test deploy, then reports to Eddy: "looks right / here's what to check / pause." Eddy's only job is **read the report and say go or pause**. The one review Eddy can do himself: open the test deploy and click through the changed screens (behavior, not code).

## How Eddy runs it (on the Mac, where the repo + the gate live) — truly no prompts

1. `cd` into the OU7 repo and run **`claude --dangerously-skip-permissions`**. This is what makes it actually hands-off — without it, Claude Code prompts on every shell command (e.g. `find`/`grep`), which defeats the point. Safety is preserved by the **PreToolUse guard hook** below, not by prompts.
   - **Recommended first — install the `ponytail` skill** so every implementer writes the least code that satisfies each AC: `/plugin marketplace add DietrichGebert/ponytail` then `/plugin install ponytail@ponytail` (desktop app: Customize → **+** by personal plugins → add marketplace → Add from repository → the repo URL `DietrichGebert/ponytail`). It adds an always-on YAGNI ruleset plus `/ponytail-review` (delete-list for a diff) and `/ponytail-audit`. It runs **two small Node.js lifecycle hooks** (MIT, ~45k★) — review and **trust** them before the hands-off run, since this is a skip-permissions session.
2. Tell it once: *"You are the orchestrator. Run Step 0 (bootstrap) first, then build OU7 v3 from docs/V3-PRD.md (epics 25–33) one story at a time, per docs/BUILD-WORKFLOW.md. Don't ask me to approve individual steps; open a PR per story and let auto-merge land them on green. Skip Epic 33 — it's human-gated."*
3. Walk away. I'll catch you at the first milestone with a plain-English report.

Notes:
- A **Claude Max plan** is recommended — a multi-agent loop uses roughly **3–7× the tokens** of a single session.
- The trade-off is explicit: skip-permissions removes the per-command prompt, so the **`guard.cjs` PreToolUse hook is the safety rail** (it hard-blocks the destructive commands even in this mode). If you'd rather keep prompts on, run plain `claude` — edits auto-approve and most read commands are allow-listed, but you'll still get the occasional prompt.

## When the orchestrator MUST stop and ask Eddy

Hands-off has limits. The orchestrator pauses for a human decision when:
- A story needs a **product/UX decision** not already settled in `docs/V2-PRD.md` / `V2-UX-AUDIT.md`.
- The work would touch the **locked allowance-engine logic**. (The v3 enabling ADRs are already written: **ADR-0014** coverage/clash, **ADR-0015** day-count snapshots + effective-dated region moves — epics 28–30 may proceed.)
- The same story **fails the gate or review repeatedly** (e.g. 3 loops) — likely the spec is wrong.
- Anything implies a **secret** or a **hosting/region change** (their own ADRs). Additive, defaulted **schema migrations are expected in v3** (new leave-type fields, `Department.maxLeavePerDay`, `StaffRestriction`, `EmployeeRegionAssignment`) — proceed, but a *destructive* migration still pauses.
- **Epic 33 (go-live / WhosOff migration) is human-gated** — spec and dry-runs only; never run the hosting cutover or a production data migration autonomously.

## OU7 invariants the harness enforces

All the `CLAUDE.md` guardrails still hold and are baked into the reviewer: no AI at runtime (ADR-0003), `core/` stays pure, `app/ → lib/ → core/`, region-aware + Asia/Dubai, balances via `core/allowance`, design tokens only / grey = pending, no overtime, config-as-data — plus the v2 locked decisions (bottom tab bar, customizable widgets, **Team Calendar four-category abstraction with HR-sees-all**, **typed adjustment ledger**, **multi-year storage**) — plus the **v3 invariants**: leave day-counts are **snapshotted at creation and never recomputed** (ADR-0015); coverage is **advisory + audited** while staff-vs-staff **clash is a hard approval gate** (ADR-0014); **archive, never hard-delete** (leave types/tags); **no lieu/TOIL**; weekends stay **region-driven** (not per-user). The build also runs the **`ponytail`** skill (YAGNI ladder: *skip → stdlib → native → installed dep → one line → minimum*) so implementers write the least code that meets each AC — but it **never** trims trust-boundary validation, error/data-loss handling, security, accessibility, or the **exhaustive `core/` tests** the DoD requires (ponytail trims production code, not tests). `code-reviewer` enforces both halves; run `/ponytail-review` on a diff and `/ponytail-audit` on the repo at phase boundaries.
