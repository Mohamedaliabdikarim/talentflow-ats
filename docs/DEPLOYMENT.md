# TalentFlow ATS — Deployment

**Status:** Planned. No cloud resources have been provisioned. Provisioning requires the project owner's approval (paid or account-bound resources).

## 1. Target topology

| Component       | Service                                             | Notes                                                    |
| --------------- | --------------------------------------------------- | -------------------------------------------------------- |
| Web app         | Azure App Service, Linux, Node 22 LTS, B1 or higher | Runs `node server.js` from the Next.js standalone output |
| Database + Auth | Supabase hosted project                             | PostgreSQL 17, Auth with email provider                  |
| Optional AI     | Azure OpenAI                                        | Only after the core is verified                          |
| Source + CI     | GitHub (private), GitHub Actions                    | Lint, type-check, unit + DB tests, build on every push   |

## 2. Environment variables

| Name                                                                       | Scope       | Purpose                                                                                                               |
| -------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                                 | public      | Supabase project URL                                                                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                            | public      | Anon (publishable) key; safe for the browser because RLS applies                                                      |
| `SUPABASE_SERVICE_ROLE_KEY`                                                | server only | Provisioning operations; never exposed                                                                                |
| `NEXT_PUBLIC_APP_URL`                                                      | public      | Canonical URL used for auth redirects                                                                                 |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` | server only | Optional AI feature                                                                                                   |
| `INSIGHTS_RUNNER_SECRET`                                                   | server only | Shared secret for `POST /api/insights/run` (Candidate Insights runner, ADR-036); ≥ 16 chars                           |
| `GITHUB_TOKEN`                                                             | server only | Optional fine-grained token (public read) for Candidate Insights GitHub evidence; raises the API rate limit (ADR-038) |

`src/lib/env.ts` validates these at startup. `.env.example` lists names without values.

**Function region (ADR-042):** `vercel.json` pins functions to `dub1` (Dublin), the Vercel region next to the Supabase project in `eu-west-1`; keep the two aligned if either moves. Loading boundaries and parallel reads are in the code; nothing is cached across requests.

**Request-body limits (ADR-041):** CV upload and CV extraction go through Server Actions with `experimental.serverActions.bodySizeLimit = 4400kb` in `next.config.ts`; the application accepts CVs up to 4 MB, under Vercel's 4.5 MB function request cap. Do not raise the body limit above the host's cap. Larger files would need direct-to-Storage uploads.

**Build-time inlining (verified 2026-10-19):** Next.js replaces `process.env.NEXT_PUBLIC_*` with the values present when `next build` runs, in server and client bundles alike. An empty value in `.env.local` is baked in as an empty string and cannot be overridden by App Service settings. Consequences: (1) keep unset `NEXT_PUBLIC_*` lines commented out locally; (2) the GitHub Actions build job must receive the production `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_APP_URL` as repository variables; (3) server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, AI keys) stay runtime-only in App Service application settings.

## 3. Supabase configuration checklist

1. Create project (owner). Record project ref and region.
2. Authentication → URL configuration: Site URL = `https://<app>.azurewebsites.net`; Redirect URLs include `https://<app>.azurewebsites.net/auth/callback` and `http://localhost:3000/auth/callback`.
3. Authentication → Email: enable email provider; disable public sign-ups (users are invited); set minimum password length to 10.
4. Apply migrations: `pnpm supabase:hosted link`, `list-remote`, `dry-run`, then `push` with explicit approval (`docs/SUPABASE_INTEGRATION.md` §6). Done for migrations 0001–0003 on 2026-10-19.
5. Create the first platform admin: `pnpm bootstrap:admin --email <demo-admin-email> --name "<name>" --project-ref <ref>` (dry run), then the same with `--apply --link-file <path>` locally with the service-role key in `.env.local` (requires approval; procedure and rollback in `docs/BOOTSTRAP_ADMIN_PLAN.md`). Credentials are shared privately.

## 4. Azure App Service steps (planned)

1. Resource group, App Service plan (Linux), Web App (Node 22).
2. Application settings = the environment variables above (never set `TALENTFLOW_PREVIEW`; it would expose the synthetic-data preview routes); `WEBSITES_PORT=3000`; `SCM_DO_BUILD_DURING_DEPLOYMENT=false`.
3. Deployment: GitHub Actions workflow builds with pnpm, runs tests, uploads `.next/standalone` + `.next/static` + `public` as the artifact, deploys with `azure/webapps-deploy` using a publish profile stored as a GitHub secret.
4. Health check path: `/api/health`.
5. HTTPS only; minimum TLS 1.2.
6. **Candidate Insights runner (ADR-036):** set `INSIGHTS_RUNNER_SECRET` in application settings and schedule `POST https://<app>/api/insights/run` with header `x-insights-secret: <secret>` and an empty body every 2–5 minutes (an App Service WebJob with a cron schedule, Azure Logic Apps, or any HTTP scheduler). The queueing action already kicks the endpoint immediately; the schedule is what makes a queued analysis durable across restarts and also recovers runs stuck in `analyzing` for more than ten minutes. The endpoint answers 404 to a missing or wrong secret. Keep `NEXT_PUBLIC_APP_URL` set to the public URL: the immediate kick calls it.

## 5. Rollout and rollback

- Rollout: push to `main` → CI → deploy to the production slot (a staging slot is optional on B1 and above with swap).
- Rollback: redeploy the previous successful workflow run artifact (GitHub Actions "Re-run" on the earlier commit) or swap slots back. Database migrations are forward-only; a compensating migration is written if needed.
- Smoke test after deploy: health endpoint, login as demo admin, open an organization, load the pipeline.

## 6. Local development

```
pnpm install
cp .env.example .env.local   # fill in Supabase values
pnpm dev
```

Without a hosted project, `pnpm db:verify` still validates migrations and RLS locally.
