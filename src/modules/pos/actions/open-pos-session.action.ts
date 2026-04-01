"use server";

import { revalidatePath } from "next/cache";
import { openPosSession } from "../service/pos-sessions.service";
import type { OpenPosSessionInput, PosSessionSummary } from "../types";

export type OpenPosSessionActionResult = {
  success: boolean;
  sessionId?: string;
  session?: PosSessionSummary;
  error?: string;
};

export async function openPosSessionAction(
  input: OpenPosSessionInput
): Promise<OpenPosSessionActionResult> {
  try {
    const session = await openPosSession(input);
    revalidatePath(`/org/${input.orgSlug}/venta-directa`);
    revalidatePath(`/org/${input.orgSlug}/venta-directa/nueva`);

    return {
      success: true,
      sessionId: session.id,
      session,
    };
  } catch (error) {
    console.error("Error opening POS session:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al abrir la sesión de caja.",
    };
  }
}
