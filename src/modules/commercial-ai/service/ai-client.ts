import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { type AiMeter, assertWithinBudget, recordUsage } from "./usage.service";

/** Modelo por defecto del módulo; se cambia con COMMERCIAL_AI_MODEL sin tocar código. */
export const DEFAULT_COMMERCIAL_AI_MODEL = "claude-haiku-5-5";

// Modelos que aceptan el reintento automático en otro modelo si rechazan un pedido.
const SERVER_FALLBACK_MODELS = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

export function commercialAiModel(): string {
  return process.env.COMMERCIAL_AI_MODEL || DEFAULT_COMMERCIAL_AI_MODEL;
}

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type MessageInput = {
  /** Quién consume: se chequea el tope antes y se registra el gasto después. */
  meter: AiMeter;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  /** JSON Schema para obligar una respuesta estructurada. */
  schema?: Record<string, unknown>;
};

export type AiResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; reason: "refusal" };

export async function createAiMessage(input: MessageInput): Promise<AiResult> {
  await assertWithinBudget(input.meter);
  const client = new Anthropic();
  const model = commercialAiModel();
  const useFallbacks = SERVER_FALLBACK_MODELS.has(model);

  const response = await client.beta.messages.create({
    model,
    max_tokens: input.maxTokens,
    ...(useFallbacks
      ? {
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as const,
        }
      : {}),
    output_config: {
      effort: input.effort ?? "low",
      ...(input.schema
        ? { format: { type: "json_schema" as const, schema: input.schema } }
        : {}),
    },
    system: [
      {
        type: "text",
        text: input.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: input.messages,
  });

  await recordUsage(input.meter, response.model, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  });

  if (response.stop_reason === "refusal") {
    return { ok: false, reason: "refusal" };
  }
  const text = response.content
    .filter(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === "text"
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
  return { ok: true, text, truncated: response.stop_reason === "max_tokens" };
}
