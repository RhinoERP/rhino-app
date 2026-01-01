"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";

export type PaymentHistoryEntry = {
  id: string;
  amount: number;
  payment_method: Database["public"]["Enums"]["payment_method"];
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
};

type PaymentHistoryInput = {
  orgSlug: string;
  accountId: string;
  type: "receivable" | "payable";
  orgId?: string;
};

export async function getPaymentHistoryAction(
  input: PaymentHistoryInput
): Promise<{
  success: boolean;
  data?: PaymentHistoryEntry[];
  error?: string;
}> {
  try {
    let orgId = input.orgId;
    if (!orgId) {
      const org = await getOrganizationBySlug(input.orgSlug);
      if (!org?.id) {
        return { success: false, error: "Organización no encontrada" };
      }
      orgId = org.id;
    }

    const supabase = await createClient();

    if (input.type === "receivable") {
      const { data: receivablePayments, error: receivableError } =
        await supabase
          .from("receivable_payments")
          .select(
            "id, amount, payment_method, payment_date, reference_number, notes, created_at"
          )
          .eq("organization_id", orgId)
          .eq("account_receivable_id", input.accountId)
          .order("payment_date", { ascending: false });

      if (receivableError) {
        return {
          success: false,
          error: `No se pudo obtener el historial: ${receivableError.message}`,
        };
      }

      return {
        success: true,
        data: (receivablePayments as PaymentHistoryEntry[]) ?? [],
      };
    }

    const { data: payablePayments, error: payableError } = await supabase
      .from("payable_payments" as never)
      .select(
        "id, amount, payment_method, payment_date, reference_number, notes, created_at"
      )
      .eq("organization_id", orgId)
      .eq("account_payable_id", input.accountId)
      .order("payment_date", { ascending: false });

    if (payableError) {
      return {
        success: false,
        error: `No se pudo obtener el historial: ${payableError.message}`,
      };
    }

    return {
      success: true,
      data: (payablePayments as PaymentHistoryEntry[]) ?? [],
    };
  } catch (error) {
    console.error("Error obteniendo historial de pagos", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado obteniendo historial",
    };
  }
}
