# Handing OU7 to Claude Code

This repo is built to be handed to **Claude Code** (the CLI coding agent) to implement feature-by-feature. The spec (`docs/`), the backlog (`docs/EPICS.md`), the design system (`design/`), a working CI, a tested domain core, and a root `CLAUDE.md` (which Claude Code auto-reads) are all in place. Follow these steps.

> Verify any command against the official docs: https://code.claude.com/docs — the CLI evolves.

---

## 0. Put it under version control (once)

```bash
cd "OU7 repo folder"
git init && git add -A && git commit -m "chore: initial scaffold + docs"
# Recommended: create a GitHub repo so CI runs and Claude can open PRs
gh repo create interestingtimes/ou7 --private --source=. --push   # needs the gh CLI, authenticated
```

`.gitignore` already excludes `node_modules`, `.env`, `.next`, etc.

## 1. Install Claude Code & sign in

```bash
curl https://claude.com/install.sh | bash   # native installer (auto-updates)
claude                                       # opens a browser to log in
```

## 2. Start it in the repo

```bash
cd "OU7 repo folder"
claude
```

- It **auto-loads `CLAUDE.md`** — your guardrails and working agreement. **Do not run `/init`** (it would overwrite the hand-written `CLAUDE.md`). If you ever want to tweak it, use `/memory`.
- Optional safety for the first runs: start in **plan mode** so it proposes before changing anything — `claude --permission-mode plan`, or press **Shift+Tab** to cycle modes mid-session.
- If you want it to open PRs: `gh auth login` first. Note Claude Code **does not wait for GitHub Actions** — check the PR's CI status yourself before merging.

## 3. Drive it one epic/story at a time

Work the backlog in `docs/EPICS.md` in order. Build the **smallest useful vertical slice** first. Suggested sequence and prompts (paste one at a time):

**A — Orient (plan only, no code):**
> Read `CLAUDE.md` and the files in `docs/`. Summarise the current state of the repo and propose the first three stories to implement as the smallest end-to-end slice. Plan only — don't write code yet.

**B — Finish Epic 1 (auth → app):**
> Implement story 1.4 (RBAC guard) and the session→Employee mapping from Epic 2.2/2.3, per `docs/EPICS.md` and `docs/ARCHITECTURE.md §6`. Plan first, then implement with Vitest + integration tests. Keep `core/` pure. Run typecheck, lint, tests and build before you finish.

**C — Minimal data to exercise flows (Epic 2/3):**
> Add an HR admin screen to create an Employee (region, department, manager, joining date) and generate their AllowancePeriod via `core/allowance`. Use the seeded regions/leave types. Tests included.

**D — The headline slice (Epic 5):**
> Build the Request → Check-details → Submit flow on top of the already-tested `core/leave.validateRequest`, persisting a PENDING `LeaveRequest`, then the approver Approve/Decline that debits allowance via `core/allowance`. Cover the hot path with a Playwright e2e test. Follow `docs/DESIGN-SYSTEM.md` (light + dark).

**E — Verify & ship (every story):**
> Run `npm run typecheck && npm run lint && npm test && npm run build`. Fix any failures. Show me the diff, then commit with a Conventional Commit message and open a PR.

For each later epic, reference it explicitly, e.g. *"Implement Epic 6 (Team wall chart) per docs/EPICS.md, using the cell styles in design/design-preview.html."*

## 4. Good habits

- **One story per session.** Use **plan mode** for anything that touches new systems; review the plan before approving.
- Let it **run the tests itself** (commands are in `CLAUDE.md`); make passing CI the bar for "done."
- **You review the diff / PR.** Keep commits small (Conventional Commits). The CI workflow (`.github/workflows/ci.yml`) runs on every PR.
- Set **`allowedTools`** via `/permissions` rather than `bypassPermissions`. Only enable MCP tools you actually need.
- The guardrails in `CLAUDE.md` (no AI at runtime, standalone, Google SSO, region-aware, overtime out of scope, grey = pending) are there so the agent stays on-spec — keep them updated if scope changes.

## 5. What it needs from you (secrets)

- A local Postgres (`docker compose up -d`) — already wired.
- **Google OIDC credentials** (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) to actually sign in; the app builds and tests without them, but real login needs a Google Cloud OAuth client restricted to `interestingtimes.me`.
- Later: Microsoft Graph (Teams DMs) and the Notion export token/DB — both behind flags, not needed for Phase 1.

## 6. Advanced (optional)

You can also drive it from GitHub by installing the **Claude Code GitHub App** and mentioning `@claude` in an issue/PR — useful for delegating a story straight from a ticket. See https://code.claude.com/docs/en/github-actions.

---

### Common gotchas
- Don't run `/init` — you already have `CLAUDE.md`.
- Don't hand it a whole epic at once; one story, plan first.
- It won't block on CI — check the PR before merging.
- First run needs `npm install` (and `npm run db:generate`) — let it do that, or run it yourself once.
