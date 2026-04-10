# Lead Scraper PRD Issue Drafts

> Parent PRD: [Issue #1](https://github.com/uzairnadeem201/lead-Scraper/issues/1)
>
> Create these in dependency order so later issues can reference real issue numbers.

---

## Issue 1: Create Server Run Backbone

## Parent PRD

#1

## What to build

Create the first end-to-end server-run path for scraping. A signed-in user should be able to start a run, poll its status, and stop it through protected run endpoints. Runs should be persisted immediately when started, scoped to one active run per user, and carry stable status and stop-reason semantics that future slices can build on.

This slice should establish the durable run lifecycle described in the parent PRD without yet implementing the full staged scraper behavior.

## Acceptance criteria

- [ ] A signed-in user can start a scrape run and receive a persisted run identifier immediately.
- [ ] The client can poll a protected run-status endpoint and receive stable run state plus lightweight UI-ready status data.
- [ ] A signed-in user cannot create a second active run while one is already active for that user.
- [ ] A signed-in user can stop an active run, and the run records a stop reason appropriate for manual interruption.
- [ ] Unauthenticated users cannot access protected run-management operations, while the root login experience remains intact.

## Blocked by

None - can start immediately

## User stories addressed

- User story 36
- User story 37
- User story 42
- User story 43
- User story 80

---

## Issue 2: Add Lead-Centric Niche Dedupe

## Parent PRD

#1

## What to build

Add stable lead identity and niche-specific deduplication so the system treats `place_id + niche` as the durable memory boundary. A lead should be considered previously scraped only after a successful details fetch, and the same business must still remain eligible in a different niche.

This slice should move the system toward lead-centric persistence while keeping run history intact.

## Acceptance criteria

- [ ] The system persists stable lead identity using `place_id + niche`.
- [ ] A lead successfully captured in one niche is suppressed from future runs in that same niche.
- [ ] The same `place_id` can still be captured in a different niche.
- [ ] Deduplication does not activate for candidates whose details fetch never succeeded.
- [ ] Run logic can query this lead memory during scraping without relying on user-wide place ID suppression.

## Blocked by

- Blocked by #<issue-number-for-issue-1>

## User stories addressed

- User story 5
- User story 6
- User story 12
- User story 13
- User story 41

---

## Issue 3: Ship Primary Text Search Run

## Parent PRD

#1

## What to build

Deliver the first complete server-side scrape path using only primary text-search terms. A user should be able to start a run for a niche, area, and campaign mode; the server should execute primary text discovery, use lazy pagination, stop when the configured matching target is reached, and save run results through the new run model.

This is the first tracer bullet for the full scraper, proving the server-run architecture through a narrow but real path.

## Acceptance criteria

- [ ] A run can execute primary text-search discovery entirely on the server.
- [ ] Only curated primary terms are used in this slice.
- [ ] Search pagination is lazy rather than eagerly exhausting all pages.
- [ ] The run stops once the configured matching target is reached or the primary text path is exhausted.
- [ ] Matching-lead counting respects the selected campaign mode rather than counting all discovered businesses.

## Blocked by

- Blocked by #<issue-number-for-issue-1>
- Blocked by #<issue-number-for-issue-2>

## User stories addressed

- User story 7
- User story 8
- User story 17
- User story 18
- User story 19
- User story 20
- User story 25
- User story 26

---

## Issue 4: Add Ranked Candidate Queue

## Parent PRD

#1

## What to build

Add a shared candidate queue that receives newly discovered businesses, removes in-run duplicates, and ranks candidates before spending details calls. Ranking should reflect outreach quality by preferring review strength, then rating, then reachable/contact-rich candidates, while de-prioritizing likely chains without hard-excluding them.

This slice upgrades the scraper from first-found processing to best-next-spend processing.

## Acceptance criteria

- [ ] The run maintains one shared queue across discovered candidates instead of processing candidates only in page order.
- [ ] In-run dedupe prevents the same candidate from entering the queue multiple times during a run.
- [ ] Queue ordering reflects the agreed ranking priorities and chain penalty behavior.
- [ ] Details processing is driven by queue priority rather than raw discovery order.
- [ ] The queue can support the existing target-based stopping behavior introduced earlier.

## Blocked by

- Blocked by #<issue-number-for-issue-3>

## User stories addressed

- User story 27
- User story 28
- User story 29
- User story 30
- User story 31
- User story 34
- User story 35

---

## Issue 5: Add Retry And Failure Suppression

## Parent PRD

#1

## What to build

Make details processing resilient and cost-aware by adding controlled retries for transient failures and suppression rules for candidates that exhaust retries. This slice should ensure repeated rediscovery does not keep reopening failed work within a run, while preserving future eligibility when a lead was never successfully captured.

## Acceptance criteria

- [ ] Details lookups retry a small configured number of times on transient failure.
- [ ] A candidate that exhausts retries is suppressed for the rest of the current run.
- [ ] Failed candidates are not marked as successfully scraped for niche dedupe.
- [ ] Stop-at-target behavior still works correctly when retries and in-flight work are present.
- [ ] The run records enough failure state to support future cooldown logic.

## Blocked by

- Blocked by #<issue-number-for-issue-4>

## User stories addressed

- User story 14
- User story 15
- User story 16
- User story 32
- User story 33

---

## Issue 6: Persist Run Snapshots And Exportable Matches

## Parent PRD

#1

## What to build

Persist full run snapshots so that all successfully detailed businesses from a run are saved, while only the matching subset is treated as exportable campaign output. The system should preserve run-time truth separately from current lead state so historical exports remain reproducible.

This slice establishes snapshot semantics and the separation between inspected leads and matched/exportable leads.

## Acceptance criteria

- [ ] All successfully detailed businesses from a run are captured in run snapshot data, even if they do not match the selected campaign mode.
- [ ] Exportable matched leads are identified separately from non-matching inspected leads.
- [ ] Historical run data can be reproduced from stored snapshot truth without relying on mutable current lead state.
- [ ] Partial runs preserve the successfully captured subset.
- [ ] The system stores enough run-level provenance to support later export generation.

## Blocked by

- Blocked by #<issue-number-for-issue-2>
- Blocked by #<issue-number-for-issue-4>
- Blocked by #<issue-number-for-issue-5>

## User stories addressed

- User story 12
- User story 39
- User story 68
- User story 69
- User story 72
- User story 73
- User story 74
- User story 75
- User story 76

---

## Issue 7: Build Live Run Panel

## Parent PRD

#1

## What to build

Add the dedicated live-run panel that reconnects to the active run, polls server status, and shows structured live progress. The panel should focus on current phase, current term, core counters, target progress, and a tiny read-only preview of matched leads.

This slice makes the new server-run model visible and usable without yet finishing the completed-run UX.

## Acceptance criteria

- [ ] The dashboard reconnects automatically to the current active run for the signed-in user.
- [ ] The live panel shows current phase, current term, matching progress, and core counters.
- [ ] The live panel shows a small matched-lead preview without introducing interactive lead browsing.
- [ ] The live panel reflects server-run progress through polling rather than client-side orchestration.
- [ ] Starting a new run makes it take over the live panel slot.

## Blocked by

- Blocked by #<issue-number-for-issue-1>
- Blocked by #<issue-number-for-issue-3>
- Blocked by #<issue-number-for-issue-4>
- Blocked by #<issue-number-for-issue-5>
- Blocked by #<issue-number-for-issue-6>

## User stories addressed

- User story 45
- User story 49
- User story 50
- User story 51
- User story 52
- User story 53
- User story 54

---

## Issue 8: Add Stop, Reconnect, And Completed Panel

## Parent PRD

#1

## What to build

Complete the active-run UX by supporting manual stop, partial-result preservation, completed-panel persistence, and local dismissal behavior. After a run ends, the live panel should transition into a completed or interrupted summary that stays visible until dismissed or replaced.

## Acceptance criteria

- [ ] A user can stop an active run from the live panel.
- [ ] Stopped runs preserve partial successful results instead of discarding them.
- [ ] The live panel transitions to a completed or partial summary when the run ends.
- [ ] The completed panel remains visible until dismissed or replaced by a future run.
- [ ] Dismissing the completed panel affects only the panel state and is remembered locally in the browser.

## Blocked by

- Blocked by #<issue-number-for-issue-7>

## User stories addressed

- User story 37
- User story 38
- User story 39
- User story 46
- User story 47
- User story 48

---

## Issue 9: Build Run History Cards

## Parent PRD

#1

## What to build

Introduce grouped run history with compact collapsed cards and expandable inline details. Runs should be the primary historical object, with successful runs shown above zero-yield failures, and compact summary information visible without expansion.

## Acceptance criteria

- [ ] Run history is presented as a list of run cards rather than only passive session rows.
- [ ] Successful runs are grouped above zero-yield failed runs.
- [ ] Collapsed cards show niche, campaign mode, location/radius, stop reason, and compact efficiency context.
- [ ] Only one run can be expanded at a time.
- [ ] Expanded cards reveal summary, actions, and inline lead preview structure without leaving the page.

## Blocked by

- Blocked by #<issue-number-for-issue-6>
- Blocked by #<issue-number-for-issue-8>

## User stories addressed

- User story 44
- User story 59
- User story 60
- User story 61
- User story 62
- User story 63
- User story 64

---

## Issue 10: Add Completed Lead Previews

## Parent PRD

#1

## What to build

Add completed-state lead previews for finished runs. The completed live panel should keep a small preview, while expanded history cards should show a larger capped preview of ranked exportable leads. Completed-state previews should allow business-name links to open Google Maps in a new tab.

## Acceptance criteria

- [ ] Finished runs show only matched/exportable leads in their preview content.
- [ ] The completed live panel uses a small capped preview.
- [ ] Expanded history cards use a larger capped preview for finished runs.
- [ ] Completed-state previews rank leads best-first according to the agreed outreach ordering.
- [ ] Business names in completed-state previews open Google Maps in a new tab.

## Blocked by

- Blocked by #<issue-number-for-issue-9>

## User stories addressed

- User story 55
- User story 56
- User story 57
- User story 58

---

## Issue 11: Add Map Coverage Semantics

## Parent PRD

#1

## What to build

Reconnect historical runs to map-based planning by applying the agreed coverage rules. The map should show niche-specific historical coverage, distinguish partial from completed runs, and exclude zero-yield failed runs from coverage while still keeping them in history.

## Acceptance criteria

- [ ] The map shows prior coverage scoped to the selected niche and campaign mode history context.
- [ ] Completed and partial runs are visually distinguished on the coverage map.
- [ ] Zero-yield failed runs do not appear as coverage overlays.
- [ ] Coverage remains guidance rather than a hard block against future overlap.
- [ ] Historical run state shown on the map is consistent with run completion semantics in history.

## Blocked by

- Blocked by #<issue-number-for-issue-6>
- Blocked by #<issue-number-for-issue-9>

## User stories addressed

- User story 2
- User story 3
- User story 4
- User story 23
- User story 24
- User story 40
- User story 41

---

## Issue 12: Add Fallback Discovery Expansion

## Parent PRD

#1

## What to build

Complete the staged discovery model by adding fallback text terms and nearby expansion when earlier discovery phases do not reach the target. Expansion should widen only as needed and follow the agreed distance-first plus overlap-penalty behavior.

## Acceptance criteria

- [ ] If primary text discovery does not reach the target, the run can continue into fallback discovery stages.
- [ ] Fallback text terms run after primary terms rather than alongside them.
- [ ] Nearby expansion occurs only when earlier phases still fail to reach the target.
- [ ] Nearby expansion prioritizes nearer fresh areas before heavier-overlap areas.
- [ ] The target-based early-stop behavior continues to work across all discovery stages.

## Blocked by

- Blocked by #<issue-number-for-issue-3>
- Blocked by #<issue-number-for-issue-4>
- Blocked by #<issue-number-for-issue-5>
- Blocked by #<issue-number-for-issue-11>

## User stories addressed

- User story 21
- User story 22
- User story 25

---

## Issue 13: Ship CSV-First Snapshot Export

## Parent PRD

#1

## What to build

Add on-demand CSV export from run snapshots as the primary export path, with Excel available as a secondary option. Exports should use the agreed stable schema, preserve ranked order, remain downloadable later from history, and reflect run-time snapshot truth rather than current lead state.

## Acceptance criteria

- [ ] Finished and partial runs can generate CSV exports on demand from saved snapshot data.
- [ ] CSV uses one stable schema across runs and campaign modes.
- [ ] CSV row ordering preserves the agreed ranked export order.
- [ ] Historical runs remain exportable later from history.
- [ ] Excel remains available as a secondary export option without becoming the default path.

## Blocked by

- Blocked by #<issue-number-for-issue-6>
- Blocked by #<issue-number-for-issue-9>
- Blocked by #<issue-number-for-issue-10>

## User stories addressed

- User story 65
- User story 66
- User story 67
- User story 68
- User story 69
- User story 70
- User story 71
- User story 72
- User story 77
- User story 78

---

## Issue 14: Add Deep Module Test Coverage

## Parent PRD

#1

## What to build

Add the first wave of automated coverage for the deep logic modules created by this refactor. Tests should validate observable behavior of the discovery planner, candidate queue, run orchestrator, lead repository, and export builder rather than UI implementation details.

## Acceptance criteria

- [ ] The first-wave deep modules are covered by automated tests focused on external behavior.
- [ ] Tests verify the staged-discovery and target-stop semantics introduced by the scraper refactor.
- [ ] Tests verify dedupe, queue behavior, snapshot persistence, and export generation contracts.
- [ ] Tests avoid coupling to transient UI structure.
- [ ] The new test patterns are suitable as the foundation for later module-level coverage in this repo.

## Blocked by

- Blocked by #<issue-number-for-issue-3>
- Blocked by #<issue-number-for-issue-4>
- Blocked by #<issue-number-for-issue-5>
- Blocked by #<issue-number-for-issue-6>
- Blocked by #<issue-number-for-issue-12>
- Blocked by #<issue-number-for-issue-13>

## User stories addressed

- User story 81
- User story 82
- User story 83
