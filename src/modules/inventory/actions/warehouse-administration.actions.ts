"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  getWarehouseAdministrationData,
  replaceManagedWarehouseAssignments,
  saveManagedWarehouse,
} from "../service/warehouse-administration.service";
import type {
  ReplaceWarehouseAssignmentsInput,
  SaveWarehouseInput,
} from "../warehouse-admin.types";

function actionError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Datos inválidos";
  }
  return error instanceof Error
    ? error.message
    : "No se pudo guardar la configuración";
}

function revalidateWarehouses(orgSlug: string) {
  revalidatePath(`/org/${orgSlug}/configuracion/depositos`);
  revalidatePath(`/org/${orgSlug}/stock`);
  revalidatePath(`/org/${orgSlug}/venta-directa`);
  revalidatePath(`/org/${orgSlug}/compras`);
}

export async function getWarehouseAdministrationAction(orgSlug: string) {
  await ensure("organization.admin", orgSlug);
  return getWarehouseAdministrationData(orgSlug);
}

export async function saveWarehouseAction(input: SaveWarehouseInput) {
  await ensure("organization.admin", input.orgSlug);
  try {
    const warehouseId = await saveManagedWarehouse(input);
    revalidateWarehouses(input.orgSlug);
    return { success: true as const, warehouseId };
  } catch (error) {
    return { success: false as const, error: actionError(error) };
  }
}

export async function replaceWarehouseAssignmentsAction(
  input: ReplaceWarehouseAssignmentsInput
) {
  await ensure("organization.admin", input.orgSlug);
  try {
    await replaceManagedWarehouseAssignments(input);
    revalidateWarehouses(input.orgSlug);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: actionError(error) };
  }
}
