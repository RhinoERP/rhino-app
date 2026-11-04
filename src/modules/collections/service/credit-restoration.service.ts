import { truncateMoney } from "@/lib/decimal";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export type AppliedCustomerCredit = {
  applicationId: string;
  customerCreditId: string;
  amount: number;
};

export type AppliedSupplierCredit = {
  supplierCreditId: string;
  amount: number;
};

export async function restoreCustomerCreditBalances({
  supabase,
  orgId,
  credits,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  credits: Array<{ customerCreditId: string; amount: number }>;
}): Promise<string | null> {
  for (const credit of credits) {
    const { data, error } = await supabase
      .from("customer_credits")
      .select("remaining_amount")
      .eq("id", credit.customerCreditId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error || !data) {
      return "No se pudo restaurar el saldo del crédito aplicado. Revisá manualmente la cobranza.";
    }

    const { error: updateError } = await supabase
      .from("customer_credits")
      .update({
        remaining_amount: truncateMoney(
          Number(data.remaining_amount ?? 0) + credit.amount
        ),
      })
      .eq("id", credit.customerCreditId)
      .eq("organization_id", orgId);

    if (updateError) {
      return "No se pudo restaurar el saldo del crédito aplicado. Revisá manualmente la cobranza.";
    }
  }

  return null;
}

export async function rollbackCustomerCreditApplications({
  supabase,
  orgId,
  applications,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  applications: AppliedCustomerCredit[];
}): Promise<string | null> {
  if (applications.length === 0) {
    return null;
  }

  const { error } = await supabase
    .from("customer_credit_applications")
    .delete()
    .eq("organization_id", orgId)
    .in(
      "id",
      applications.map((application) => application.applicationId)
    );

  if (error) {
    return "No se pudieron revertir las aplicaciones de crédito. Revisá manualmente la cobranza.";
  }

  return restoreCustomerCreditBalances({
    supabase,
    orgId,
    credits: applications.map((application) => ({
      customerCreditId: application.customerCreditId,
      amount: application.amount,
    })),
  });
}

export async function restoreSupplierCreditBalances({
  supabase,
  orgId,
  credits,
}: {
  supabase: SupabaseServerClient;
  orgId: string;
  credits: AppliedSupplierCredit[];
}): Promise<string | null> {
  for (const credit of credits) {
    const { data, error } = await supabase
      .from("supplier_credits" as never)
      .select("remaining_amount")
      .eq("id", credit.supplierCreditId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error || !data) {
      return "No se pudo restaurar el saldo del crédito aplicado. Revisá manualmente el pago.";
    }

    const { error: updateError } = await supabase
      .from("supplier_credits" as never)
      .update({
        remaining_amount: truncateMoney(
          Number(
            (data as { remaining_amount?: number | null }).remaining_amount ?? 0
          ) + credit.amount
        ),
      } as never)
      .eq("id", credit.supplierCreditId)
      .eq("organization_id", orgId);

    if (updateError) {
      return "No se pudo restaurar el saldo del crédito aplicado. Revisá manualmente el pago.";
    }
  }

  return null;
}
