# Figy: Evaluation Plan

## Research Question

Can product designers reach a reviewable user flow faster while retaining control over AI decisions?

This is a proposed study, not completed research. Do not present the benchmarks below as achieved outcomes.

## Participants and Protocol

Recruit 5-6 product designers who have mapped a user flow in the last month. Observe a recent example of their work before introducing Figy. Record where effort goes: reasoning, drawing, connecting, checking, and correcting.

Give participants comparable tasks using their usual workflow and Figy. Counterbalance order and use equivalent briefs to reduce learning effects. Ask permission before recording. Avoid leading participants toward AI features.

1. Map account recovery when email access may be lost.
2. Inspect the proposed assumptions and change one.
3. Add an exception path without replacing the entire flow.
4. Move a decision, rename a choice, and undo the change.
5. Close and reopen the board, then export it for review.

## Measures

Record time to a reviewable flow, missing paths, disconnected nodes, manual corrections, successful recovery after refresh, and confidence explaining the diagram (1-5). Separate time spent waiting for AI from time spent understanding or repairing the result. Define reviewable before testing: clear entry/outcome, labeled decisions, no missing required branch, and readable labels.

Use participant codes instead of names. Keep raw data private and report the sample size and task limitations. Present distributions or individual observations alongside any averages.

## Case Study Narrative

- Problem and audience hypothesis, supported by observed behavior.
- Baseline screenshots and failure examples, including lost branches and misleading fallback charts.
- Three key design decisions: graph preview, editable assumptions, selection-scoped revisions.
- Tradeoffs: local saving versus cloud sync; deterministic layout versus model coordinates; explicit failure versus invented content.
- Before/after task evidence, including unsuccessful attempts.
- Remaining limitations and next experiment.

## Release Checks

Automated checks cover graph validity, branches/merges, distinct ports, missing credentials, usage limits, preview insertion, reload recovery, connector labels, and undo. Run `npm test` for logic checks. Run `node tests/browser.cjs` with Playwright installed and a local server at port 4318; `FIGY_TEST_URL` and `PLAYWRIGHT_PATH` can override those defaults.

Manual study results, live provider reliability, and distributed usage-limit configuration remain separate from these automated checks.
