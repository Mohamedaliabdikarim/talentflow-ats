import type { Tables } from "@/lib/supabase/database.types";
import type { ApplicationStage } from "@/lib/validation/application";

/**
 * Synthetic demo data for the local preview. Every person is fictional; e-mail addresses
 * use the reserved example.test domain and profile links point at placeholder accounts.
 * Ids are valid v4-shaped UUIDs so the same Zod schemas apply as in production.
 */

const BASE_TIME = Date.parse("2026-10-19T09:00:00.000Z");
const DAY = 86_400_000;
const at = (daysAgo: number, hour = 9) =>
  new Date(BASE_TIME - daysAgo * DAY + (hour - 9) * 3_600_000).toISOString();

export const PREVIEW_ORGANIZATION = {
  id: "00000000-0000-4000-8000-00000000a001",
  name: "Northwind Hiring",
  slug: "northwind",
  status: "active" as const,
  created_at: at(21),
};

export const PREVIEW_USER = {
  id: "00000000-0000-4000-8000-00000000b001",
  email: "preview@example.test",
};

export type DemoJob = Tables<"jobs">;
export type DemoCandidate = Tables<"candidates">;
export type DemoApplication = {
  id: string;
  job_id: string;
  candidate_id: string;
  stage: ApplicationStage;
  stage_changed_at: string;
  created_at: string;
};

const job = (
  n: number,
  fields: Pick<DemoJob, "title" | "description" | "location" | "employment_type" | "status">,
  createdDaysAgo: number,
): DemoJob => ({
  id: `00000000-0000-4000-8000-0000000000${n.toString(16).padStart(2, "0")}`,
  organization_id: PREVIEW_ORGANIZATION.id,
  created_by: PREVIEW_USER.id,
  created_at: at(createdDaysAgo),
  updated_at: at(Math.max(0, createdDaysAgo - 3)),
  ...fields,
});

export const PREVIEW_JOBS: DemoJob[] = [
  job(
    1,
    {
      title: "Senior Backend Engineer",
      description:
        "Own the services behind our scheduling platform.\n\nYou will design APIs, improve reliability and mentor two engineers. Stack: TypeScript, PostgreSQL, Azure.\n\nRequirements: 5+ years with distributed systems, strong SQL, pragmatic testing habits.",
      location: "Oslo · Hybrid",
      employment_type: "Full-time",
      status: "open",
    },
    18,
  ),
  job(
    2,
    {
      title: "Product Designer",
      description:
        "Shape the recruiter experience end to end: research, flows, prototypes and a design system we actually ship.\n\nPortfolio with B2B work preferred.",
      location: "Remote (Europe)",
      employment_type: "Full-time",
      status: "open",
    },
    12,
  ),
  job(
    3,
    {
      title: "Customer Success Manager",
      description:
        "Onboard new customers, run quarterly reviews and turn feedback into roadmap input. Norwegian and English required.",
      location: "Bergen",
      employment_type: "Full-time",
      status: "open",
    },
    7,
  ),
  job(
    4,
    {
      title: "Data Analyst (contract)",
      description:
        "Six-month contract to build our hiring funnel dashboards. Closed: position filled.",
      location: "Oslo",
      employment_type: "Contract",
      status: "closed",
    },
    30,
  ),
];

const candidate = (
  n: number,
  fields: Pick<DemoCandidate, "full_name" | "headline" | "email" | "location"> &
    Partial<Pick<DemoCandidate, "phone" | "linkedin_url" | "github_url" | "notes">>,
  createdDaysAgo: number,
): DemoCandidate => ({
  id: `00000000-0000-4000-8000-0000000001${n.toString(16).padStart(2, "0")}`,
  organization_id: PREVIEW_ORGANIZATION.id,
  created_by: PREVIEW_USER.id,
  created_at: at(createdDaysAgo),
  updated_at: at(createdDaysAgo),
  phone: null,
  linkedin_url: null,
  github_url: null,
  notes: null,
  // CV upload is a hosted-Storage feature; the preview keeps candidates without a CV.
  cv_object_key: null,
  cv_filename: null,
  cv_size_bytes: null,
  cv_uploaded_at: null,
  cv_uploaded_by: null,
  cv_source: null,
  cv_ai_authorized: false,
  cv_ai_authorized_at: null,
  cv_ai_authorized_by: null,
  cv_ai_authorization_basis: null,
  github_ai_authorized: false,
  github_ai_authorized_at: null,
  github_ai_authorized_by: null,
  github_ai_authorization_basis: null,
  ...fields,
});

export const PREVIEW_CANDIDATES: DemoCandidate[] = [
  candidate(
    1,
    {
      full_name: "Ada Example",
      headline: "Senior backend engineer, Go and TypeScript",
      email: "ada@example.test",
      location: "Oslo",
      linkedin_url: "https://www.linkedin.com/in/ada-example",
      github_url: "https://github.com/example-ada",
      notes: "Referred by Jonas. Available from January.",
    },
    16,
  ),
  candidate(
    2,
    {
      full_name: "Bjørn Demo",
      headline: "Platform engineer, PostgreSQL specialist",
      email: "bjorn@example.test",
      location: "Trondheim",
      github_url: "https://github.com/example-bjorn",
    },
    15,
  ),
  candidate(
    3,
    {
      full_name: "Chidi Sample",
      headline: "Product designer, B2B SaaS",
      email: "chidi@example.test",
      location: "Berlin",
      linkedin_url: "https://www.linkedin.com/in/chidi-sample",
    },
    11,
  ),
  candidate(
    4,
    {
      full_name: "Dana Placeholder",
      headline: "UX researcher turned product designer",
      email: "dana@example.test",
      location: "Remote",
      linkedin_url: "https://www.linkedin.com/in/dana-placeholder",
      notes: "Strong portfolio; asked about part-time.",
    },
    10,
  ),
  candidate(
    5,
    {
      full_name: "Elif Test",
      headline: "Customer success lead, fintech",
      email: "elif@example.test",
      location: "Bergen",
      phone: "+47 400 00 000",
    },
    6,
  ),
  candidate(
    6,
    {
      full_name: "Farid Mock",
      headline: "Account manager",
      email: "farid@example.test",
      location: "Stavanger",
    },
    5,
  ),
  candidate(
    7,
    {
      full_name: "Grete Fixture",
      headline: "Backend developer, Kotlin",
      email: "grete@example.test",
      location: "Oslo",
      github_url: "https://github.com/example-grete",
    },
    9,
  ),
  candidate(
    8,
    {
      full_name: "Hiro Specimen",
      headline: "Full-stack engineer",
      email: "hiro@example.test",
      location: "Copenhagen",
      github_url: "https://github.com/example-hiro",
      linkedin_url: "https://www.linkedin.com/in/hiro-specimen",
    },
    4,
  ),
  candidate(
    9,
    {
      full_name: "Ingrid Stub",
      headline: "Data analyst, SQL and dbt",
      email: "ingrid@example.test",
      location: "Oslo",
    },
    28,
  ),
  candidate(
    10,
    {
      full_name: "Jonas Dummy",
      headline: "Engineering manager",
      email: "jonas@example.test",
      location: "Oslo",
      notes: "Applied to two roles; prefers the backend position.",
    },
    3,
  ),
];

const J = Object.fromEntries(PREVIEW_JOBS.map((item, index) => [index + 1, item.id]));
const C = Object.fromEntries(PREVIEW_CANDIDATES.map((item, index) => [index + 1, item.id]));

const application = (
  n: number,
  jobN: number,
  candidateN: number,
  stage: ApplicationStage,
  stageDaysAgo: number,
  createdDaysAgo = stageDaysAgo,
): DemoApplication => ({
  id: `00000000-0000-4000-8000-0000000002${n.toString(16).padStart(2, "0")}`,
  job_id: J[jobN],
  candidate_id: C[candidateN],
  stage,
  stage_changed_at: at(stageDaysAgo, 11),
  created_at: at(createdDaysAgo, 10),
});

export const PREVIEW_APPLICATIONS: DemoApplication[] = [
  application(1, 1, 1, "interview", 2, 14),
  application(2, 1, 2, "screening", 5, 13),
  application(3, 1, 7, "new", 1),
  application(4, 1, 8, "offer", 0, 9),
  application(5, 1, 10, "screening", 3, 3),
  application(6, 2, 3, "interview", 4, 10),
  application(7, 2, 4, "new", 0),
  application(8, 2, 8, "rejected", 6, 8),
  application(9, 3, 5, "interview", 1, 6),
  application(10, 3, 6, "new", 2),
  application(11, 3, 10, "new", 3),
  application(12, 4, 9, "hired", 20, 28),
  application(13, 4, 2, "rejected", 22, 27),
  application(14, 2, 1, "screening", 7, 7),
];

export const PREVIEW_MEMBERS = [
  {
    membershipId: "00000000-0000-4000-8000-0000000003a1",
    userId: PREVIEW_USER.id,
    email: "preview@example.test",
    fullName: "Preview Owner",
    role: "owner" as const,
    status: "active" as const,
    createdAt: at(21),
  },
  {
    membershipId: "00000000-0000-4000-8000-0000000003a2",
    userId: "00000000-0000-4000-8000-00000000b002",
    email: "recruiter@example.test",
    fullName: "Rita Recruiter",
    role: "member" as const,
    status: "active" as const,
    createdAt: at(14),
  },
  {
    membershipId: "00000000-0000-4000-8000-0000000003a3",
    userId: "00000000-0000-4000-8000-00000000b003",
    email: "new.hire@example.test",
    fullName: "",
    role: "member" as const,
    status: "invited" as const,
    createdAt: at(1),
  },
];

export const PREVIEW_ADMIN_ORGANIZATIONS = [
  { ...PREVIEW_ORGANIZATION, member_count: 2 },
  {
    id: "00000000-0000-4000-8000-00000000a002",
    name: "Fjord Logistics",
    slug: "fjord-logistics",
    status: "active" as const,
    created_at: at(9),
    member_count: 1,
  },
  {
    id: "00000000-0000-4000-8000-00000000a003",
    name: "Aurora Health (suspended)",
    slug: "aurora-health",
    status: "suspended" as const,
    created_at: at(40),
    member_count: 0,
  },
];

export const PREVIEW_AUDIT_EVENTS = [
  {
    id: 6,
    action: "admin.context_entered",
    actorEmail: "admin@example.test",
    organizationName: "Northwind Hiring",
    targetType: "organization",
    targetId: PREVIEW_ORGANIZATION.id,
    createdAt: at(0, 8),
  },
  {
    id: 5,
    action: "user.invited",
    actorEmail: "admin@example.test",
    organizationName: "Northwind Hiring",
    targetType: "user",
    targetId: "00000000-0000-4000-8000-00000000b003",
    createdAt: at(1, 15),
  },
  {
    id: 4,
    action: "organization.created",
    actorEmail: "admin@example.test",
    organizationName: "Fjord Logistics",
    targetType: "organization",
    targetId: "00000000-0000-4000-8000-00000000a002",
    createdAt: at(9, 10),
  },
  {
    id: 3,
    action: "membership.activated",
    actorEmail: "recruiter@example.test",
    organizationName: "Northwind Hiring",
    targetType: null,
    targetId: null,
    createdAt: at(14, 12),
  },
  {
    id: 2,
    action: "admin.granted",
    actorEmail: "admin@example.test",
    organizationName: null,
    targetType: "user",
    targetId: "00000000-0000-4000-8000-00000000b004",
    createdAt: at(20, 9),
  },
  {
    id: 1,
    action: "auth.signed_in",
    actorEmail: "admin@example.test",
    organizationName: null,
    targetType: null,
    targetId: null,
    createdAt: at(21, 9),
  },
];
