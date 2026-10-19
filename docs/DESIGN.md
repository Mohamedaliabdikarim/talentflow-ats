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
