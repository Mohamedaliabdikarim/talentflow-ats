# TalentFlow ATS — Design System and UX

**Status:** Phase 0 direction. Tokens are defined; components and pages are planned. The UI/UX skill output used as input is preserved in `design-system/talentflow/MASTER.md`; this document records what was adopted and what was deliberately overridden.

## 1. Direction

A calm, precise recruiting workspace. Flat surfaces, strong typographic hierarchy, dense spacing suited to a dashboard, one brand hue, and motion only where it explains a change of state or position.

**Adopted from the design-system search:** flat style, dashboard density (8/10), subtle motion (3/10), the accessibility checklist, and the anti-patterns (hidden filters, outdated forms).

**Overridden, with reason:**

- _Pattern "Funnel (3-step conversion)"_ is a marketing-page pattern; the product is an authenticated application, so navigation follows a sidebar + workspace model instead.
- _Sky-blue palette (#0369A1 on #F0F9FF)_ reads as a generic dashboard template. The product uses an indigo brand hue on warm neutral surfaces for a more distinctive feel while keeping contrast ≥ 4.5:1.
- _Poppins / Open Sans from Google Fonts_ would add a third-party font request at runtime. Geist Sans and Geist Mono are self-hosted through `next/font` (already in the scaffold), load faster, and have tabular numerals that suit lists and stage counts.

## 2. Tokens (Tailwind v4 theme variables, implemented in `src/app/globals.css`)

| Token                  | Light                      | Dark      | Use                                      |
| ---------------------- | -------------------------- | --------- | ---------------------------------------- |
| `--background`         | `#FAFAF9` (warm off-white) | `#0C0A09` | page background                          |
| `--foreground`         | `#1C1917`                  | `#F5F5F4` | body text                                |
| `--card`               | `#FFFFFF`                  | `#1C1917` | surfaces                                 |
| `--muted`              | `#F5F5F4`                  | `#292524` | subtle fills                             |
| `--muted-foreground`   | `#57534E`                  | `#A8A29E` | secondary text (contrast 7.3:1 on white) |
| `--border`             | `#E7E5E4`                  | `#292524` | dividers                                 |
| `--primary`            | `#4338CA` (indigo 700)     | `#818CF8` | primary actions, links, focus ring       |
| `--primary-foreground` | `#FFFFFF`                  | `#1E1B4B` | text on primary                          |
| `--destructive`        | `#B91C1C`                  | `#F87171` | destructive actions                      |
| `--ring`               | `#4338CA`                  | `#818CF8` | focus outline                            |

Stage colors are semantic and always paired with a label and icon (never color alone):

| Stage     | Tint (light) | Icon (lucide)     |
| --------- | ------------ | ----------------- |
| New       | slate        | `inbox`           |
| Screening | sky          | `search`          |
| Interview | violet       | `messages-square` |
| Offer     | amber        | `file-signature`  |
| Hired     | emerald      | `badge-check`     |
| Rejected  | rose         | `x-circle`        |

Spacing scale (dense): 4, 8, 12, 16, 24, 32 px. Radius: 8 px cards, 6 px controls. Type scale: 12 / 14 / 16 / 20 / 24 / 30 px with line-height 1.5 for body.

## 3. Layout

- **App shell:** left sidebar (collapsible to icons at ≥ 768 px, sheet drawer below), compact top bar with organization name, context banner for admins, and the user menu.
- **Responsive breakpoints:** 375, 768, 1024, 1440 px. No horizontal page scroll; the Kanban scrolls horizontally inside its own region with visible affordance.
- **Responsive review (2026-10-19, public pages):** `tests/e2e/screenshots.spec.ts` (`SCREENSHOTS=1`) captures the login page and, through the local preview, the dashboard, jobs, job detail, candidates, candidate detail, pipeline and admin overview at 375, 768 and 1440 px into `docs/screenshots/` (24 images) and asserts there is no horizontal page scroll. Tables use shadcn's overflow container; the Kanban board scrolls inside its own region. Authenticated pages are reviewed the same way once test accounts exist.
- **Pages:** Login · Admin Overview · Organizations (list, create) · Organization Workspace overview · Jobs (list, create/edit, detail) · Candidates (list, create/edit, detail) · Pipeline (Kanban) · Members · Settings · optional AI Insights panel inside Candidate detail.

## 4. Components (shadcn/ui, Radix base)

Installed primitives: button, card, input, label, dialog, select, badge, separator, sheet, table, dropdown-menu, avatar, skeleton, tabs, textarea, sonner (toasts), tooltip, popover, command, alert, scroll-area.

App components (built in Phases 1–2): `AppShell`, `MobileNav`, `NavLink`, `AdminContextBanner`, `PermissionDenied`, `PageHeader`/`EmptyState`/`StatCard`, form fields (`TextField`, `TextAreaField`, `FormError`, `SubmitButton`), `LoginForm`, `SetPasswordForm`, `CreateOrganizationForm`, `InviteUserForm`, `GrantAdminForm`, `OneTimeLink`, `JobForm`, `CandidateForm`, `AddToPipelineDialog`, `ConfirmActionDialog`, `KanbanBoard` (columns + cards + move menu), `PipelineFilters`, `StageBadge`, `ExternalLink` (safe `rel="noopener noreferrer"`). Still planned: `OrgSwitcher` (multi-workspace users currently use `/workspaces`).

## 5. Motion plan (Motion for React, `motion/react`)

Global: `<MotionConfig reducedMotion="user">` in the root layout so every animation respects `prefers-reduced-motion`. Durations and easings are shared tokens:

| Token           | Value                     | Used for                              |
| --------------- | ------------------------- | ------------------------------------- |
| `duration.fast` | 150 ms                    | hover/focus, badge crossfade          |
| `duration.base` | 200 ms                    | dialog/sheet enter, page section fade |
| `duration.slow` | 300 ms                    | Kanban card layout move               |
| `ease.standard` | `[0.2, 0, 0, 1]`          | enter                                 |
| `ease.exit`     | `[0.4, 0, 1, 1]`          | exit (shorter than enter)             |
| `spring.card`   | stiffness 500, damping 40 | drag release                          |

Where motion is used and why:

1. **Page content entrance:** fade + 8 px rise, 200 ms, stagger 30 ms for list rows — orientation after navigation.
2. **Dialogs and sheets:** scale 0.98→1 + fade — spatial origin of the modal.
3. **Kanban card move:** `layout` animation across columns + `AnimatePresence` for add/remove — shows where a card went. Pointer drag (`drag`, `dragSnapToOrigin`, `whileDrag` scale 1.03) highlights the hovered column; the menu remains the keyboard path.
4. **Stage badge change:** 150 ms crossfade — confirms the state change.
5. **Nothing else.** No parallax, no decorative loops, no animated backgrounds.

Transforms and opacity only; no width/height animation; animations are interruptible and never block input.

## 6. Accessibility commitments

- Contrast ≥ 4.5:1 for text, ≥ 3:1 for UI boundaries and focus indicators.
- Visible focus ring (2 px, `--ring`) on all interactive elements; focus is never removed.
- All icon-only buttons have `aria-label`; decorative icons are `aria-hidden`.
- Forms: visible labels, `aria-describedby` errors next to fields, error summary focused after failed submit, semantic input types, autocomplete attributes, password-manager friendly.
- Kanban: every card has a **Move to stage** menu usable by keyboard; drag is an enhancement, not the only path (WCAG 2.2 dragging alternative).
- Live region announces "Moved <name> to <stage>" after a stage change.
- Reduced motion honoured globally; touch targets ≥ 44 px on mobile, ≥ 24 px on web.
- Skip link to main content; sequential headings; `lang="en"`.

## 7. States to design for every data view

Loading (skeletons that reserve space), empty (explanation + primary action), error (message + retry), permission denied (clear text, no data leak), success (toast, 4 s, non-focus-stealing).

## 8. Public landing page and the customer workspace theme

### 8.1 Landing page system (`/`)

Input from the design skill: the "Product Demo + Features" landing pattern (hero → product mockup → feature chapters → CTA) and the Aurora/OLED dark-style guidance (deep navy base, luminous gradient accents, 8–14 s drift animations, text contrast ≥ 4.5:1, reduced-motion fallback). Google-font pairings were suggested; Geist stays (ADR-011) with a dedicated display scale.

| Token (`.landing`)                      | Value                                           | Use                                |
| --------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| `--background` / `--card` / `--sidebar` | `#070a12` / `#0c1120` / `#0a0f1d`               | page, frames, showcase sidebar     |
| `--foreground` / `--muted-foreground`   | `#e6eaf2` / `#9aa3b5`                           | text (7.7:1 on the background)     |
| `--primary` / `--primary-foreground`    | `#6d8cff` / `#070a12`                           | buttons, links, focus ring (6.6:1) |
| `--accent` / `--accent-foreground`      | `#1b2447` / `#c7d2ff`                           | active states, banner              |
| gradient text                           | `#8fa7ff → #b08cff`                             | second line of the headline        |
| glows                                   | `rgba(109,140,255,.35)`, `rgba(139,92,246,.30)` | hero and CTA backdrops             |

Typography: display 48/60/72 px (sm/md/lg), weight 600, tracking −0.035em, line-height 1.02, `text-balance`; section titles 30/36 px tracking −0.025em; body 18–20 px muted; eyebrow 14 px primary with icon. Spacing: 64–96 px section rhythm, 1152 px container, 16/24 px gutters.

Structure: fixed nav (transparent → blurred navy after 8 px scroll; sheet menu below md) · hero (eyebrow, headline, copy, primary "Sign in"/"Open app", secondary "See the product", invitation note) · product showcase (real `AppShell` + `KanbanBoard` with synthetic data, inert) · facts strip (implemented properties only) · three feature chapters with real-component visuals (jobs list, candidate card with `StageBadge`, admin banner + audit rows) · AI Candidate Insights chapter describing the live feature (evidence-first, three statuses, no scoring, human decides, revocable consent) with a static example of the panel · CTA · footer.

Motion (within the ADR-009 budget): hero copy stagger (90 ms steps), showcase fade/scale 0.98→1, section reveals on scroll (once), nav backdrop transition, 14 s glow drift. All transform/opacity; all disabled under `prefers-reduced-motion` by the global rule and `MotionConfig`.

Accessibility: landmarks (`header`, `nav`, `main`, `footer`), skip link, visible focus rings on dark, 4.5:1+ text contrast, inert showcase excluded from the tab order and the accessibility tree, axe checks in `tests/e2e/landing.spec.ts`, no horizontal scroll at 375/768/1440 px (screenshot test).

SEO: absolute title "TalentFlow — Hire with clarity. Move talent forward.", description, Open Graph and Twitter card metadata, generated `/opengraph-image` (1200×630) without external assets.

### 8.2 Customer workspace theme (implemented 2026-10-20, ADR-032)

The customer workspace now uses the landing's navy design language, scoped to the authenticated workspace shell so the platform-admin area and the landing page are unchanged. It is a token-driven change: a `.app` scope in `src/app/globals.css` redefines the shadcn tokens, applied by `AppShell theme="app"` (the real workspace layout and the preview workspace layout pass it; the admin layout does not). No server action, route, data path, or server component logic changed.

| Token (`.app`)                          | Value                             | Use                                     |
| --------------------------------------- | --------------------------------- | --------------------------------------- |
| `--background` / `--card` / `--sidebar` | `#070a12` / `#0e1426` / `#090d1a` | canvas, elevated cards, sidebar         |
| `--foreground` / `--muted-foreground`   | `#e7ebf4` / `#98a2b7`             | text (muted ≥ 4.5:1 on card and canvas) |
| `--primary` / `--primary-foreground`    | `#6d8cff` / `#060910`             | buttons, links, focus ring, active nav  |
| `--accent` / `--accent-foreground`      | `#1c2650` / `#cdd7ff`             | active nav fill, hover                  |
| `--border` / `--input`                  | `#ffffff14` / `#ffffff24`         | hairline separators, field borders      |

Cards sit one step above the canvas (`#0e1426` on `#070a12`) for elevation, matching the landing while reading as a denser application surface.

Implemented component polish (shared components, so they adapt per theme scope and the admin area keeps its light look):

1. **Shell.** Gradient brand tile (`.app-brand-mark`, blue → violet), 64 px sidebar with a soft top wash (`.app-sidebar-surface`), a sticky top bar with a subtle backdrop blur (no glass panels), and a centered `max-w-6xl` content column.
2. **Navigation.** Active item gets a short primary bar on the leading edge, an accent fill, and a primary-tinted icon; inactive items lift on hover. `aria-current` unchanged.
3. **Stat cards.** Elevated card with a hairline top accent that warms on hover and a small lift; tabular numerals; larger metric type.
4. **Pipeline.** Rounded navy columns with a header divider, a per-stage accent icon (`stageAccentClass`: slate / sky / violet / amber / emerald / rose), bordered count pills, and cards that highlight their border on hover and while dragging. Compact, horizontally scrollable, draggable, and menu-movable as before.
5. **Headers and empty states.** Page headers gain a bottom divider and balanced titles; empty states are a rounded dashed panel with centered copy and one action; the dashboard header carries one static accent wash (`.app-aurora`, reduced-motion safe).

Accessibility: all workspace preview pages pass axe (`tests/e2e/preview.spec.ts`) under the new theme at desktop and mobile; contrast of muted text and the primary accent meets 4.5:1. Verified visually in `docs/screenshots/{dashboard,pipeline,jobs,candidates}-*.png` (desktop/tablet/mobile) with no horizontal overflow at 375/768/1440 px. The landing page and its embedded product showcase are unchanged in structure and now share the same refined Kanban cosmetics.

Not in scope (unchanged): the platform-admin area (light theme, functional), authentication/RLS/tenant isolation, and the data model.
