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
