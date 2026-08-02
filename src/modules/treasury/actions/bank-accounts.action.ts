"use server";

import { revalidatePath } from "next/cache";
import type {
  CreateBankAccountInput,
  UpdateBankAccountInput,
} from "@/lib/accounting-client";
import {
  createBankAccountServer,
  toggleBankAccountEstadoServer,
  updateBankAccountServer,
} from "@/lib/accounting-server";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Create ────────────────────────────────────────────────────────────────────

export async function createBankAccountAction(
  orgSlug: string,
  input: Omit<CreateBankAccountInput, "orgId">
): Promise<ActionResult<{ id: string }>> {
  await guardOrganizationPermissionAccess(orgSlug, "treasury.manage");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cuenta = await createBankAccountServer({ ...input, orgId: org.id });
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: cuenta.id } };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Error al crear cuenta bancaria",
    };
  }
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateBankAccountAction(
  orgSlug: string,
  id: string,
  input: UpdateBankAccountInput
): Promise<ActionResult<{ id: string }>> {
  await guardOrganizationPermissionAccess(orgSlug, "treasury.manage");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cuenta = await updateBankAccountServer(id, org.id, input);
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: cuenta.id } };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error al actualizar cuenta bancaria",
    };
  }
}

// ── Toggle estado ─────────────────────────────────────────────────────────────

export async function toggleBankAccountEstadoAction(
  orgSlug: string,
  id: string,
  activa: boolean
): Promise<ActionResult<{ id: string; activa: boolean }>> {
  await guardOrganizationPermissionAccess(orgSlug, "treasury.manage");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cuenta = await toggleBankAccountEstadoServer(id, org.id, activa);
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: cuenta.id, activa: cuenta.activa } };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error al cambiar estado de cuenta bancaria",
    };
  }
}
