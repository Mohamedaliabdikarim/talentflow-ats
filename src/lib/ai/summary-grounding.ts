/**
 * Server-side honesty check for the Job Match summary (docs/AI_INSIGHTS.md §3): the summary may
 * only make claims that the cited evidence supports, so it must not introduce named things
 * (employers, products, titles, places, technologies) that appear nowhere in the provided
 * material or in the evidence items the model itself cited.
 *
 * Pure and deliberately conservative: it looks for capitalised tokens that are not at the start
 * of a sentence and checks each one against the grounding corpus. Prose is never parsed for
 * meaning, so an inferred seniority written in lowercase ("a senior leader") is left to the
 * prompt rule and the human reviewer; a fabricated "Acme Corp" or "Head of Platform" is caught.
 */

/** Generic words the summary may use without them appearing in the material. */
const ALLOWED_TERMS = new Set([
  "ai",
  "cv",
  "github",
  "readme",
  "linkedin",
  "the",
  "a",
  "an",
  "no",
  "not",
  "none",
  "overall",
  "however",
  "while",
  "although",
  "candidate",
  "candidates",
  "job",
  "role",
  "material",
  "evidence",
  "summary",
]);

/** Candidate entity tokens: start with an uppercase letter and are at least two characters. */
const TOKEN = /[A-Z][A-Za-z0-9.+#-]+/g;

/** Words that follow one of these characters open a sentence and may be capitalised. */
const SENTENCE_BREAK = /[.!?]\s*$/;

const MIN_PREFIX_WORD = 4;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

/**
 * Returns the capitalised terms in `summary` that are absent from every corpus text. An empty
 * array means the summary names nothing the material does not. Matching is case-insensitive and
 * ignores punctuation, and a term counts as grounded when it is a substring of the corpus or
 * extends a corpus word of four or more letters (so "PostgreSQL" is grounded by "Postgres").
 */
export function findUngroundedSummaryTerms(summary: string, corpus: readonly string[]): string[] {
  const corpusText = normalize(corpus.join("\n"));
  const corpusWords = new Set(corpusText.split(" ").filter((w) => w.length >= MIN_PREFIX_WORD));
  const ungrounded: string[] = [];
  const seen = new Set<string>();
  for (const match of summary.matchAll(TOKEN)) {
    const term = match[0].replace(/[.,;:]+$/, "");
    if (term.length < 2) continue;
    const before = summary.slice(0, match.index);
    if (before.trim().length === 0 || SENTENCE_BREAK.test(before)) continue;
    const key = normalize(term).trim();
    if (key.length === 0 || ALLOWED_TERMS.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (corpusText.includes(key)) continue;
    let grounded = false;
    for (const word of corpusWords) {
      if (key.startsWith(word)) {
        grounded = true;
        break;
      }
    }
    if (!grounded) ungrounded.push(term);
  }
  return ungrounded;
}
