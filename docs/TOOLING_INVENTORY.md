# TalentFlow ATS — Tooling Inventory

Inventory taken 2026-10-19 on the development machine (Windows 11, Claude Code with Fable 5.1). "Used" means used in Phase 0; "Planned" means relevant for a later phase; "Not relevant" is recorded so nothing is invoked blindly.

## 1. Command-line tools

| Tool              | Version / state                                   | Relevance                                                | Status                                                   |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Node.js           | 22.16.0                                           | Runtime for Next.js, tests, scripts                      | Used                                                     |
| pnpm              | 10.17.1                                           | Package manager (ADR-002)                                | Used                                                     |
| npm / npx         | 10.9.2                                            | Registry lookups, one-off scaffolding                    | Used                                                     |
| git               | 2.51.0                                            | Source control; repository initialised locally on `main` | Used                                                     |
| GitHub CLI (`gh`) | 2.95.0, authenticated as the owner's account      | Creating the private repository and CI secrets later     | Planned (needs approval to publish)                      |
| Supabase CLI      | 2.121.0 via `pnpm exec supabase` (dev dependency) | `db push`, `gen types` against a hosted project          | Planned (needs project credentials)                      |
| Python            | 3.12.10                                           | Runs the UI/UX skill search script                       | Used                                                     |
| Azure CLI (`az`)  | Not installed                                     | Resource provisioning                                    | Not available; portal or a later install, after approval |
| Docker            | Not installed                                     | `supabase start` local stack                             | Not available; replaced by embedded PostgreSQL (ADR-010) |
| yarn              | Not installed                                     | —                                                        | Not relevant                                             |

## 2. Claude Code skills

| Skill                                                                                                                                             | Relevance to this project                                       | Decision                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ui-ux-pro-max` (design intelligence: styles, palettes, typography, UX rules, stack notes)                                                        | Visual direction, accessibility checklist, Kanban/form UX rules | Used in Phase 0 (design-system search, persisted to `design-system/talentflow/MASTER.md`); UX rule lookups planned for Phase 3 |
| `ui-ux-pro-max:ui-styling` (shadcn/ui + Tailwind patterns)                                                                                        | Component styling and theme                                     | Planned for Phase 2–3                                                                                                          |
| `ui-ux-pro-max:design-system` (token architecture)                                                                                                | Token layering                                                  | Partially applied (tokens in `globals.css`)                                                                                    |
| `dataviz`                                                                                                                                         | Charts on the admin overview, if any                            | Planned, low priority                                                                                                          |
| `code-review`, `simplify`, `security-review`                                                                                                      | Review passes before each phase gate                            | Planned (security-review before Phase 4 report)                                                                                |
| `run`                                                                                                                                             | Launch the app for screenshots and smoke checks                 | Planned (Phase 3+)                                                                                                             |
| `artifact-design` / `artifact-*`                                                                                                                  | Shareable HTML pages                                            | Not relevant to the product; may be used for a report                                                                          |
| `anthropic-skills:docs`, `docx`, `pptx`, `xlsx`, `pdf`                                                                                            | Office documents                                                | Not relevant (documentation lives in the repository as Markdown)                                                               |
| `anthropic-skills:deep-research`                                                                                                                  | Multi-source research                                           | Not needed; package docs are bundled locally                                                                                   |
| `ui-ux-pro-max:banner-design`, `brand`, `slides`, `design` (logo/CIP generation)                                                                  | Marketing assets                                                | Not relevant for the ATS; a simple wordmark is sufficient                                                                      |
| `init`, `update-config`, `keybindings-help`, `plugin-*`, `loop`, `schedule`, `morning`, `import-memory`, `claude-api`, `fewer-permission-prompts` | Harness configuration / unrelated                               | Not relevant                                                                                                                   |

## 3. Agents (subagent types)

| Agent                        | Relevance                          | Decision                                                            |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `Explore`                    | Read-only codebase sweeps          | Not needed in Phase 0 (greenfield); may help in later review passes |
| `Plan`                       | Implementation planning            | Not needed; plan is in this documentation set                       |
| `general-purpose` / `claude` | Multi-step delegated tasks         | Reserved for parallelisable work in Phase 2–3 if the owner asks     |
| `claude-code-guide`          | Questions about Claude Code itself | Not relevant                                                        |
| `statusline-setup`           | Terminal UI                        | Not relevant                                                        |

## 4. MCP servers and integrations

| Integration                                                | State                                    | Relevance                                                   | Decision                                                 |
| ---------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Claude in Chrome (`mcp__claude-in-chrome__*`)              | Available                                | Manual E2E verification, screenshots, GIF evidence of flows | Planned for Phase 3 and 5 (deployed smoke test)          |
| VS Code diagnostics (`mcp__claude-vscode__getDiagnostics`) | Available                                | Surface TypeScript/ESLint issues in the editor              | Used ad hoc                                              |
| Claude Docs (`mcp__claude_ai_Claude_Docs__*`)              | Available                                | Living documents                                            | Not used; repository Markdown is the record of truth     |
| Figma, Gmail, Google Calendar, Google Drive connectors     | Require OAuth authorisation by the owner | Figma could host mockups; none are needed for delivery      | Not used                                                 |
| Supabase MCP server                                        | Not configured                           | Would allow direct SQL against the hosted project           | Not needed; migrations are applied with the Supabase CLI |
| Azure MCP server                                           | Not configured                           | Resource provisioning                                       | Not needed in Phase 0; provisioning is approval-gated    |

## 5. Project dependencies selected in Phase 0

| Package                                                                                                                               | Version                   | Purpose                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------- |
| next, react, react-dom                                                                                                                | 16.4.2 / 19.3.0           | Framework                               |
| typescript                                                                                                                            | 5.9.3 (strict)            | Language                                |
| tailwindcss, @tailwindcss/turbopack                                                                                                   | 4.3.3                     | Styling                                 |
| shadcn (CLI + `shadcn/tailwind.css`), radix-ui, cn, class-variance-authority, lucide-react, tw-animate-css, cmdk, sonner, next-themes | shadcn 4.22.1             | UI primitives (Radix base, Nova preset) |
| motion                                                                                                                                | 14.4.0                    | Motion for React                        |
| @supabase/supabase-js, @supabase/ssr                                                                                                  | 2.118.0 / 0.12.7          | Auth + database access                  |
| zod                                                                                                                                   | 4.6.7                     | Validation                              |
| vitest, @vitejs/plugin-react, jsdom, @testing-library/react, @testing-library/jest-dom                                                | 5.0.5                     | Unit and database tests                 |
| @playwright/test                                                                                                                      | 1.64.1                    | End-to-end tests                        |
| embedded-postgres, pg, @types/pg                                                                                                      | 17.10.0-beta.17 / 8.23.1  | Local migration and RLS verification    |
| supabase (CLI)                                                                                                                        | 2.121.0                   | Migrations against the hosted project   |
| prettier, tsx, eslint, eslint-config-next                                                                                             | 3.9.10 / 4.23.15 / 9.39.5 | Formatting, scripts, linting            |
