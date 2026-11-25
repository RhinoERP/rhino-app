"use server";

import { revalidatePath } from "next/cache";
import type { CaiActivation, CaiOperation, CaiSettings } from "../cai";
import {
  activateCai,
  getCaiSummary,
  getCaiUsageReport,
  importCai,
  reconcileCaiOperation,
  refreshCaiOperation,
  saveCaiSettings,
  startCaiOperation,
} from "../server/cai.service";

async function run(orgSlug: string, action: () => Promise<unknown>) {
  try {
    await action();
    revalidatePath(`/org/${orgSlug}/configuracion/comprobantes`);
    return { success: true as const, data: await getCaiSummary(orgSlug) };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo completar la operación de CAI.",
    };
  }
}

export async function getCaiSummaryAction(orgSlug: string) {
  try {
    return { success: true as const, data: await getCaiSummary(orgSlug) };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron consultar los CAI.",
    };
  }
}

export async function getCaiUsageReportAction(orgSlug: string, month: string) {
  try {
    return {
      success: true as const,
      data: await getCaiUsageReport(orgSlug, month),
    };
  } catch {
    return {
      success: false as const,
      error:
        "No se pudo exportar el período. Revisá tu acceso y el mes seleccionado.",
    };
  }
}
export async function saveCaiSettingsAction(
  orgSlug: string,
  input: CaiSettings
) {
  return await run(orgSlug, () => saveCaiSettings(orgSlug, input));
}
export async function importCaiAction(
  orgSlug: string,
  input: { cai: string; expiresAt: string }
) {
  return await run(orgSlug, () => importCai(orgSlug, input));
}
export async function activateCaiAction(orgSlug: string, input: CaiActivation) {
  return await run(orgSlug, () => activateCai(orgSlug, input));
}
export async function startCaiOperationAction(
  orgSlug: string,
  input: {
    requestKey: string;
    kind: CaiOperation["kind"];
    quantity?: number;
    authorizationId?: string;
  }
) {
  return await run(orgSlug, () => startCaiOperation(orgSlug, input));
}
export async function refreshCaiOperationAction(orgSlug: string, id: string) {
  return await run(orgSlug, () => refreshCaiOperation(orgSlug, id));
}
export async function reconcileCaiOperationAction(
  orgSlug: string,
  input: Parameters<typeof reconcileCaiOperation>[1]
) {
  return await run(orgSlug, () => reconcileCaiOperation(orgSlug, input));
}
