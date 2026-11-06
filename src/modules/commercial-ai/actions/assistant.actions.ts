"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  commercialAiModel,
  createAiMessage,
  isAiEnabled,
} from "../service/ai-client";
import { answerWithRules, askAssistant } from "../service/assistant.service";
import {
  getCommercialAiSnapshot,
  requireCommercialAiAccess,
} from "../service/commercial-ai.service";
import { AiBudgetExceededError } from "../service/usage.service";

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
    return assistantFailure(error, rules);
  }
}

function connectionErrorMessage(error: unknown): string {
  if (error instanceof AiBudgetExceededError) {
    return error.message;
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return "La clave de Anthropic no es válida.";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "La clave no tiene permiso para ese modelo.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Límite de uso alcanzado. Revisá el crédito o los límites en console.anthropic.com.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic respondió ${error.status}: ${error.message}`;
  }
  return "No pudimos conectar con Anthropic.";
}

function assistantFailure(
  error: unknown,
  rules: string | null
): AssistantActionResult {
  if (error instanceof AiBudgetExceededError) {
    return rules
      ? {
          success: true,
          text: `${rules}\n\n(${error.message} Te respondí con reglas.)`,
          source: "rules",
        }
      : { success: false, error: error.message };
  }
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

export type AiConnectionResult =
  | { success: true; model: string; latencyMs: number; reply: string }
  | { success: false; error: string };

/** Llamada mínima para confirmar que la clave y el modelo funcionan (solo gerentes). */
export async function testAiConnectionAction(
  orgSlug: string
): Promise<AiConnectionResult> {
  let access: Awaited<ReturnType<typeof requireCommercialAiAccess>>;
  try {
    access = await requireCommercialAiAccess(orgSlug, "manage");
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Sin acceso",
    };
  }
  if (!isAiEnabled()) {
    return {
      success: false,
      error: "No encontramos ANTHROPIC_API_KEY en este entorno.",
    };
  }
  const started = Date.now();
  try {
    const result = await createAiMessage({
      meter: {
        organizationId: access.organizationId,
        userId: access.userId,
        userName: access.userName,
        feature: "prueba",
      },
      system: "Respondé solo con la palabra: listo",
      messages: [{ role: "user", content: "¿Estás?" }],
      maxTokens: 50,
    });
    if (!result.ok) {
      return { success: false, error: "El modelo rechazó la prueba." };
    }
    return {
      success: true,
      model: commercialAiModel(),
      latencyMs: Date.now() - started,
      reply: result.text,
    };
  } catch (error) {
    return { success: false, error: connectionErrorMessage(error) };
  }
}
