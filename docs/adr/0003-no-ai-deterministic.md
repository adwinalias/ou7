# ADR 0003 — No AI in the running product; deterministic software only

**Status:** Accepted · **Date:** 2026-06-08 · **Deciders:** Eddy (Transformation)

## Context

The previous internal build used a Notion "agent" and n8n automations. For the new app, the team wants all calculations to be predictable, auditable software — not AI/LLM inference — for trust, reproducibility, and compliance with leave/payroll-adjacent data.

## Decision

The running application contains **no AI/ML**. Every calculation — allowance maths, day/region counting, conflict detection, carry-over, reports, reminders, integrity checks — is **deterministic, rule-based, unit-tested code** in the `core/` domain layer. Reporting "insights" are computed from **fixed thresholds**, not models. AI tooling may assist *development* (writing code, this documentation); it does not run inside the product.

## Consequences

- Results are reproducible and explainable; the same inputs always give the same output.
- Logic is fully testable and auditable — essential for balances people trust.
- No model hosting, prompt cost, drift, or non-determinism in production.
- Any future "smart" feature must be expressible as explicit rules, or it is out of scope.

## Alternatives considered

- **LLM-assisted summaries/insights at runtime** — rejected: introduces non-determinism and cost into a system of record for leave.
