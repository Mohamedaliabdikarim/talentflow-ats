import "server-only";
import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

/**
 * Server-only Azure OpenAI client (ADR-034, phase: integration only).
 *
 * Uses the official `openai` SDK against Azure's OpenAI-compatible v1 endpoint
 * (`<resource>/openai/v1/`) and the Responses API. The API key is read exclusively from
 * server-side environment variables via getServerEnv(); it is never referenced through a
 * NEXT_PUBLIC_ variable, never returned to a client, and never logged. The `"server-only"`
 * import makes importing this module from a Client Component a build error.
 *
 * No Candidate Insights logic lives here yet: this is the reusable transport only.
 */

/** Request timeout; Azure reasoning models can take several seconds. */
export const AI_REQUEST_TIMEOUT_MS = 60_000;
export const AI_MAX_RETRIES = 2;

export type AzureOpenAIConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion?: string;
};

/**
 * Normalises the configured endpoint to the v1 base URL the SDK needs. Accepts either the
 * bare resource endpoint (`https://x.openai.azure.com`) or one that already ends in
 * `/openai/v1`, with or without a trailing slash.
 */
export function buildAzureBaseUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  return /\/openai\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/openai/v1`;
}

/** Reads and validates the Azure configuration, with a clear error when something is missing. */
export function getAzureOpenAIConfig(): AzureOpenAIConfig {
  const env = getServerEnv();
  const missing = [
    env.AZURE_OPENAI_ENDPOINT ? null : "AZURE_OPENAI_ENDPOINT",
    env.AZURE_OPENAI_API_KEY ? null : "AZURE_OPENAI_API_KEY",
    env.AZURE_OPENAI_DEPLOYMENT ? null : "AZURE_OPENAI_DEPLOYMENT",
  ].filter((name): name is string => name !== null);
  if (missing.length > 0) {
    throw new AiError(
      "not_configured",
      `Azure OpenAI is not configured: set ${missing.join(", ")} in .env.local`,
    );
  }
  return {
    endpoint: env.AZURE_OPENAI_ENDPOINT!,
    apiKey: env.AZURE_OPENAI_API_KEY!,
    deployment: env.AZURE_OPENAI_DEPLOYMENT!,
    apiVersion: env.AZURE_OPENAI_API_VERSION,
  };
}

/** Returns true when all required Azure variables are present (no network call). */
export function isAzureOpenAIConfigured(): boolean {
  try {
    getAzureOpenAIConfig();
    return true;
  } catch {
    return false;
  }
}

let cachedClient: OpenAI | null = null;

/** Builds (and memoises) the Azure-backed OpenAI client and the deployment name to use as `model`. */
export function createAzureOpenAI(): { client: OpenAI; deployment: string } {
  const config = getAzureOpenAIConfig();
  if (!cachedClient) {
    cachedClient = new OpenAI({
      baseURL: buildAzureBaseUrl(config.endpoint),
      apiKey: config.apiKey,
      timeout: AI_REQUEST_TIMEOUT_MS,
      maxRetries: AI_MAX_RETRIES,
      ...(config.apiVersion ? { defaultQuery: { "api-version": config.apiVersion } } : {}),
    });
  }
  return { client: cachedClient, deployment: config.deployment };
}

export type AiErrorKind =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "timeout"
  | "bad_request"
  | "server"
  | "connection"
  | "unknown";

/** Error that never carries the key or raw request content; safe to surface and log. */
export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** Maps SDK/transport errors to an AiError with a safe message (no key, no request body). */
export function mapAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AiError("timeout", "Azure OpenAI request timed out.");
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AiError("connection", "Could not reach Azure OpenAI.");
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return new AiError("auth", "Azure OpenAI rejected the credentials.");
    }
    if (status === 429) {
      return new AiError("rate_limit", "Azure OpenAI rate limit reached; retry shortly.");
    }
    if (typeof status === "number" && status >= 500) {
      return new AiError("server", "Azure OpenAI service error.");
    }
    return new AiError(
      "bad_request",
      `Azure OpenAI request failed (status ${status ?? "unknown"}).`,
    );
  }
  return new AiError("unknown", "Unexpected error calling Azure OpenAI.");
}

export type AiTextResult = {
  text: string;
  model: string;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AiStructuredResult = AiTextResult & {
  /** True when the model hit the output-token limit before finishing (output is unusable). */
  incomplete: boolean;
};

/**
 * Structured generation over the Responses API: the model is constrained to `jsonSchema`
 * (strict structured output). Returns the raw JSON text; the caller validates it against its
 * own Zod contract before trusting it. Nothing here logs the input or the output.
 */
export async function generateStructured(params: {
  input: string;
  instructions?: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): Promise<AiStructuredResult> {
  const { client, deployment } = createAzureOpenAI();
  try {
    const response = await client.responses.create(
      {
        model: deployment,
        input: params.input,
        ...(params.instructions ? { instructions: params.instructions } : {}),
        max_output_tokens: params.maxOutputTokens ?? 4096,
        text: {
          format: {
            type: "json_schema",
            name: params.schemaName,
            schema: params.jsonSchema,
            strict: true,
          },
        },
      },
      { signal: params.signal },
    );
    return {
      text: response.output_text ?? "",
      model: response.model,
      outputTokens: response.usage?.output_tokens ?? null,
      totalTokens: response.usage?.total_tokens ?? null,
      incomplete: response.status === "incomplete",
    };
  } catch (error) {
    throw mapAiError(error);
  }
}

/**
 * Minimal text generation over the Responses API. Returns only the aggregated output text
 * and token usage; the caller is responsible for not passing sensitive content until the
 * Candidate Insights consent gate is in place (not part of this phase). `input` is the
 * user content; `instructions` is the system-level instruction.
 */
export async function generateText(params: {
  input: string;
  instructions?: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): Promise<AiTextResult> {
  const { client, deployment } = createAzureOpenAI();
  try {
    const response = await client.responses.create(
      {
        model: deployment,
        input: params.input,
        ...(params.instructions ? { instructions: params.instructions } : {}),
        max_output_tokens: params.maxOutputTokens ?? 1024,
      },
      { signal: params.signal },
    );
    return {
      text: response.output_text ?? "",
      model: response.model,
      outputTokens: response.usage?.output_tokens ?? null,
      totalTokens: response.usage?.total_tokens ?? null,
    };
  } catch (error) {
    throw mapAiError(error);
  }
}
