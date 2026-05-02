"use server";

import { revalidatePath } from "next/cache";
import { createPosTerminalForOrg } from "../service/pos-terminals.service";
import type { CreatePosTerminalInput, PosTerminal } from "../types";

export type CreatePosTerminalActionResult = {
  success: boolean;
  terminal?: PosTerminal;
  error?: string;
};

export async function createPosTerminalAction(
  input: CreatePosTerminalInput
): Promise<CreatePosTerminalActionResult> {
  try {
    const terminal = await createPosTerminalForOrg(input);
    revalidatePath(`/org/${input.orgSlug}/configuracion/terminales-pos`);
    revalidatePath(`/org/${input.orgSlug}/venta-directa`);
    revalidatePath(`/org/${input.orgSlug}/venta-directa/nueva`);

    return {
      success: true,
      terminal,
    };
  } catch (error) {
    console.error("Error creating POS terminal:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al crear la terminal POS",
    };
  }
}
