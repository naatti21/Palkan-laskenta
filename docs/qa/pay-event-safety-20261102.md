# Palkka Beta: payroll event safety (issue #38)

Base: `qa/beta-pdf-import-round1-20261102` at `e6fe0adcfface140937e72a1ebf647bfbf526786`.
Development branch: `fix/beta-pay-event-safety-20261102`. No deployment or merge is authorized by this change.

## Data contract

Record schema 2 / backup schema 3, accepting record schema 1 and backup schema 2 plus legacy flat arrays. IndexedDB version 2 preserves the existing stores and reads old records through the canonical normalizer; writes persist the new representation. Unsupported future schemas reject before writes. No automatic history clearing.

`id` identifies a revision; `payEventId` identifies a payment. New IDs are random opaque UUIDs. `supersedes` retains ancestor revision IDs, `resolution` marks archived versions, and `distinctFrom` records pairwise user decisions between payments. Explicit separation is not a blanket exemption from later correction review. `sourceHash` is SHA-256 of exact local PDF bytes, distinct from legacy semantic fingerprints. No original PDF, filename, extracted raw text or payer identity is added to backups.

All mutating operations read and decide inside one IndexedDB read/write transaction. Replacement creates a new revision and retains the old row. Backup import unions revisions rather than clearing/replacing the store. Same-ID divergent payloads retain a separate revision with import provenance. Superseded ancestors cannot become active simply because an older backup is restored. Conflicting branch heads remain unresolved. Dialogs validate their expected candidate snapshots before resolving.

All consumers use `projectPayroll`: analysis, insights, dashboard, tax-card forecast, scenario defaults and annual-planner backup import. Superseded revisions never count. Unresolved pairs are excluded and annual certainty is withheld. Explicit separate payments count once each, even at identical dates and amounts. YTD is a snapshot; same-day snapshot ties are withheld, never summed or selected by backup order. Payment date determines tax year. Missing dates are unresolved.

## Test coverage

`tests/pay-event-red-green-matrix.test.mjs` is copied unchanged from PR #39: baseline 9 PASS / 6 FAIL, implementation 15 PASS.

`tests/pay-event-storage.test.mjs` has named E01–E26 tests, exercising the real storage module with fake IndexedDB and synthetic data:

| Scenarios | Assertions |
|---|---|
| E01–E04 | exact-source idempotency; different document/changed net/withholding requires review |
| E05–E06 | different and identical confirmed payments each count exactly once |
| E07–E12 | changed payday/boundary/overlap/missing periods; disjoint periods remain independent |
| E13–E16 | zero/negative payments, snapshot YTD, payment tax year, card reset |
| E17–E19 | manual correction preservation; stale and repeated backup restore |
| E20–E23 | revision chains, durable separation, unresolved totals, privacy normalization |
| E24–E26 | concurrent imports/restores, safe calculation defaults, opaque payer separation |

Additional regression cases: stale dialogs, three candidates, divergent branches, unknown schemas, exact-source duplicate backup resolution, splitting stored revisions, reverting a manual correction, equal-content successors and same-day planner YTD ties.

`tests/beta/pay-event-safety.spec.mjs`: real browser IndexedDB, synthetic PDF import, 360/412px decision controls, reload/backup durability, offline reload, retained archive/history resolution and concurrent two-tab imports. Existing parser and one-time-learning regression suites remain enabled; no parser or Import Engine switch.

## Review and validation status

Initial independent review found non-atomic storage, destructive replacement, false fingerprint identity and inconsistent projections. Follow-up review reproduced five defects in the first implementation (duplicate backup resolution, splitting same-event heads, correction reversion, equal-content successor merge, same-day planner YTD). Each has a dedicated regression test and was corrected before the initial PR commit.

Local Node: PASS, 224 tests. Beta/staging local builds: PASS when using their required local origins. Local Playwright: NOT RUN — no browser installed, Chromium download failed with gateway/invalid archive responses. GitHub CI results and final tested SHA are recorded in the PR. Do not infer browser/mobile/offline PASS from the Node tests.

## Phone test after an approved test deployment

1. Use synthetic PDFs; keep the current QA deployment untouched until deployment is separately approved.
2. Import one PDF twice: one payment. Import an equal-value different PDF: review required.
3. Choose **Säilytä erillisenä maksuna ja huomioi laskennassa**: both payments appear in Analysis once.
4. Import a correction and choose its prior target: old revision remains in History marked **Korvattu versio – ei laskennassa**.
5. Reload, export and restore the backup twice: counts/totals do not change. Resolve restored conflicts from History.
6. After a successful online load, enable airplane mode and reload; inspect History and Analysis.

Real iOS/Android device and installed-PWA upgrade testing remains a separate human check. Browser emulation is not physical-device verification.
