import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type { HistoricalCreditEntry } from "../types";

async function processSingleCredit(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  userId: string;
  row: HistoricalCreditEntry;
  index: number;
}): Promise<string | null> {
  const { supabase, orgId, userId, row, index } = params;
  const { data: ncNumber, error: rpcError } = await supabase.rpc(
    "generate_credit_note_number",
    { org_id: orgId }
  );
  if (rpcError || !ncNumber) {
    return `Fila ${index + 1}: No se pudo generar número de NC`;
  }

  const { data: nc, error: ncError } = await supabase
    .from("credit_notes")
    .insert({
      organization_id: orgId,
      customer_id: row.customerId,
      sales_order_id: null,
      supplier_id: row.supplierId,
      credit_note_number: ncNumber,
      issue_date: row.issueDate,
      amount: truncateMoney(row.totalAmount),
      invoice_type: (row.invoiceType ??
        "NOTA_DE_VENTA") as Database["public"]["Enums"]["invoice_type"],
      observations: row.observations ?? null,
      status: "CONFIRMED",
      is_historical: true,
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (ncError || !nc?.id) {
    return `Fila ${index + 1}: Error al crear NC: ${ncError?.message}`;
  }

  const { error: ccError } = await supabase.from("customer_credits").insert({
    organization_id: orgId,
    customer_id: row.customerId,
    amount: truncateMoney(row.totalAmount),
    remaining_amount: truncateMoney(row.totalAmount),
    currency: "ARS",
    credit_note_id: nc.id,
    notes: row.observations ?? null,
  });

  if (ccError) {
    await supabase.from("credit_notes").delete().eq("id", nc.id);
    return `Fila ${index + 1}: Error al crear saldo a favor: ${ccError.message}`;
  }

  return null;
}

export async function createHistoricalCredits(input: {
  orgSlug: string;
  credits: HistoricalCreditEntry[];
}): Promise<{ imported: number; errors: string[] }> {
  const { orgSlug, credits } = input;
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autenticado");
  }

  const errorMessages: string[] = [];
  let imported = 0;

  for (let i = 0; i < credits.length; i++) {
    try {
      const error = await processSingleCredit({
        supabase,
        orgId: org.id,
        userId: user.id,
        row: credits[i],
        index: i,
      });
      if (error) {
        errorMessages.push(error);
      } else {
        imported += 1;
      }
    } catch (err) {
      errorMessages.push(
        `Fila ${i + 1}: ${err instanceof Error ? err.message : "Error desconocido"}`
      );
    }
  }

  return { imported, errors: errorMessages };
}
