import { truncateMoney } from "@/lib/decimal";
import { generateId } from "@/lib/id";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { CreateHistoricalDebtInput, HistoricalDebtRow } from "../types";

async function getCurrentUserId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Usuario no autenticado");
  }
  return user.id;
}

async function processSingleDebt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  params: { row: HistoricalDebtRow; index: number }
): Promise<{ success: boolean; error?: string }> {
  const { row, index } = params;
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", row.customerId)
    .maybeSingle();
  if (!customer) {
    return {
      success: false,
      error: `Cliente no encontrado (fila ${index + 1})`,
    };
  }

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", row.supplierId)
    .maybeSingle();
  if (!supplier) {
    return {
      success: false,
      error: `Proveedor no encontrado (fila ${index + 1})`,
    };
  }

  const { data: lastSale } = await supabase
    .from("sales_orders")
    .select("sale_number")
    .eq("organization_id", orgId)
    .order("sale_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const saleNumber = (lastSale?.sale_number ?? 0) + 1;
  const saleDate = row.saleDate;
  const creditDays = row.creditDays;
  const saleDateObj = new Date(`${saleDate}T00:00:00`);
  saleDateObj.setDate(saleDateObj.getDate() + creditDays);
  const expirationDate = saleDateObj.toISOString().split("T")[0];
  const saleId = generateId();
  const totalAmount = truncateMoney(row.totalAmount);

  const { error: saleError } = await supabase.from("sales_orders").insert({
    id: saleId,
    organization_id: orgId,
    customer_id: row.customerId,
    supplier_id: row.supplierId,
    user_id: userId,
    sale_date: saleDate,
    status: "CONFIRMED",
    is_historical: true,
    total_amount: totalAmount,
    sub_total: totalAmount,
    total_tax_amount: 0,
    global_discount_percentage: 0,
    global_discount_amount: 0,
    invoice_type: "NOTA_DE_VENTA",
    credit_days: creditDays,
    expiration_date: expirationDate,
    sale_number: saleNumber,
    confirmed_at: new Date().toISOString(),
    observations: row.observations ?? null,
  });

  if (saleError) {
    return {
      success: false,
      error: `Error al crear venta: ${saleError.message}`,
    };
  }

  const { error: arError } = await supabase.from("accounts_receivable").insert({
    id: generateId(),
    organization_id: orgId,
    customer_id: row.customerId,
    sales_order_id: saleId,
    total_amount: totalAmount,
    pending_balance: totalAmount,
    due_date: expirationDate,
    status: "PENDING",
  });

  if (arError) {
    await supabase.from("sales_orders").delete().eq("id", saleId);
    return {
      success: false,
      error: `Error al crear cuenta corriente: ${arError.message}`,
    };
  }
  return { success: true };
}

export async function createHistoricalDebts(
  input: CreateHistoricalDebtInput
): Promise<{ imported: number; errors: string[] }> {
  const { orgSlug, debts } = input;
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const userId = await getCurrentUserId(supabase);
  const errorMessages: string[] = [];
  let imported = 0;

  for (let i = 0; i < debts.length; i++) {
    try {
      const result = await processSingleDebt(supabase, org.id, userId, {
        row: debts[i],
        index: i,
      });
      if (result.success) {
        imported += 1;
      } else if (result.error) {
        errorMessages.push(result.error);
      }
    } catch (err) {
      errorMessages.push(
        err instanceof Error ? err.message : "Error desconocido"
      );
    }
  }

  return { imported, errors: errorMessages };
}
