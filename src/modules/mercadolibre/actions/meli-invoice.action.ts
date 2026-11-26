"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "@/modules/arca/errors";
import { reconcileMeliSaleInvoice } from "@/modules/arca/server/sale-invoicing.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { tryMeliFiscalAutomaticPublication } from "../service/meli-fiscal-automatic.service";
import {
  emitMercadoLibreInvoice,
  generateMeliInvoiceHtml,
} from "../service/meli-invoice.service";

export async function emitMeliInvoiceAction(orgSlug: string, saleId: string) {
  await ensure("mercadolibre.invoice", orgSlug);
  try {
    const data = await emitMercadoLibreInvoice(orgSlug, saleId);
    const accountingWarning =
      data.status === "authorized"
        ? await tryMeliFiscalAutomaticPublication(orgSlug, {
            type: "invoice",
            saleId,
          })
        : null;
    return { success: true as const, data, accountingWarning };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  } finally {
    revalidatePath(`/org/${orgSlug}/venta-directa/mercado-libre`);
    revalidatePath(`/org/${orgSlug}/venta-directa/mercado-libre/${saleId}`);
  }
}

export async function downloadMeliInvoiceAction(
  orgSlug: string,
  saleId: string
) {
  try {
    return {
      success: true as const,
      data: await generateMeliInvoiceHtml(orgSlug, saleId),
    };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}

export async function reconcileMeliInvoiceAction(
  orgSlug: string,
  saleId: string
) {
  try {
    const data = await reconcileMeliSaleInvoice(orgSlug, saleId);
    const accountingWarning =
      data.status === "authorized"
        ? await tryMeliFiscalAutomaticPublication(orgSlug, {
            type: "invoice",
            saleId,
          })
        : null;
    revalidatePath(`/org/${orgSlug}/venta-directa/mercado-libre/${saleId}`);
    return { success: true as const, data, accountingWarning };
  } catch (error) {
    return { success: false as const, error: toArcaUserMessage(error) };
  }
}
