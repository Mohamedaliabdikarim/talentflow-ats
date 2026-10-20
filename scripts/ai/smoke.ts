/**
 * Local Azure OpenAI connectivity smoke test (ADR-034). Sends a harmless synthetic prompt to
 * the configured deployment and checks the response. Run with the credentials from .env.local:
 *
 *   pnpm ai:smoke
 *
 * It is a local script, not an HTTP endpoint: there is nothing public or unauthenticated. It
 * prints only the model name, latency, token usage and the (synthetic) response text — never
 * the API key, the endpoint secret, or any candidate data.
 */
import { generateText } from "../../src/lib/ai/client";

const PROBE_TOKEN = "TALENTFLOW_AI_OK";

async function main(): Promise<void> {
  console.log("Azure OpenAI smoke test: sending a harmless synthetic prompt…");
  const started = Date.now();
  const result = await generateText({
    instructions:
      "You are a connectivity probe for an application. Reply with only the exact token requested, nothing else.",
    input: `Reply with exactly this token: ${PROBE_TOKEN}`,
    maxOutputTokens: 512,
  });
  const ms = Date.now() - started;
  const text = result.text.trim();

  console.log(`model:          ${result.model}`);
  console.log(`latency:        ${ms} ms`);
  console.log(`output tokens:  ${result.outputTokens ?? "unknown"}`);
  console.log(`total tokens:   ${result.totalTokens ?? "unknown"}`);
  console.log(`response:       ${text.slice(0, 200) || "(empty)"}`);

  if (text.includes(PROBE_TOKEN)) {
    console.log("SMOKE TEST: PASS — Azure OpenAI responded and returned the expected token.");
    process.exit(0);
  }
  console.log(
    "SMOKE TEST: PARTIAL — the call succeeded but the token was not found (connectivity OK, content unexpected).",
  );
  process.exit(2);
}

main().catch((error: unknown) => {
  // AiError messages are already sanitised (no key, no request body).
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SMOKE TEST: FAIL — ${message}`);
  process.exit(1);
});
