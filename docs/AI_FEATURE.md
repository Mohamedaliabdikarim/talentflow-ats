# TalentFlow ATS — AI Candidate Insights (optional, gated)

**Status:** Not implemented. Design only. The feature is implemented only after all mandatory ATS features pass functional and tenant-isolation tests and the deployment path is viable (spec §6, delivery gate).

## 1. Purpose

Give a recruiter an evidence-linked summary of how a candidate's provided material relates to a selected job. The output is advisory. A human reviews it and makes every decision.

## 2. Inputs and provenance

| Source                   | How it enters                                                                                                       | Trust          | Stored?                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| Candidate profile fields | Entered by the recruiter                                                                                            | Untrusted text | Yes (candidates table)                                                  |
| CV text                  | Pasted or uploaded by the recruiter with a confirmation that there is a lawful basis                                | Untrusted text | Not stored raw; only the structured result and a hash of the input      |
| GitHub public profile    | Candidate-supplied URL → official GitHub REST API (`/users/{login}`, `/users/{login}/repos`, selected README files) | Untrusted text | Repository URLs and summaries only                                      |
| LinkedIn                 | Candidate-supplied URL only                                                                                         | n/a            | URL only; shown as "LinkedIn profile provided — manual review required" |

LinkedIn is never scraped, automated or accessed behind login. GitHub data is retrieved only through the official public API, with rate-limit handling, and evidence is attributed to exact repository URLs. Repository existence or language percentages are never turned into claims about years of experience, ownership or proficiency.

## 3. Processing flow (planned)

1. Recruiter opens a candidate, selects a job and presses **Generate insights**.
2. Server Action validates input, runs `requireOrgAccess()`, and creates a `candidate_ai_insights` row with status `pending`.
3. Server collects permitted evidence (profile fields, pasted CV text, GitHub API results), truncates to a budget, and wraps every external text in delimited data blocks with an instruction that the content is data, not instructions.
4. Server calls Azure OpenAI with a structured-output schema. The key never leaves the server.
5. The response is validated with Zod against the output contract. Invalid output → status `failed`, error shown with retry.
6. The row is updated with `result`, `source_urls`, `model_version`, `prompt_version`, `generated_at`, `human_review_required = true`.
7. UI renders the summary with sections **Supported**, **Uncertain**, **Not provided**, each item citing its source. A reviewer can mark it reviewed or delete it.

## 4. Output contract

```json
{
  "summary": "string",
  "job_relevant_evidence": [
    { "claim": "string", "support": "supported | uncertain | not_provided", "source": "string" }
  ],
  "github_projects": [
    {
      "name": "string",
      "url": "https://github.com/...",
      "why_relevant": "string",
      "authorship": "self | uncertain"
    }
  ],
  "unknowns": ["string"],
  "source_urls": ["string"],
  "human_review_required": true,
  "generated_at": "ISO-8601",
  "model_version": "string"
}
```

## 5. Guardrails

- No inference of protected traits, personality, age, nationality or health.
- No ranking, scoring or automatic rejection. The UI never sorts candidates by AI output.
- Prompt injection: external text is data; model output is never executed; URLs in output are validated against the collected source list before rendering.
- Failure handling: timeouts (30 s), rate limits, empty evidence, model errors produce explicit states with retry, never a fabricated summary.
- Tenant isolation: insights are tenant-owned rows under the same RLS predicate; tests must prove a user in another organization cannot read them.
- Data minimization: raw CV text is not persisted; logs contain identifiers and timings only.

## 6. If time runs out

The UI shows a clearly labelled **Not implemented** panel that explains the proposed design. No mocked output is presented as a working feature.
