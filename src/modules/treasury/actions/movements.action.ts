"use server";

import { revalidatePath } from "next/cache";
import type { CreateMovimientoBancarioInput } from "@/lib/accounting-client";
import { createMovimientoBancarioServer } from "@/lib/accounting-server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function createMovimientoBancarioAction(
  orgSlug: string,
  input: Omit<CreateMovimientoBancarioInput, "orgId">
): Promise<ActionResult<{ id: string }>> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const mov = await createMovimientoBancarioServer({
      ...input,
      orgId: org.id,
    });
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: mov.id } };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Error al registrar movimiento",
    };
  }
}
