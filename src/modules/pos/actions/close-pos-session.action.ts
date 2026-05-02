"use server";

import { revalidatePath } from "next/cache";
import { closePosSession } from "../service/pos-sessions.service";
import type { ClosePosSessionInput, PosSessionSummary } from "../types";

export type ClosePosSessionActionResult = {
  success: boolean;
  sessionId?: string;
  session?: PosSessionSummary;
  error?: string;
};

export async function closePosSessionAction(
  input: ClosePosSessionInput
): Promise<ClosePosSessionActionResult> {
  try {
    const session = await closePosSession(input);
    revalidatePath(`/org/${input.orgSlug}/venta-directa`);
    revalidatePath(`/org/${input.orgSlug}/venta-directa/nueva`);

    return {
      success: true,
      sessionId: session.id,
      session,
    };
  } catch (error) {
    console.error("Error closing POS session:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al cerrar la sesión de caja.",
    };
  }
}
