import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  CreateAdvanceInput,
  CreateReceiptInput,
  SaleAdvance,
} from "../types";
import { calculateReceiptSummary } from "../types";

export async function createSaleAdvance(
  input: CreateAdvanceInput
): Promise<{ id: string; advance_number: number }> {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const taxRate = input.tax_rate ?? 0.21;
  const tax_amount = truncateMoney(input.net_amount * taxRate);
  const total_amount = truncateMoney(input.net_amount + tax_amount);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sale_advances" as never)
    .insert({
      organization_id: org.id,
      description: input.description,
      net_amount: input.net_amount,
      tax_amount,
      total_amount,
      sale_id: input.sale_id ?? null,
      quote_id: input.quote_id ?? null,
      status: "pending",
    })
    .select("id, advance_number")
    .single();

  if (error || !data) {
    throw error ?? new Error("Error al crear anticipo");
  }

  return data as { id: string; advance_number: number };
}

export async function createAdvanceReceipt(
  input: CreateReceiptInput
): Promise<{ receiptId: string }> {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: advance, error: advErr } = await supabase
    .from("sale_advances" as never)
    .select("id, total_amount, status, organization_id")
    .eq("id", input.advance_id)
    .eq("organization_id", org.id)
    .single();

  if (advErr || !advance) {
    throw new Error("Anticipo no encontrado");
  }

  const adv = advance as { id: string; total_amount: number; status: string };
  if (adv.status !== "pending") {
    throw new Error("El anticipo ya fue cobrado o acreditado");
  }

  const summary = calculateReceiptSummary(adv.total_amount, input.items);
  if (!summary.isBalanced) {
    throw new Error(
      "El total cobrado no coincide con el importe del anticipo. Ajustá los métodos de pago."
    );
  }

  const { data: receipt, error: rcptErr } = await supabase
    .from("advance_receipts" as never)
    .insert({
      organization_id: org.id,
      advance_id: input.advance_id,
      total_amount: adv.total_amount,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (rcptErr || !receipt) {
    throw rcptErr ?? new Error("Error al crear recibo");
  }

  const receiptId = (receipt as { id: string }).id;

  const itemRows = input.items.map((item) => ({
    receipt_id: receiptId,
    item_type: item.item_type,
    amount: item.amount,
    reference: item.reference ?? null,
    bank_name: item.bank_name ?? null,
    due_date: item.due_date ?? null,
  }));

  const { error: itemsErr } = await supabase
    .from("advance_receipt_items" as never)
    .insert(itemRows);

  if (itemsErr) {
    throw itemsErr;
  }

  const { error: advanceUpdateErr } = await supabase
    .from("sale_advances" as never)
    .update({ status: "collected" })
    .eq("id", input.advance_id);

  if (advanceUpdateErr) {
    await supabase
      .from("advance_receipts" as never)
      .delete()
      .eq("id", receiptId);
    throw advanceUpdateErr;
  }

  return { receiptId };
}

export async function getSaleAdvances(orgSlug: string): Promise<SaleAdvance[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sale_advances" as never)
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }
  return data as SaleAdvance[];
}

export async function creditAdvanceWithNote(
  orgSlug: string,
  advanceId: string,
  creditNoteId: string
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("sale_advances" as never)
    .update({ status: "credited", credit_note_id: creditNoteId })
    .eq("id", advanceId)
    .eq("organization_id", org.id);

  if (error) {
    throw error;
  }
}
