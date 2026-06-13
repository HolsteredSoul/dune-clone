# Project (template)

> Fill in `<<PLACEHOLDERS>>`. Keep the **Status pointer** block and the **Roadmap** checklist
> — they are the cross-session memory mechanism, and they load automatically because CLAUDE.md
> `@`-imports this file.

## Mission
`<<One paragraph: what this project builds and the bar it must clear before it's "real".>>`
Objective and prohibitions: see CONSTITUTION.md.

## Status — where we are (THE cross-session pointer; update at session end)
This block is the single place a new session reads to know where we left off — no re-deriving,
no wasted tokens.

- **▶ Current phase:** `<<phase + state>>`
- **Last done:** `<<the concrete last result, with numbers in the objective's units>>`
- **Next action:** `<<the single next concrete step>>`

Milestones live in **Roadmap & milestones** below — that checklist *is* the tracker. Update
both this pointer and the checklist as the final step of each session.

## Scope — evaluate broad, commit narrow
`<<What candidates/areas are in scope for cheap EVALUATION, and the discipline (a gate) that
separates evaluation from COMMITMENT so breadth-first never becomes breadth-first commitment.
An option that never clears the gate stays evaluation-only — that is success, not failure.>>`

## The gate (promotion criterion)
`<<The explicit, measurable bar that moves something from evaluation to committed/live. State
it in the objective's units, on held-out reality, with a minimum-sample floor to avoid the
small-sample trap.>>`

## Data / inputs — the binding constraint
`<<What must be obtainable for the objective to be measurable at all. The rule: no inputs → no
honest measurement → do not build. Resolve this in a feasibility phase before anything else.>>`

### Source-vetting discipline — vet before you integrate
- **Vetting precedes integration. Always.** A throwaway spike, not a built pipeline, first.
- **Checklist (cheap, time-boxed):** coverage · freshness · reliability (works *repeatedly*) ·
  access & cost / licence · granularity (does it carry what we need?).
- **Time-box the spike.** If it doesn't prove out in the box, stop. Don't sink days making it
  work.
- **Record every verdict** — a terse JOURNAL entry, and a one-line memory ruling if durable, so
  no future session re-discovers the dead end.
- **Prefer few, proven, owned datasets** over many live sources of uncertain reliability.

## Stack
`<<Languages/tools, chosen for the binding constraint — and an explicit note on what you will
NOT add (the "same trap in new clothes" temptations).>>`

## The UI / interface — what it must do (plain English)
`<<A short plain-English list of what the operator must be able to DO. Build to this list,
never accrete tabs. No screen/number without a decision it serves. If the list needs to change,
change the list first.>>`

## Roadmap & milestones (cross-session tracker — tick `[x]` as done)
Each phase has a kill-criterion. Keep the Status pointer in sync with this checklist.
- [ ] **Phase 0 — Feasibility.** Can we obtain the inputs to measure the objective honestly?
  *Kill:* no inputs → stated plainly, not built around.
- [ ] **Phase 1 — Build + evaluate.** `<<the core work — usually feature/design work, not the
  algorithm.>>` *Kill:* if it doesn't beat the naive baseline on held-out reality, it stays
  evaluation-only.
- [ ] **Phase 2 — Thin implementation.** Minimal, single path, same code as eventual production.
  Only the parts the current phase needs.
- [ ] **Phase 3 — Gate codified + commit.** Encode promotion thresholds in the objective's
  units so commitment is automatic and evidence-driven.
