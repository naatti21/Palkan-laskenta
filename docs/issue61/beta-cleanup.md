# Issue 61 — bounded Beta cleanup

Base: `02cdb6c191e333bf47a2f5be16505d7f33d9882e` (`deploy/beta-compact-precision-20261106`).

## Map and proposed first changes (before implementation)

- `app.js` (2099 lines) coordinates PDF review, batch import, income sources, history, backup and all major views. Module-level pending review state couples async import and UI events. `parser.js`/`learning.js` handle interpretation; `model.js` handles record projection/validation; `storage.js` owns IndexedDB transactions. Keep these boundaries and persistence unchanged in this first PR.
- `experiments/year-planner/index.html` (648 lines, dense inline scripts) combines pure `PalkkaPlannerCore`, historical suggestions, SVG presentation and DOM events. The embedded planner receives history through a same-origin message bridge. Do not change financial formulas or the bridge here.
- `beta-ab-summary-v6.mjs` consumes planner inputs and rounded DOM results, recomputes using the existing core, and cross-checks the internal common scenario within the existing €2 tolerance. A is synchronized to the hidden shared count; B stays independent. Three MutationObservers trigger presentation updates. The summary's money parsing, input validation and two-factor decomposition can be isolated without changing financial semantics.
- `scripts/build-beta.mjs` (444 lines) copies shared sources to `_beta`, transforms exact HTML anchors, appends ordered locked CSS, and versions the offline dependency closure. Some replacements silently accept zero/multiple anchors. Generated CSS and templates remain here in this slice; separating them all at once would obscure the locked visual contract.
- Layered CSS includes historical overrides; absence of a selector in source alone is not evidence that it is dead (dynamic DOM and iframe). Do not remove CSS without visual evidence.

First two changes: (1) extract pure summary adaptation and test against unchanged core; (2) fail closed on missing/duplicate critical build entry, ledger, planner and service-worker anchors. Remove only the proven no-op tracking-boundary replacement and obsolete comments. No app.js/storage/parser, shared planner, theme or navigation changes.

## Remaining risks / next slices

The planner still communicates rounded output through DOM rather than an explicit versioned model event. Keep its consistency guard; a later PR can characterize async event ordering before replacing the observers. The large app coordinator and remaining build transformations need separate small changes with import/backup and visual coverage. No package dependency is proven unused: PDF.js, Playwright and fake-indexeddb are exercised. Hidden shared results remain compatibility inputs and must not be deleted as apparent duplicate UI.

## Implemented

- Pure `beta-ab-summary-model.mjs` owns Finnish displayed-money parsing, one shared weekend-count validator, input-to-core adaptation and symmetric cash-flow decomposition. The DOM module only gathers inputs and presents the existing computed rows. `PalkkaPlannerCore`, all tax/pay formulas, rounding and the €2 consistency guard are unchanged.
- `scripts/beta-build-anchors.mjs` requires exactly one literal anchor at app bootstrap, ledger insertion, planner style/script injection and every transformed service-worker dependency group. Errors identify the failed target. Missing/duplicate anchors and literal `$` insertion are covered by adversarial tests.
- The new runtime module is copied, content-hashed and precached. This is a Beta-only dependency; the shared application and staging output are unchanged.
- Removed duplicated weekend validation, an unused callback argument and an HTML replacement that replaced a boundary with identical text (including its obsolete disabled-PDF explanation). No package was removed speculatively; hidden shared result fields remain necessary compatibility inputs. No visible copy or theme changes in this first technical slice.
- Quality gate runs on this exact review branch as well as its existing triggers. Deployment workflow files are untouched and remain restricted to their own branches.

## Evidence and limits

Synthetic input 52,000 annual base + 1,000/weekend: A=2 → gross 54,000, net 32,400; B=10 → gross 62,000, net 35,340. Tests cover all 49 combinations of counts 0/2/10/11/20/21/52 across the existing withholding thresholds, invalid/missing input, fractional counts, signed/decimal localized amounts and decomposition conservation. This is a characterization of the existing model, not a claim that example withholding is personalized taxation.

A separate build from the exact base archive was compared with the refactor: generated `index.html`, `styles.css`, planner HTML, `beta-entry.mjs` and manifest were byte-identical. The new summary module and service-worker cache version/dependency list are the intentional output changes.

Local dependencies: locked `npm ci --cache /tmp/palkka61-npm-cache --no-audit --no-fund` passed. The first attempt failed because the default npm cache was outside writable paths; dependency-dependent tests from that failed setup are not counted as application failures. Playwright's Chromium download was denied with HTTP 403 by the environment. Local browser tests use installed Debian Chromium 154.0.8037.57 via a temporary `PLAYWRIGHT_BROWSERS_PATH` mapping, with original test assertions/configurations unchanged. GitHub CI uses the repository's pinned Playwright browser installation. No real salary documents were used.

Local results: base Node 260/260 PASS; refactor Node 268/268 PASS (8 new tests). Existing shared-app Playwright 38/38 PASS; staging isolation 4/4 PASS; full Beta 82/82 PASS (79 existing + 3 new offline/mobile cases), including locked-theme checks and real synthetic PDF import/learning. No skipped or expected-failure tests. After reviewing the extraction, the explicit blank shared-weekend guard was retained; Node and affected Beta suites were rerun on the final sources. GitHub results must be checked for the delivered SHA; local green does not establish CI or Android readiness.

Next recommended PR: characterize planner input/history event ordering and introduce a small explicit snapshot interface before changing the DOM-to-model link. Text consolidation and further app.js splitting should follow separately; preserve every warning that distinguishes actual payments, future payments, YTD, estimates and withholding from final taxation. Android install/update and visual acceptance remain human release gates. No deployment or merge is part of this work.
