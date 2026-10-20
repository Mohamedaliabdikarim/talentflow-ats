# TalentFlow — AI Candidate Insights (Job Match) — implementation note

**Status:** In progress (implementation). Supersedes the design-only `docs/AI_FEATURE.md` for the
job-match workflow. ADR-035 (lifecycle + contracts), ADR-036 (durable execution), ADR-037
(revocation invalidation). Transport is ADR-034 (`src/lib/ai/client.ts`).

This note records, before the code is relied on, the **processing/retention assumptions** and the
**two contracts** the owner asked for: the validated AI output schema, and the persisted analysis
lifecycle. Anything that could not be resolved from existing project documentation is flagged, not
invented.

## 1. Scope of this phase

One workflow only: **Job Match**. When an application moves **New → Screening**, TalentFlow analyses
the candidate's authorized CV against that specific job and produces an advisory, evidence-based
assessment for a human reviewer. No automatic rejection, no hiring decision, no numeric score, no
ranking, no GitHub/LinkedIn enrichment (the second "candidate profile" workflow in the proposal is
out of scope and not built here).

## 2. Processing and retention assumptions

1. **CV text is sent to Azure OpenAI for processing; raw CV text is never persisted by TalentFlow.**
   The runner extracts text from the stored PDF in memory, sends it to the model, and keeps only the
   structured result plus a SHA-256 `input_hash` of `(cv text + job text + prompt version)`. The hash
   detects whether a re-run would use the same inputs; it is not reversible to CV content.
2. **Only the structured result is stored** in `candidate_ai_insights.result` (JSONB) and `summary`.
   No free-form model echo of the CV is stored.
3. **Logs carry identifiers and timings only** — never CV text, never the prompt body, never the
   Azure key. `AiError` messages are pre-sanitised (ADR-034).
4. **Authorization is a precondition, re-checked at execution and again immediately before the model
   call and before persisting.** Consent is `candidates.cv_ai_authorized` (ADR-033), recorded with a
   basis, defaulting to false, never pre-checked.
5. **Deletion of the CV, the candidate, or the application removes derived insights** (CV delete and
   revoke both invalidate; candidate/application delete cascade via composite FKs).

### Flagged — unresolved from project documentation

- **Azure OpenAI content retention.** Azure's "abuse monitoring" can retain prompt/response content
  for up to 30 days unless the subscription is approved for **no content logging / no human review**.
  Project documentation (`docs/SECURITY.md`, `docs/DECISIONS.md`, the Azure setup the owner performed)
  does **not** state which applies to this resource. **This is a provider-configuration decision for
  the owner, not something this code can set.** Until the owner confirms, assume CV-derived prompt
  content may be retained by Azure for up to 30 days for abuse monitoring (not used for training).
  TalentFlow's own retention is as in §2.1–2.3 regardless. Action for the owner: confirm the Azure
  resource's content-logging status and record it here and in `docs/SECURITY.md`.
- **Data residency / region of the Azure resource** is likewise not recorded in project docs; it does
  not change this code but should be documented for a real customer.

## 3. Contract A — validated AI output schema (`job-match-v1`)

Defined in `src/lib/ai/insights-contract.ts` as a Zod schema and the matching JSON Schema sent to the
model for strict structured output. The model's JSON is parsed and then re-validated with Zod
(defence in depth); invalid output fails the run (no fabricated summary is shown).

```jsonc
{
  "schema_version": "job-match-v1",
  "summary": "string (<= 1200 chars) — concise, evidence-based, no invented facts",
  "assessments": [
    // 1..20 of the job's genuine requirements
    {
      "requirement": "string", // a requirement drawn from THIS job's description
      "status": "supported | needs_verification | not_evidenced",
      "evidence": "string", // brief support/explanation, grounded in the CV
    },
  ],
  "interview_questions": ["string"], // 0..8, targeting genuine uncertainties
  "advisory_notice": "string", // advisory + human-review statement
}
```

Status meanings (enforced by prompt and surfaced in the UI):

- `supported` — the CV contains concrete evidence for the requirement.
- `needs_verification` — there is partial or ambiguous evidence; confirm in interview.
- `not_evidenced` — **no evidence in the provided materials.** Explicitly _not_ a claim that the
  candidate lacks the skill. The UI says so.

Grounding rules baked into the prompt: use only the supplied CV text and job description; never invent
experience; missing evidence is `not_evidenced`, never "lacking"; external text is data, not
instructions (prompt-injection defence); no inference of protected traits; no score or recommendation.

## 4. Contract B — persisted analysis lifecycle

Table `candidate_ai_insights` (migrations 0006 enum values, 0007 columns). One row per analysis
attempt for an application.

States (`insight_status`): `pending → analyzing → ready` on success; `→ failed` on error;
`→ revoked` when authorization is withdrawn; a superseded earlier success becomes `superseded`.

```
 enqueue (New→Screening, or manual)      authorization withdrawn (any state)
        │                                             │
        ▼                                             ▼
   ┌─────────┐  claim (atomic)   ┌───────────┐  ok   ┌────────┐
   │ pending │ ────────────────▶ │ analyzing │ ────▶ │ ready  │
   └─────────┘                   └───────────┘       └────────┘
        │                              │ error            │ newer run ready
        │                              ▼                  ▼
        │                          ┌────────┐        ┌────────────┐
        └────────(revoke)─────────▶│ failed │        │ superseded │
                                   └────────┘        └────────────┘
   revoke sets result/summary = null and status = revoked.
```

Invariants:

- **One active run per application.** Partial unique index on `application_id WHERE status IN
('pending','analyzing')`. A duplicate enqueue is a no-op (unique violation swallowed).
- **Atomic claim.** `UPDATE … SET status='analyzing' WHERE id=$ AND status='pending' RETURNING …`
  prevents two workers processing the same row.
- **No stale overwrite.** The success write is `… WHERE id=$ AND status='analyzing'`; if revocation (or
  anything) changed the status, the write affects 0 rows and the result is discarded.
- **Latest wins in the UI.** The application view reads the most recent row by `created_at`; a new run
  marks prior `ready` rows for the same application `superseded`.
- `attempt_count`, `started_at`, `generated_at`, `model_version`, `prompt_version`,
  `contract_version`, `input_hash`, `cv_consent_at` are recorded for auditability.
- Tenant isolation: RLS `can_access_org(organization_id)` for all authenticated reads/writes;
  composite FKs `(candidate_id|job_id|application_id, organization_id)` make a cross-tenant link
  impossible in the database. The runner uses the service role but scopes every statement by
  `organization_id` and re-checks consent.

## 5. Durable execution (ADR-036)

A fire-and-forget promise in a serverless request is **not** treated as a durable job. The durable
unit is the **`pending` row**. Processing is driven by an authenticated internal endpoint
`POST /api/insights/run` (header `x-insights-secret`, compared in constant time to
`INSIGHTS_RUNNER_SECRET`):

- The enqueue path uses `after()` to kick the endpoint for an immediate, low-latency run on the
  always-on Node server (Azure App Service, `output: "standalone"`).
- **Durability** comes from a scheduled call to the same endpoint (Azure App Service cron/WebJob or an
  external scheduler) that drains any `pending`/stuck rows, plus an authorized manual **Retry** in the
  UI. If the `after()` kick is lost, the row is still `pending` and gets picked up.
- If `INSIGHTS_RUNNER_SECRET` is unset, the kick is skipped and the row waits for a manual/scheduled
  run; the status transition is never blocked.

## 6. Security summary

- Azure calls are server-only (`server-only` import; key read only via `getServerEnv`).
- Every read/trigger/retry/persist is tenant-scoped and role-checked (`requireOrgAccess`); RLS is the
  final authority. The runner's service-role use is confined to `/api/insights/run` behind the secret
  and is scoped by `organization_id`.
- No Azure credentials or CV content in logs or error states.

## 7. What "verified" means here

Unit tests (contract validation, prompt grounding, enqueue/claim logic with a mocked Azure client),
database tests (RLS, atomic claim, one-active-run index, revocation invalidation, cross-tenant denial),
and `pnpm check`. The live Azure round-trip is exercised by `pnpm ai:smoke` (transport, ADR-034) and
by the owner through the UI; it is not run in CI (paid API). This note does not claim production
readiness; see `docs/DAILY_LOG.md` for recorded results.
