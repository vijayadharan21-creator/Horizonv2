# TaskForge AI — Repair Plan
**Generated:** 2026-10-10  
**Status:** All P0/P1 items addressed

---

## Priority Legend
- **P0** — Critical: security breach, data loss, or complete feature failure
- **P1** — High: correctness bug, missing required constraint
- **P2** — Medium: quality gap, missing test, partial implementation
- **P3** — Low: cosmetic, optimization

---

## Completed Repairs

| ID | Priority | Category | Problem | Fix | Files Changed |
|---|---|---|---|---|---|
| R01 | P0 | Security | Live OpenAI API key in `server/.env.example` | Replaced with safe placeholder; updated `.gitignore` | `server/.env.example`, `.gitignore` |
| R02 | P1 | Runtime | Duplicate `OPENAI_API_KEY` in `server/.env` — second was truncated, causing auth failures | Removed duplicate line, added placeholder | `server/.env` |
| R03 | P1 | Concurrency | `getNextTaskId` — read-then-write race produced duplicate T-xxx IDs under concurrent requests | Changed to atomic `$inc` on `TaskCounter`; added collision fallback | `server/controllers/taskController.js` |
| R04 | P1 | Architecture | No independent schedule validator — AI output committed without deterministic checks | Created `scheduleValidator.js` with V01–V11 constraints | `server/service/scheduleValidator.js` |
| R05 | P2 | Testing | No tests for schedule validator, recovery engine, sub-skill matching, downstream rescheduling | Added 27 new tests in 2 test files | `server/tests/scheduleValidator.test.js`, `server/tests/recovery.test.js` |

---

## Remaining / Deferred Items

| ID | Priority | Item | Reason Deferred | Recommended Action |
|---|---|---|---|---|
| D01 | P0 | Rotate exposed OpenAI API key & MongoDB credentials | Git history contains real credentials; rotating is immediate action on the provider dashboard | Invalidate & regenerate keys at OpenAI and MongoDB Atlas |
| D02 | P0 | Purge git history of secrets | Requires `git filter-repo` + force push coordination | Use `git filter-repo --path server/.env --invert-paths` then force-push |
| D03 | P2 | Rate limiting on `/api/auth/*` and `/api/ai/*` | Requires `express-rate-limit` package | `npm i express-rate-limit` + apply to auth and AI routes |
| D04 | P2 | Integrate `validateScheduleCandidate` into `applyRecoveryPlan` | Validator created but not yet wired into the apply path | Import and call before `task.save()` in `recovery-ai.service.js` |
| D05 | P2 | E2E tests (Playwright/Cypress) | Requires live DB + running server | Configure with test MongoDB URI, write Scenario A-G from audit spec |
| D06 | P3 | CP-SAT scheduling engine | Adds Python runtime dependency; current heuristic is adequate | Evaluate if deadline-constraint solving is needed at scale |
| D07 | P3 | CSRF tokens | `SameSite=Lax` mitigates most CSRF; explicit tokens add stronger protection | Add `csurf` or double-submit cookie pattern before production |

---

## Files Changed Summary

```
server/controllers/taskController.js     — atomic task ID generation
server/.env                              — removed duplicate key, placeholder
server/.env.example                      — replaced live keys with placeholders
server/service/scheduleValidator.js      — NEW: deterministic validator V01–V11
server/tests/scheduleValidator.test.js   — NEW: 22 validator tests
server/tests/recovery.test.js            — NEW: 7 recovery engine tests
server/tests/runner.js                   — added 2 new test files
.gitignore                               — allow .env.example, block .env.*
docs/IMPLEMENTATION_AUDIT.md             — NEW
docs/REPAIR_PLAN.md                      — NEW (this file)
docs/VERIFICATION_REPORT.md             — NEW
```
