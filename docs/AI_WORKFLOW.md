# TalentFlow ATS — AI-assisted development workflow

This document records how AI tooling (Claude Code with Fable 5.1) is used on this project and how its output is reviewed. It is updated per phase.

## 1. Division of responsibility

| Activity                                                     | AI (Claude Code)                          | Human (project owner)          |
| ------------------------------------------------------------ | ----------------------------------------- | ------------------------------ |
| Environment inspection, scaffolding, dependency installation | Executes                                  | Reviews report                 |
| Architecture, schema, RLS design                             | Proposes and implements                   | Approves significant decisions |
| Documentation and decision journal                           | Drafts with evidence                      | Reviews                        |
| Tests                                                        | Writes and runs; records exact results    | Spot-checks evidence           |
| Credentials, cloud provisioning, deployment, publishing      | Prepares, never executes without approval | Approves and provides access   |
| Hiring decisions in the product                              | Never                                     | Always (product principle)     |

## 2. Review rules applied to AI output

1. Nothing is marked implemented or verified without a command that was actually run and whose output is recorded.
2. Generated SQL is applied to a real PostgreSQL instance and exercised with positive and negative tests before it is trusted.
3. Generated UI is checked against the accessibility checklist in `docs/DESIGN.md`.
4. Security-sensitive code (auth guards, service-role usage, RLS) gets a dedicated review pass and negative tests.
5. Third-party docs bundled with the installed packages (for example `node_modules/next/dist/docs`) take precedence over model memory when they disagree.

## 3. Tools and skills used in Phase 0

| Tool / skill                         | Purpose                                                  | Outcome                                                     |
| ------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------- |
| `ui-ux-pro-max` design-system search | Initial visual direction, accessibility checklist        | Partially adopted; overrides documented in `docs/DESIGN.md` |
| `create-next-app`, `shadcn` CLI      | Scaffold                                                 | Adopted                                                     |
| Bundled Next.js 16 docs              | Verified proxy convention and Cache Components semantics | Led to ADR-003                                              |
| Embedded PostgreSQL                  | Local verification of migrations and RLS                 | See `docs/TEST_PLAN.md`                                     |

## 4. Corrections made to AI output in Phase 0

- The design-system search proposed a marketing "funnel" page pattern and Google-hosted fonts for an authenticated dashboard; both were rejected with reasons.
- The first `shadcn init` attempts used flags from an older CLI version (`--src-dir`, `-b <color>`) and then hit an interactive preset prompt; corrected after reading `--help` and passing `-b radix -p nova`.
- `create-next-app` enabled Cache Components; disabled after reading the bundled authentication guide (ADR-003).
- Long heredoc-based file writes were silently truncated by the shell tool; detected through parse errors, files were re-written with a file tool and verified by listing.

See `docs/DAILY_LOG.md` for the dated record.

## 5. Phase 1 (2026-10-19, after the Phase 0 approvals)

**Tools and skills used:** official `supabase` and `supabase-postgres-best-practices` skills (installed from `supabase/agent-skills`, reviewed before install and before commit); `claude mcp add` for the read-only Supabase MCP server (OAuth left to the owner); `gh` for the private repository; Playwright for the E2E smoke suite; embedded PostgreSQL for the RLS suite and for generating the typed client.

**Corrections made to AI output in Phase 1:**

- CI run #1 failed on a clean checkout: the root layout used the Next-generated `LayoutProps` global, which only exists after a build. Replaced with an explicit prop type and recorded as a convention in `CLAUDE.md`.
- `supabase gen types --db-url` exited without output (no Docker); a small catalog-based generator was written instead (ADR-020) rather than hand-typing the schema.
- The first `shadcn`-style CLI assumption repeated itself with `npx skills`: flags were taken from `--help` instead of memory.
- `FormData.get()` returns `null` for absent fields; the Zod normaliser only handled empty strings. Caught by the admin-action unit tests, fixed in `emptyToUndefined()` and covered by a new validation test.
- A database assertion read every organization, so a second test file's seed data leaked in depending on execution order (one run green, one red). Assertions are now scoped to the file's own ids; the suite was run twice to confirm order independence.
- An enum `order by` assumed alphabetical order; PostgreSQL orders enums by definition order. Fixed with a `::text` cast in the test.

**Corrections during the landing-page work:** a constant exported from a `"use client"` module was imported into a Server Component and arrived as a client reference (runtime error); moved to a plain data module. Scroll-reveal animations server-rendered their hidden state, which blanked sections in full-page captures and for no-JavaScript visitors; fixed with a `<noscript>` fallback. The accessibility test sampled colours mid-animation on CI; fixed by waiting for animations to settle.
