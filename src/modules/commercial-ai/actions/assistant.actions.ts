"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { answerWithRules, askAssistant } from "../service/assistant.service";
import { getCommercialAiSnapshot } from "../service/commercial-ai.service";

const historySchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(8000),
    })
  )
  .min(1)
  .max(40);

export type AssistantActionResult =
  | { success: true; text: string; source: "ai" | "rules" }
  | { success: false; error: string };

export async function askAssistantAction(
  orgSlug: string,
  history: unknown
): Promise<AssistantActionResult> {
  const parsed = historySchema.safeParse(history);
  if (!parsed.success) {
    return { success: false, error: "Mensaje inválido" };
  }
  const snapshot = await getCommercialAiSnapshot(orgSlug);
  if (!snapshot) {
    return { success: false, error: "No tenés acceso a IA Comercial" };
  }

  const question = parsed.data.at(-1)?.content ?? "";
  const rules = answerWithRules(snapshot, question);

  if (!snapshot.aiEnabled) {
    return rules
      ? { success: true, text: rules, source: "rules" }
      : {
          success: false,
          error:
            "El asistente con IA todavía no está activado. Las preguntas sugeridas funcionan igual.",
        };
  }

  try {
    const text = await askAssistant(snapshot, parsed.data);
    return { success: true, text, source: "ai" };
  } catch (error) {
    if (rules) {
      return { success: true, text: rules, source: "rules" };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return {
        success: false,
        error: "Muchas consultas seguidas. Esperá un rato y probá de nuevo.",
      };
    }
    console.error("IA Comercial: error del asistente", error);
    return {
      success: false,
      error: "No pude responder ahora. Probá de nuevo en un momento.",
    };
  }
}
