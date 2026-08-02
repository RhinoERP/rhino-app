"use server";

import { revalidatePath } from "next/cache";
import type {
  CreateIssuedCheckInput,
  CreateReceivedCheckInput,
} from "@/lib/accounting-client";
import {
  createChequeEmitidoServer,
  createChequeRecibidoServer,
  debitarChequeEmitidoServer,
  rechazarChequeEmitidoServer,
  rechazarChequeRecibidoServer,
} from "@/lib/accounting-server";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Cheques recibidos ─────────────────────────────────────────────────────────

export async function createChequeRecibidoAction(
  orgSlug: string,
  input: Omit<CreateReceivedCheckInput, "orgId">
): Promise<ActionResult<{ id: string }>> {
  await guardOrganizationPermissionAccess(orgSlug, "treasury.checks.manage");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cheque = await createChequeRecibidoServer({
      ...input,
      orgId: org.id,
    });
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: cheque.id } };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error al registrar cheque recibido",
    };
  }
}

export async function rechazarChequeRecibidoAction(
  orgSlug: string,
  chequeId: string,
  cuentaBancariaId: string
): Promise<ActionResult<{ id: string }>> {
  await guardOrganizationPermissionAccess(orgSlug, "treasury.checks.manage");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cheque = await rechazarChequeRecibidoServer(
      chequeId,
      org.id,
      cuentaBancariaId
    );
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: cheque.id } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al rechazar cheque",
    };
  }
}

// ── Cheques emitidos ──────────────────────────────────────────────────────────

export async function createChequeEmitidoAction(
  orgSlug: string,
  input: Omit<CreateIssuedCheckInput, "orgId">
): Promise<ActionResult<{ id: string }>> {
  await guardOrganizationPermissionAccess(orgSlug, "treasury.checks.manage");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cheque = await createChequeEmitidoServer({ ...input, orgId: org.id });
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: cheque.id } };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Error al registrar cheque emitido",
    };
  }
}

export async function debitarChequeEmitidoAction(
  orgSlug: string,
  chequeId: string
): Promise<ActionResult<{ id: string }>> {
  await guardOrganizationPermissionAccess(orgSlug, "treasury.checks.manage");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cheque = await debitarChequeEmitidoServer(chequeId, org.id);
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: cheque.id } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error al debitar cheque",
    };
  }
}

export async function rechazarChequeEmitidoAction(
  orgSlug: string,
  chequeId: string
): Promise<ActionResult<{ id: string }>> {
  await guardOrganizationPermissionAccess(orgSlug, "treasury.checks.manage");
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { success: false, error: "Organización no encontrada" };
  }

  try {
    const cheque = await rechazarChequeEmitidoServer(chequeId, org.id);
    revalidatePath(`/org/${orgSlug}/tesoreria`);
    return { success: true, data: { id: cheque.id } };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Error al rechazar cheque emitido",
    };
  }
}
