import { describe, expect, it } from "vitest";
import { findUngroundedSummaryTerms } from "@/lib/ai/summary-grounding";

/**
 * Summary honesty (docs/AI_INSIGHTS.md §3): named things in the summary must come from the
 * material or the cited evidence. Pure, no network.
 */

const corpus = [
  "Senior Backend Engineer\n\nTypeScript, Postgres and Azure. Mentor two engineers.",
  "Backend developer at Fjord Logistics since 2021. TypeScript services on Kubernetes.",
  "Lists TypeScript on two recent roles.",
  "No mention of Azure or any cloud platform.",
];

describe("findUngroundedSummaryTerms", () => {
  it("accepts a summary that only names things present in the material or the evidence", () => {
    expect(
      findUngroundedSummaryTerms(
        "The CV shows TypeScript work at Fjord Logistics on Kubernetes. Azure is not evidenced.",
        corpus,
      ),
    ).toEqual([]);
  });

  it("flags an invented employer, title or technology", () => {
    expect(
      findUngroundedSummaryTerms(
        "The candidate led the platform team at Acme Corp as Head of Engineering using Terraform.",
        corpus,
      ),
    ).toEqual(["Acme", "Corp", "Head", "Terraform"]); // "Engineering" extends "Engineer"
  });

  it("ignores sentence-initial capitals and generic words", () => {
    expect(
      findUngroundedSummaryTerms(
        "Overall the material is thin. Several items need verification. The CV and GitHub agree.",
        corpus,
      ),
    ).toEqual([]);
  });

  it("treats a longer form of a corpus word as grounded (PostgreSQL vs Postgres)", () => {
    expect(findUngroundedSummaryTerms("Strong PostgreSQL work is cited.", corpus)).toEqual([]);
  });

  it("reports each term once and strips trailing punctuation", () => {
    expect(
      findUngroundedSummaryTerms("Worked with Snowflake, then Snowflake again.", corpus),
    ).toEqual(["Snowflake"]);
  });

  it("returns nothing for an empty summary or a summary without names", () => {
    expect(findUngroundedSummaryTerms("", corpus)).toEqual([]);
    expect(findUngroundedSummaryTerms("nothing named here", [])).toEqual([]);
  });
});
