import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type PayableInvoiceDocument =
  Database["public"]["Functions"]["get_payable_invoice_documents"]["Returns"][number];

const BATCH_SIZE = 100;

/** Filter before PostgREST's row limit; page even when its cap is below our batch size. */
export async function getPayableInvoiceDocuments(
  supabase: SupabaseServerClient,
  orgId: string,
  payableIds: string[]
): Promise<PayableInvoiceDocument[]> {
  const ids = [...new Set(payableIds)];
  const documents: PayableInvoiceDocument[] = [];
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const batch = ids.slice(start, start + BATCH_SIZE);
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .rpc("get_payable_invoice_documents", { p_org_id: orgId })
        .in("account_payable_id", batch)
        .order("account_payable_id")
        .range(offset, offset + BATCH_SIZE - 1);
      if (error) {
        throw new Error(
          `No se pudieron obtener referencias de facturas: ${error.message}`
        );
      }
      if (!data?.length) {
        break;
      }
      documents.push(...data);
      offset += data.length;
    }
  }
  return documents;
}
