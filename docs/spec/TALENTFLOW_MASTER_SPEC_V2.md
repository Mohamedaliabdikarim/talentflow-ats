# TalentFlow ATS — Master Product, Engineering & Decision Record

**Version:** 2.0  
**Created:** 2026-10-19  
**Target delivery:** 2026-10-26  
**Status:** Planning; implementation and verification pending  
**Language policy:** English throughout the product, source code, comments, documentation, tests, commits, and demo.

> **Purpose:** Build a deployable, secure, polished multi-tenant applicant tracking system (ATS) and preserve a truthful, evidence-based record of product decisions, trade-offs, implementation, and testing. This document is the authoritative working specification for Claude Code. Do not present planned functionality as implemented or verified.

## 1. Mission and delivery philosophy

Deliver a first-customer-ready minimum viable ATS rapidly, with clear role separation, reliable core workflows, strong tenant isolation, usable design, and a transparent engineering trail. Optimize for a complete working vertical slice rather than feature volume. Use AI tools aggressively but validate their output independently.

**Definition of done:** A reviewer can log in as platform admin, create a customer, log in as that customer, create a job, create and associate a candidate, view and move the candidate in a compact Kanban pipeline, filter by job and candidate name, and verify that platform admin can act on behalf of customers. The application is live, documented, and tested. Any AI insights functionality is explicitly optional and must not compromise the core.

## 2. Requirements and acceptance criteria

| ID | Requirement | Acceptance criterion | Priority | Status |
|---|---|---|---|---|
| R01 | Admin creates admin accounts | Authorized admin can securely invite/create another admin; unauthorized users cannot | Must | Planned |
| R02 | Admin creates customer accounts | Authorized admin can provision customer tenant and invite its users | Must | Planned |
| R03 | Customer login | Customer authenticates, can sign out, and sees only authorized tenant context | Must | Planned |
| R04 | Job posting | Customer can create, view, edit, and manage jobs | Must | Planned |
| R05 | Candidate profiles | Customer can add candidate name, relevant contact/profile details, and optional LinkedIn URL | Must | Planned |
| R06 | Candidate/job association | Candidate can be associated with a specific job; association model is explicit | Must | Planned |
| R07 | Compact Kanban | Pipeline shows candidates grouped by stages with clear job context | Must | Planned |
| R08 | Kanban job filter | Selecting a job displays only its candidate applications | Must | Planned |
| R09 | Kanban name filter | Search matches candidate names, including combined job/name filters | Must | Planned |
| R10 | Admin customer operations | Platform admin can perform the same operations within a selected customer context | Must | Planned |
| R11 | Supabase backend | Supabase Auth and PostgreSQL used; RLS protects tenant data | Must | Planned |
| R12 | Live deployment | Publicly reachable Azure-hosted application with functional auth | Must | Planned |
| R13 | Demo access | Dedicated admin demo credentials delivered securely, not in public repository | Must | Planned |
| R14 | Video demo | Approximately five-minute walkthrough showing working flows | Must | Planned |
| R15 | Assumptions | Concise English summary of product assumptions and trade-offs | Must | Planned |
| R16 | Repository | Shareable source repository with setup and architecture instructions | Must | Planned |
| R17 | AI-assisted development | Document AI workflow, human review, tests, and corrections | Must | Planned |
| R18 | AI CV assessment | Simple, evidence-based job-to-CV analysis or clear design explanation | Bonus | Planned |
| R19 | GitHub project insights | Analyze public projects via official API and cite evidence | Bonus | Planned |
| R20 | LinkedIn profile support | Store and open candidate-supplied profile URL; no unauthorized scraping | Must for URL / Bonus for enrichment | Planned |

## 3. Product assumptions — initial proposals, not established facts

1. **Multi-tenancy:** Each customer organization is a separate tenant. Reason: platform admins manage multiple customers while customer data must remain isolated.
2. **Roles:** `platform_admin` and `customer_user`; customer membership is explicit. Avoid trusting client-provided role claims.
3. **Candidate versus application:** A candidate is a person record; an application links a candidate to a job and stores pipeline stage. This allows one candidate to apply to several jobs without duplicating the person record.
4. **Kanban stages:** `New`, `Screening`, `Interview`, `Offer`, `Hired`, `Rejected`. Stages can be simplified if schedule requires; rejected candidates remain visible when appropriately filtered.
5. **Account onboarding:** Invite-based flow is preferred to emailing temporary passwords.
6. **LinkedIn:** Optional URL field and clickable link are in scope. Automatic LinkedIn profile extraction is not assumed available.
7. **GitHub:** Optional public GitHub URL field; enrichment through official public API only.
8. **AI:** Advisory evidence summaries only. A human makes employment decisions; no automatic ranking or rejection.
9. **Demo:** Synthetic candidate data only.
10. **Hosting:** Azure App Service for Next.js; Supabase remains system of record and identity provider.

**Decision requirement:** Confirm or revise each assumption during Phase 0 and record the reason in the decision log.

## 4. Technical architecture

- **Frontend:** Next.js App Router, React, strict TypeScript, Tailwind CSS, shadcn/ui.
- **Interaction and motion:** Motion for React (where compatible), subtle transitions, keyboard-safe interactions, and `prefers-reduced-motion` support.
- **Backend:** Supabase Auth, PostgreSQL, RLS, version-controlled SQL migrations.
- **Server operations:** Next.js server-side handlers/actions for privileged workflows with explicit authorization.
- **Hosting:** Azure App Service, environment configuration, health checks, secure server-side secrets; document deployment and rollback.
- **AI:** Azure OpenAI for optional candidate insights; never call with secret keys from browser.
- **Validation:** Zod for input validation.
- **Testing:** Unit tests, integration/authorization tests, Playwright end-to-end tests.
- **Source control:** GitHub, clear commit history, no secrets.

### Proposed data model

- `organizations`: tenant/customer identity and settings.
- `profiles`: application-level user profile linked to Supabase Auth user.
- `organization_memberships`: user, organization, role, membership status.
- `platform_admins`: explicit platform-wide admin authorization (or equivalent rigorously tested model).
- `jobs`: tenant-owned job posting, title, description, status.
- `candidates`: tenant-owned person profile, contact information, LinkedIn URL, GitHub URL.
- `applications`: tenant-owned link between job and candidate, pipeline stage, timestamps.
- `candidate_ai_insights`: tenant-owned optional analysis output, source references, model metadata, reviewer state.
- `audit_events`: security-sensitive actions such as account provisioning and admin tenant access, without sensitive candidate content in logs.

**Authorization invariants:** Every tenant-owned record has a tenant identifier or an unambiguous tenant derivation. RLS prevents cross-tenant reads and writes. Platform admin authority is validated on the server/database, not merely by UI state. Elevated credentials must never reach the client. Avoid recursive or privilege-escalating RLS policies. Test both positive and negative access cases.

## 5. UX and visual design specification

Design a premium, professional recruitment SaaS—not a generic template. The complete website must be in English.

**Pages:** Login, Admin Overview, Organizations, Organization Workspace, Jobs, Candidates, Kanban Pipeline, Candidate Details, Settings, and a clearly marked optional AI Insights panel.

**Experience principles:**
- Responsive sidebar and compact top navigation; mobile-friendly forms and cards.
- Clear primary actions: `Create Organization`, `Invite User`, `Post Job`, `Add Candidate`.
- Compact candidate cards showing name, job, stage, and optional source links.
- Accessible filtering by job and name; filters combine correctly and show empty-state explanations.
- Useful loading, success, error, empty, and permission-denied states.
- Motion animations only where they improve orientation: page transitions, modal entrances, card movement, and status changes. Avoid gratuitous animation.
- Respect reduced-motion settings, keyboard access, focus management, contrast, and semantic labels.
- Prefer genuine functionality over decorative mock buttons.

## 6. AI Candidate Insights — optional, gated enhancement

### User journey

A recruiter opens a candidate profile, optionally attaches a CV or adds candidate-provided professional information, and may supply GitHub and LinkedIn URLs. After an explicit `Generate Insights` action, the server gathers permitted evidence, sends only necessary content to Azure OpenAI, and displays a structured summary linked to a selected job. The recruiter reviews the findings; the application does not decide who should be hired.

### GitHub enrichment

- Accept an optional GitHub profile URL and validate host/format.
- Use the **official GitHub REST API** for public repositories, descriptions, primary languages, selected README files, and relevant metadata.
- Handle API rate limits, missing accounts, deleted repos, large files, and network failures.
- Prefer selected representative repositories over downloading entire repositories.
- Attribute evidence to exact public repository URLs and distinguish self-authored work from uncertain contributions.
- Do not infer years of employment, ownership, or proficiency solely from repository existence or language percentages.

### LinkedIn handling

- Store a candidate-supplied LinkedIn URL and render it as a safe clickable external link.
- **Do not scrape LinkedIn**, bypass login, automate prohibited access, or assume a general-purpose LinkedIn API is available.
- If authorized profile data is provided by the candidate or through an approved integration, treat it as a separate, consented input and document provenance.
- Where profile extraction is unavailable, show `LinkedIn profile provided — manual review required` rather than inventing experience.

### CV analysis

- Analyze CV content only when the user is authorized and there is a documented lawful basis for processing.
- Compare explicit evidence with job requirements; produce strengths, relevant projects, missing information, and source citations.
- Separate `supported`, `uncertain`, and `not provided` findings.
- Avoid protected-trait inference, personality speculation, automatic candidate ranking, and automatic rejection.
- Make AI output editable/reviewable by a human; disclose limitations.
- Protect against prompt injection in CVs, GitHub READMEs, and external content. Treat all external text as untrusted data.
- Minimize personal data, set retention/deletion rules, avoid logging raw CV content, and document applicable privacy requirements before processing real applicants.
- Test tenant isolation for insights, invalid URLs, timeouts, empty evidence, and model failures.

### AI output contract (proposal)

`summary`, `job_relevant_evidence[]`, `github_projects[]`, `unknowns[]`, `source_urls[]`, `human_review_required`, `generated_at`, `model_version`. Validate output against a server-side schema. Do not present AI guesses as verified facts.

### Delivery gate

Do not implement AI enrichment until all mandatory ATS features pass functional and tenant-isolation tests and the live deployment path is viable. If time is short, document the architecture and demonstrate a small mocked *explanation* clearly labeled as not implemented, rather than pretending a feature works.

## 7. Claude Code operating instructions

Claude Code is responsible for technical execution: repository inspection, setup, package installation, source implementation, migrations, tests, documentation, and deployment preparation. The project owner approves significant architectural decisions, credentials access, paid cloud provisioning, production deployment, and external publication.

1. Inspect available skills, subagents, MCP servers, and integrations. Record what is actually available in `docs/TOOLING_INVENTORY.md`.
2. Use **every relevant** capability, especially design, Motion, accessibility, Supabase, Azure, security, and testing. Do not blindly invoke unrelated skills.
3. Read this document and `CLAUDE.md` at the start of each significant phase.
4. Maintain one source of truth for requirement status and evidence.
5. Implement small, verifiable increments; run lint, type-check, build, and relevant tests.
6. Report files changed, commands run, results, unresolved risks, and next action.
7. Never fabricate test results, screenshots, deployed URLs, or completed features.
8. Do not ask the project owner to run routine commands; execute them yourself where tooling permits.
9. Never commit secrets, demo passwords, or private applicant data.
10. Stop for approval before irreversible changes, paid resources, production deploys, or exposing a repository publicly.
11. Keep all source code, UI strings, comments, docs, test names, commits, and demo material in English.
12. Document non-obvious code using concise JSDoc/TSDoc; explain **why**, not what is obvious from syntax.

## 8. Required documentation set

Claude must create and maintain these files in English:

- `README.md` — overview, local setup, architecture summary, test/deployment instructions.
- `CLAUDE.md` — persistent implementation instructions.
- `docs/PRD.md` — user stories, requirements, acceptance criteria.
- `docs/ARCHITECTURE.md` — system boundaries, data flows, trust model.
- `docs/DATABASE.md` — schema, migrations, RLS and access matrix.
- `docs/DESIGN.md` — visual system, page inventory, accessibility and Motion guidance.
- `docs/SECURITY.md` — threat model, authorization and privacy safeguards.
- `docs/AI_FEATURE.md` — GitHub, LinkedIn, CV processing and model limitations.
- `docs/DEPLOYMENT.md` — Azure configuration, secrets, rollout, rollback.
- `docs/TEST_PLAN.md` — test cases and verified results.
- `docs/TOOLING_INVENTORY.md` — discovered skills, tools, availability, selection rationale.
- `docs/AI_WORKFLOW.md` — how AI helped and how output was reviewed.
- `docs/DECISIONS.md` — chronological engineering decisions.
- `docs/DAILY_LOG.md` — progress, blockers, changes, evidence.
- `docs/ASSUMPTIONS.md` — assumptions and why they were necessary.
- `docs/DEMO_SCRIPT.md` — timed five-minute demo.
- `docs/DELIVERY_CHECKLIST.md` — final artifacts and evidence links.

## 9. Seven-day execution plan

| Date | Phase | Required evidence |
|---|---|---|
| Oct 19 | Phase 0: initialize, skills inventory, architecture, PRD, UI direction | Repo scaffold, docs, baseline build output |
| Oct 20 | Phase 1: schema, Auth, roles, tenant RLS, admin provisioning | SQL migrations, admin/customer access tests |
| Oct 21 | Phase 2: organizations, jobs, candidates, applications | CRUD workflows, integration tests |
| Oct 22 | Phase 3: Kanban, job/name filters, responsive UI and Motion | E2E tests, UI screenshots, accessibility review |
| Oct 23 | Phase 4: negative security tests, bug fixes, Azure deployment preparation | Authorization matrix, build/test reports |
| Oct 24–25 | Phase 5: live deployment, smoke tests, optional AI insights, demo rehearsal | Live URL, test records, optional AI evidence |
| Oct 26 | Phase 6: final verification, five-minute video, credentials and delivery notes | Repo URL, video URL, private admin access, assumptions summary |

**Contingency:** If behind schedule, cut AI enrichment and decorative motion before cutting required account, jobs, candidates, Kanban, filters, admin, security, or deployment workflows.

## 10. Test matrix — minimum required

- Admin creates a customer and another admin through authorized server-side flows.
- Customer signs in and creates/edits a job.
- Customer adds a candidate with a valid LinkedIn URL.
- Candidate is associated with a job and appears in Kanban.
- Moving a candidate between stages persists after refresh.
- Job filter works; name filter works; combined filters work.
- Admin switches customer context and performs customer operations.
- Customer A cannot read/update/delete Customer B's jobs, candidates, applications, or AI insights by manipulating requests or identifiers.
- Non-admin cannot invoke account-provisioning operations.
- Unauthenticated access to protected pages/APIs is denied.
- Invalid URLs and malformed form inputs are handled safely.
- Azure environment and Supabase Auth redirects work in deployed environment.
- Optional GitHub integration handles API errors and rate limits.
- Optional AI output has provenance, human-review disclosure, and safe failure handling.

**Evidence rule:** Record command, environment, date, pass/fail, and link to relevant test output or commit. Never mark a test passed solely because code exists.

## 11. Decision journal — append entries as work progresses

Use this exact template for every material choice:

```markdown
### ADR-XXX — [Decision title]
- Date:
- Context / problem:
- Options considered:
- Chosen approach:
- Why this approach:
- Trade-offs / risks:
- Security and privacy implications:
- Implementation reference (files/commit):
- Verification evidence:
- Status: Proposed | Approved | Implemented | Verified | Superseded
```

**Initial decisions to evaluate, not retroactively claim:**
- Supabase is mandated as backend; Azure provides hosting and optional AI services.
- Candidate and application are separate entities to support multiple jobs.
- Tenant isolation belongs in PostgreSQL RLS.
- LinkedIn is a profile URL, not an unauthorized scraping target.
- GitHub evidence is retrieved from the official API, not inferred from unsupported sources.
- AI summaries are advisory, cite evidence, and require human review.
- Motion is used sparingly with reduced-motion support.

## 12. Daily engineering log template

```markdown
## YYYY-MM-DD
**Goal:**
**Work completed (verified):**
**Files/commits:**
**AI tools/skills used and why:**
**Human decisions and reasoning:**
**Tests run and exact results:**
**Security/privacy review:**
**Issues, risks, and compromises:**
**Next actions:**
```

## 13. Five-minute demo plan

- **0:00–0:35:** Explain product goal, stack, and customer-first approach.
- **0:35–1:25:** Log in as admin; create or show a customer; explain role boundaries.
- **1:25–2:10:** Enter customer workspace; create a job.
- **2:10–3:05:** Add a candidate, LinkedIn URL, optional GitHub URL, and associate with the job.
- **3:05–3:55:** Demonstrate Kanban, stage changes, and combined filters.
- **3:55–4:25:** Show admin acting for a customer and briefly describe RLS protections.
- **4:25–4:50:** If implemented, show evidence-based AI Insights; otherwise describe the proposed design honestly.
- **4:50–5:00:** Summarize trade-offs, testing, and live deployment.

All spoken content and screen text should be in English. Rehearse and shorten as needed to stay within approximately five minutes.

## 14. Final delivery package

- Live application URL.
- Securely shared admin demo login (never in a public README or recording).
- Source repository URL.
- Approximately five-minute demo video URL.
- Short assumptions and trade-offs note.
- Documentation of architecture, data isolation, AI workflow, tests, and known limitations.
- Clear separation of implemented, verified, and proposed features.

### Draft assumptions note (update after actual implementation)

> The application is designed as a multi-tenant ATS where each customer organization manages its own jobs, candidates, and applications. Candidates are modeled separately from applications so the same person can be associated with more than one job. The Kanban board displays applications by pipeline stage and supports combined job and candidate-name filtering. Platform admins can manage customer workspaces through explicit authorization. LinkedIn links are stored for manual review; automated LinkedIn scraping is intentionally excluded. Optional GitHub insights use publicly accessible repository information through the official API. Any AI-generated candidate insights are advisory, evidence-linked, and subject to human review. The project prioritizes secure core workflows and deployability over speculative features. All statements about implementation and testing will be updated to reflect verified results.

## 15. Initial Claude Code instruction

```text
Read TALENTFLOW_MASTER_SPEC_V2.md in full and treat it as the authoritative living specification. Inspect the workspace and discover available skills, agents, MCP tools, and integrations; record which are available and which are relevant. Perform Phase 0 autonomously: initialize the Next.js project if needed, install dependencies, establish documentation, define schema and RLS approach, plan the UI and Motion usage, and verify the baseline lint/type-check/build. Keep every project artifact in English. Update the decision journal and daily log with genuine evidence. Do not claim implementation or test success without verification. Do not ask me to perform routine technical tasks. Do not provision paid resources, use credentials, publish repositories, or deploy production changes without approval. Stop after Phase 0 and provide a concise evidence-based report and decisions requiring approval.
```

---

**Document integrity rule:** This is a living record. Changes to requirements, assumptions, architecture, and scope must be dated and justified. Preserve decision history; do not rewrite earlier reasoning to make the final outcome appear inevitable.
