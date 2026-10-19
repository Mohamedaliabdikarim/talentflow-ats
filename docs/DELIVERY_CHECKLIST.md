# TalentFlow ATS — Delivery Checklist

Final delivery package (spec §14). Updated at each phase gate. Nothing is ticked without evidence.

| #   | Artifact                                                                          | Status (2026-10-19)                                            | Evidence / location                                                                                        |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Live application URL (Azure App Service)                                          | Not started — needs owner approval for provisioning            | `docs/DEPLOYMENT.md`                                                                                       |
| 2   | Securely shared admin demo login                                                  | Not started — created after the hosted Supabase project exists | Shared privately, never in the repository                                                                  |
| 3   | Source repository URL (private GitHub)                                            | Local repository only; publishing needs owner approval         | `git log` on `main`                                                                                        |
| 4   | Five-minute demo video URL                                                        | Not started                                                    | `docs/DEMO_SCRIPT.md`                                                                                      |
| 5   | Assumptions and trade-offs note                                                   | Draft                                                          | `docs/ASSUMPTIONS.md`, `docs/DECISIONS.md`                                                                 |
| 6   | Architecture, data isolation, AI workflow, tests, known limitations documentation | Phase 0 versions written                                       | `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/AI_WORKFLOW.md`, `docs/TEST_PLAN.md` |
| 7   | Clear separation of implemented / verified / proposed                             | Maintained                                                     | `docs/PRD.md` status column, `docs/TEST_PLAN.md`, ADR statuses                                             |

## Phase gates

| Phase | Date          | Gate                                                               | Status                             |
| ----- | ------------- | ------------------------------------------------------------------ | ---------------------------------- |
| 0     | 2026-10-19    | Scaffold, docs, schema + RLS, baseline lint/type-check/tests/build | Complete (see `docs/DAILY_LOG.md`) |
| 1     | 2026-10-20    | Auth, roles, provisioning, hosted migrations, access tests         | Pending                            |
| 2     | 2026-10-21    | Organizations, jobs, candidates, applications CRUD                 | Pending                            |
| 3     | 2026-10-22    | Kanban, filters, responsive UI, Motion, E2E                        | Pending                            |
| 4     | 2026-10-23    | Negative security tests, fixes, deployment preparation             | Pending                            |
| 5     | 2026-10-24/25 | Live deployment, smoke tests, optional AI, rehearsal               | Pending                            |
| 6     | 2026-10-26    | Final verification, video, credentials, delivery notes             | Pending                            |
