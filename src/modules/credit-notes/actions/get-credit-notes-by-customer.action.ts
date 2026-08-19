"use server";

import { COLLECTIONS_READ_PERMISSIONS } from "@/modules/collections/utils/permissions";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getCreditNotesByCustomerId } from "../service/credit-notes.service";
import type { CreditNote } from "../types";

export async function getCreditNotesByCustomerAction(
  orgSlug: string,
  customerId: string
): Promise<CreditNote[]> {
  // Se usa desde CC clientes para mostrar las NC asociadas a cada operación,
  // por lo que los usuarios con permiso de lectura de cobranzas también
  // deben poder verlas (además de quienes gestionan notas de crédito).
  await ensure(
    ["creditnotes.manage", ...COLLECTIONS_READ_PERMISSIONS],
    orgSlug
  );
  try {
    return await getCreditNotesByCustomerId(orgSlug, customerId);
  } catch {
    return [];
  }
}
