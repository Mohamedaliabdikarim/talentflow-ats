# TalentFlow ATS — Architecture

**Status:** Phase 0 design. Scaffold, migrations, environment and Supabase client layer, proxy, validation schemas and tests exist; feature code is planned.

## 1. System context

```
+-------------------+        HTTPS         +------------------------------+
|  Browser (user)   | <------------------> |  Next.js 16 (App Router)     |
|  React 19 client  |                      |  Azure App Service (Linux)   |
+-------------------+                      |                              |
                                           |  - Server Components (DAL)   |
                                           |  - Server Actions            |
                                           |  - Route Handlers (/api)     |
                                           |  - proxy.ts (session refresh)|
                                           +------+---------------+-------+
                                                  |               |
                               user-scoped client |               | service-role client
                               (anon key + cookie)|               | (server only, provisioning)
                                                  v               v
                                           +------------------------------+
                                           |  Supabase                    |
                                           |  - Auth (email + password,   |
                                           |    invite links)             |
                                           |  - PostgreSQL + RLS          |
                                           +------------------------------+
                                                  |
                                   optional, gated|
                                                  v
                                 +-------------------------------+
                                 | Azure OpenAI (server only)    |
                                 | GitHub REST API (public data) |
                                 +-------------------------------+
```

## 2. Trust model

| Boundary                              | Trusted?              | Notes                                                                                                                                                                                     |
| ------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser                               | No                    | Sends requests with the Supabase session cookie. Never holds the service-role key. UI state is a convenience, not authorization.                                                          |
| Next.js server                        | Yes, for its own code | Validates input with Zod, re-checks authorization on every privileged action, and talks to Supabase with either the user's session (RLS applies) or the service role (provisioning only). |
| PostgreSQL with RLS                   | Yes, final authority  | Every tenant-owned table is protected by `public.can_access_org(organization_id)`. Platform-admin status is a database row, not a JWT claim.                                              |
| External content (CVs, READMEs, URLs) | No                    | Treated as untrusted data; never interpreted as instructions.                                                                                                                             |

### Two Supabase clients, two purposes

1. **User-scoped client** (`@supabase/ssr`, anon key + cookies). Used by Server Components, Server Actions and the browser. RLS enforces tenant isolation. This is the default.
2. **Service-role client** (server only, `server-only` import guard). Used exclusively for operations that RLS deliberately forbids to end users: creating an organization's first membership, inviting users, granting platform admin, writing certain audit rows. Every such code path first verifies `is_platform_admin()` through the user-scoped client, then performs the privileged write, then records an audit event.

## 3. Application structure (planned)

```
src/
  app/
    login/, auth/callback/, auth/set-password/           public auth routes
    admin/                                              platform admin area
      page.tsx (overview), organizations/, admins/, audit/
    o/[orgSlug]/                                        tenant workspace (customers and admins)
      page.tsx (overview), jobs/, candidates/, pipeline/, members/, settings/
    api/health/route.ts                                 Azure health probe
  proxy.ts                                              session refresh + optimistic redirects
  components/ui/                                        shadcn/ui primitives
  components/                                           app components (nav, kanban, forms)
  lib/
    supabase/{server,client,admin}.ts                   client factories
    env.ts                                              Zod-validated environment
    validation/*.ts                                     shared Zod schemas
  server/
    auth.ts                                             getSession, requireUser, requirePlatformAdmin, requireOrgAccess
    data/*.ts                                           data access layer (DAL), one module per aggregate
    actions/*.ts                                        Server Actions (mutations)
supabase/migrations/                                    SQL migrations (system of record for schema)
scripts/db/                                             local verification tooling (embedded Postgres)
tests/                                                  unit, db (RLS), e2e (Playwright)
```

## 4. Key request flows

### Login

1. `/login` form posts to a Server Action that calls `supabase.auth.signInWithPassword`.
2. `@supabase/ssr` writes the session cookies.
3. The action redirects to `/` which resolves the user's landing page: `/admin` for platform admins, `/o/<slug>` for the single organization of a customer user, or a chooser when several memberships exist.

### Tenant page (for example `/o/acme/pipeline`)

1. `proxy.ts` refreshes the session and redirects unauthenticated requests to `/login` (optimistic check, cookie only).
2. The layout calls `requireOrgAccess(slug)`, which loads the organization through the user-scoped client. If RLS returns no row, the page renders a permission-denied state.
3. Server Components query jobs, candidates and applications with the user-scoped client. RLS guarantees the rows belong to the tenant.
4. Mutations (create job, move stage) are Server Actions that validate input with Zod, re-run `requireOrgAccess`, and write through the user-scoped client. RLS `with check` clauses reject cross-tenant writes even if the action is called with a forged organization id.

### Admin provisioning (create organization and invite user)

1. Server Action validates input and calls `requirePlatformAdmin()` (database-backed check through RLS-protected `platform_admins`).
2. Service-role client inserts the organization, creates the auth user (or generates an invite link) and inserts the membership.
3. An `audit_events` row is written. The invite link is returned once to the admin's screen and never logged.

### Admin acting in a customer workspace

Same routes as customer users. `can_access_org()` returns true for admins, so no separate code path exists. The layout shows an "Acting as platform admin" banner and records `admin.context_entered` once per session and organization.

## 5. Rendering and caching

Cache Components (`cacheComponents`) and partial prefetching are disabled (ADR-003). All tenant pages render dynamically per request. Shared static assets are cached by Next.js. No tenant data is ever cached across users.

## 6. Deployment topology

Azure App Service (Linux, Node 22) runs `next start` from the standalone build. Supabase is hosted. Secrets live in App Service application settings. See `docs/DEPLOYMENT.md`.
