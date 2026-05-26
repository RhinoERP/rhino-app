"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { BankMovement, CreateBankMovementInput } from "../types";

type Result =
  | { success: true; movement: BankMovement }
  | { success: false; error: string };

export async function createBankMovementAction(
  orgSlug: string,
  input: CreateBankMovementInput
): Promise<Result> {
  // Regla de negocio: si la cuenta contable es IIBB (2.1.03), bloquear
  if (input.accounting_account_code === "2.1.03") {
    return {
      success: false,
      error:
        "Las retenciones bancarias de Ingresos Brutos deben imputarse a Gastos Bancarios (5.1.01), no a Ingresos Brutos a Pagar (2.1.03). Esta cuenta es exclusiva para la facturación.",
    };
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org) return { success: false, error: "Organización no encontrada" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("bank_movements")
    .insert({
      organization_id: org.id,
      bank_account_id: input.bank_account_id,
      movement_type: input.movement_type,
      concept: input.concept,
      amount: input.amount,
      movement_date: input.movement_date,
      accounting_account_code: input.accounting_account_code ?? null,
      accounting_account_name: input.accounting_account_name ?? null,
      notes: input.notes ?? null,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating bank movement:", error);
    return { success: false, error: error.message };
  }

  return { success: true, movement: data as BankMovement };
}
