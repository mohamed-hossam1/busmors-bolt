# Handoff to the implementation model

> Scope update — 18 November 2026: the owner requires an English-only project. Interface, conversation and generated-content language are English; locale switching, alternate registers and right-to-left presentation are removed from acceptance. Country, currency, target market and IANA timezone remain independent. This update supersedes the earlier language requirements.

## Copy-paste starter prompt

```text
Work in /home/mohamed/Mohamed/busmora-bolt/busmors-bolt.

Read docs/phase-1-2/README.md, IMPLEMENTATION_PROGRESS.md, 02-contracts.md,
03-visual-experience.md, and the specific task in 04-implementation-tasks.md.
Use the PRD at /home/mohamed/Mohamed/busmora/busmora-docs/core/prd.md as the
product feature reference. The owner's competition priorities in README govern:
React + Supabase only; polished real user-facing functionality; browser-driven
AI Tasks are acceptable; production backend hardening follows the competition.

Implement task C__ only, including its real persistence, primary error/recovery
state, English strings, mobile layout, and acceptance checks. Read its
dependencies and current source before editing. Reuse the existing design and
components. Preserve all existing uncommitted changes, especially Brain delete
work. Do not rewrite the app or introduce a separate backend/worker stack.

Use the shell wrapper required by /home/mohamed/.codex/RTK.md: prefix shell
commands with rtk. Do not read or print secrets. No fabricated providers,
research sources, success states, published IDs, or agent events. Demo seed data
must be clearly labeled and isolated from real workspaces.

If an external integration is unavailable, finish independent work, show the
truthful blocked state, and record the exact blocker. Do not replace a required
real operation with a fake success or silently remove the feature.

After implementation, run relevant existing checks plus the task acceptance
scenario. Update docs/evidence/competition-status.md and the relevant ledger
rows with actual evidence. Report changed files, checks and any remaining gap.
Do not mark full PRD production readiness from a demo or mocked test.
```

## Session workflow

1. Inspect `rtk git status --short` and relevant diff. Identify user work and previous task output before editing.
2. Read only the task's source paths and the needed contracts. Check that dependency behavior exists.
3. Write a short implementation checklist: database/API, view/state, errors, English copy, test. Do not start by redesigning unrelated screens.
4. Implement one coherent slice. Keep shared types and source-of-truth rules consistent.
5. Inspect the actual UI at desktop/mobile sizes for UI changes; do not infer polish from JSX. Verify data after refresh.
6. Run relevant checks. Existing tests may use old behaviors; update them only when the new contract deliberately changes those behaviors, and document why.
7. Save evidence/status and report. If a session ends mid-task, write the exact files/next steps and keep status in_progress.

## Small-model guardrails

- Do not create a second Post/document/task store to bypass a difficult migration.
- Do not put new mock fixtures into runtime code. Presentation seeds are explicit demo-workspace inputs.
- Do not remove errors, assertions, RLS, or approval checks to make a demo pass.
- Do not calculate financial ratios in prompts or treat unknown as zero.
- Do not make a whole campaign for a one-Post request.
- Do not trigger external sends from rendering, loading a page, task completion, or reconnect.
- Do not automatically turn research into approved Brain facts or revise a plan after analysis.
- Do not make every failure terminal immediately; retry within defined limits, then show truthful failure/partial output.
- Do not continue showing Processing after execution has been lost. Browser limitation is accepted; fake durability is not.
- Do not create Today/Outcomes/recurring performance reviews, Now/Next/Later boards, paid Ads, or billing.
- Do not claim Google explicit-link security, ordinary-owner Meta production access, or backup guarantees that were not tested.
- Prefer a modest complete feature to a beautiful empty screen. Every visible primary action must work.

## Status and evidence format

Create `docs/evidence/competition-status.md` during C01 with a row for each task:

```text
ID | Status | Implemented files | Check/evidence | Blocker | Next action
```

Use the current tracker labels: INCOMPLETE — missing, INCOMPLETE — partial, INCOMPLETE — implemented; verification pending, or COMPLETE only after the whole task acceptance is evidenced. Record external/environment blockers separately. Read the status and To complete notes under the task before implementing; the initial source audit is historical. A screenshot proves appearance only; a fixture test proves the tested local behavior; a provider permalink proves only that actual publish/access path. Keep those distinctions in the evidence column.

End every session with:

```text
Completed task:
User-visible result:
Changed files:
Checks actually run and outcomes:
Known limitation:
Next dependency-ready task:
```

## Stop conditions that require a decision

Stop dependent work and report the exact issue if a solution would require a different stack, destructive migration of real data, credentials/access unavailable to the team, unsupported publication rights, or a change to the owner's intended visible feature. Continue unrelated tasks. Do not ask for permission for routine reversible edits already authorized by the implementation request.

For ambiguous aesthetic details, choose the existing design system. For provider behavior, verify current official documentation and actual configuration rather than inventing flags or models. For a genuine product gap, preserve the PRD requirement in the ledger and name the competition deviation explicitly.
