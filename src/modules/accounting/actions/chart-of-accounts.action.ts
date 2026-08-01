"use server";

import { revalidatePath } from "next/cache";
import type {
  CreateCuentaInput,
  UpdateCuentaInput,
} from "@/lib/accounting-client";
import {
  createCuentaServer,
  toggleCuentaEstadoServer,
  updateCuentaServer,
} from "@/lib/accounting-server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Create ────────────────────────────────────────────────────────────────────

export async function createCuentaAction(
  orgSlug: string,
  input: Omit<CreateCuentaInput, "orgId">
): Promise<ActionResult<{ id: string }>> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cuenta = await createCuentaServer({ ...input, orgId: org.id });
    revalidatePath(`/org/${orgSlug}/contabilidad/plan`);
    return { success: true, data: { id: cuenta.id } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al crear la cuenta",
    };
  }
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateCuentaAction(
  orgSlug: string,
  id: string,
  input: UpdateCuentaInput
): Promise<ActionResult<{ id: string }>> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cuenta = await updateCuentaServer(id, input);
    revalidatePath(`/org/${orgSlug}/contabilidad/plan`);
    return { success: true, data: { id: cuenta.id } };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Error al actualizar la cuenta",
    };
  }
}

// ── Toggle estado ─────────────────────────────────────────────────────────────

export async function toggleCuentaEstadoAction(
  orgSlug: string,
  id: string,
  activa: boolean
): Promise<ActionResult<{ id: string; activa: boolean }>> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cuenta = await toggleCuentaEstadoServer(id, activa);
    revalidatePath(`/org/${orgSlug}/contabilidad/plan`);
    return { success: true, data: { id: cuenta.id, activa: cuenta.activa } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al cambiar el estado",
    };
  }
}
