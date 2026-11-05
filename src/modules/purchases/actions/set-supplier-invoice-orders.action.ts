"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { setSupplierInvoiceOrders } from "../service/supplier-invoices.service";

const schema = z.object({
  orgSlug: z.string().min(1),
  invoiceId: z.string().uuid(),
  purchaseOrderIds: z.array(z.string().uuid()).max(100),
});
export async function setSupplierInvoiceOrdersAction(
  input: z.infer<typeof schema>
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Selección de factura/OC inválida" };
  }
  await ensure("purchases.manage", parsed.data.orgSlug);
  try {
    await setSupplierInvoiceOrders(parsed.data);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron actualizar los vínculos",
    };
  }
  revalidatePath(`/org/${parsed.data.orgSlug}/compras`, "layout");
  revalidatePath(`/org/${parsed.data.orgSlug}/cobranzas`);
  return { success: true };
}
