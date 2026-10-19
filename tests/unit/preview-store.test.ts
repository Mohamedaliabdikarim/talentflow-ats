import { beforeEach, describe, expect, it } from "vitest";
import { PREVIEW_APPLICATIONS, PREVIEW_CANDIDATES, PREVIEW_JOBS } from "@/preview/demo-data";
import {
  movePreviewApplication,
  previewCandidates,
  previewCards,
  previewJobs,
  resetPreview,
} from "@/preview/store";

/** The preview store must behave like the database-backed data layer it stands in for. */

beforeEach(() => resetPreview());

describe("preview store", () => {
  it("uses valid UUIDs so the real Zod schemas accept them", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (const row of [...PREVIEW_JOBS, ...PREVIEW_CANDIDATES, ...PREVIEW_APPLICATIONS]) {
      expect(row.id).toMatch(uuid);
    }
  });

  it("filters cards by job, by name (case-insensitive) and by both", () => {
    const backend = PREVIEW_JOBS[0].id;
    const all = previewCards({});
    expect(all).toHaveLength(PREVIEW_APPLICATIONS.length);
    const byJob = previewCards({ jobId: backend });
    expect(byJob.every((card) => card.jobId === backend)).toBe(true);
    expect(byJob.length).toBeGreaterThan(0);
    const byName = previewCards({ q: "ada" });
    expect(byName.every((card) => card.candidateName.toLowerCase().includes("ada"))).toBe(true);
    const both = previewCards({ jobId: backend, q: "ADA" });
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ jobId: backend, candidateName: "Ada Example" });
  });

  it("moves an application, bumps its stage timestamp, and resets", () => {
    const id = PREVIEW_APPLICATIONS[2].id;
    const before = previewCards({}).find((card) => card.id === id)!;
    expect(before.stage).toBe("new");
    expect(movePreviewApplication(id, "interview")).toBe(true);
    const after = previewCards({}).find((card) => card.id === id)!;
    expect(after.stage).toBe("interview");
    expect(after.stageChangedAt > before.stageChangedAt).toBe(true);
    expect(movePreviewApplication("00000000-0000-4000-8000-0000000002ff", "offer")).toBe(false);
    resetPreview();
    expect(previewCards({}).find((card) => card.id === id)!.stage).toBe("new");
  });

  it("counts applications per job and searches candidates by name", () => {
    const jobs = previewJobs();
    expect(jobs.reduce((sum, job) => sum + job.application_count, 0)).toBe(
      PREVIEW_APPLICATIONS.length,
    );
    expect(previewCandidates("dummy").map((candidate) => candidate.full_name)).toEqual([
      "Jonas Dummy",
    ]);
    expect(previewCandidates("zzz")).toEqual([]);
  });
});
