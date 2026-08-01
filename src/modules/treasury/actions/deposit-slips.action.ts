"use server";

import { revalidatePath } from "next/cache";
import type {
  CreateCashDepositSlipInput,
  CreateCheckDepositSlipInput,
} from "@/lib/accounting-client";
import {
  createBoletaDepositoChequesServer,
  createBoletaDepositoEfectivoServer,
} from "@/lib/accounting-server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function createBoletaDepositoChequesAction(
  orgSlug: string,
  input: Omit<CreateCheckDepositSlipInput, "orgId">
): Promise<ActionResult<{ id: string }>> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const boleta = await createBoletaDepositoChequesServer({
      ...input,
      orgId: org.id,
    });
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: boleta.id } };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error al crear boleta de depósito de cheques",
    };
  }
}

export async function createBoletaDepositoEfectivoAction(
  orgSlug: string,
  input: Omit<CreateCashDepositSlipInput, "orgId">
): Promise<ActionResult<{ id: string }>> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const boleta = await createBoletaDepositoEfectivoServer({
      ...input,
      orgId: org.id,
    });
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: boleta.id } };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error al crear boleta de depósito de efectivo",
    };
  }
}
