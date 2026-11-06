"use server";

import { createClient } from "@/lib/supabase/server";
import {
  resolvePayableExchangeRate,
  resolveReceivableExchangeRate,
} from "@/modules/collections/utils/payment-rate";
import { ensureCollectionsRead } from "@/modules/collections/utils/permissions";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export type PaymentRateResult = {
  success: boolean;
  currency: string | null;
  rate: number | null;
  missingInvoice: boolean;
  error?: string;
};

type GetPaymentRateInput = {
  orgSlug: string;
  type: "receivable" | "payable";
  accountId: string;
  paymentId?: string;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates tenant, account and historical payment before resolving its document rate.
export async function getPaymentRateAction(
  input: GetPaymentRateInput
): Promise<PaymentRateResult> {
  await ensureCollectionsRead(input.orgSlug);

  try {
    const org = await getOrganizationBySlug(input.orgSlug);
    if (!org?.id) {
      return {
        success: false,
        currency: null,
        rate: null,
        missingInvoice: false,
        error: "Organización no encontrada",
      };
    }

    const supabase = await createClient();

    if (input.type === "receivable") {
      const { data: receivable } = await supabase
        .from("accounts_receivable")
        .select("currency, sales_order_id, manual_fiscal_invoice_id")
        .eq("id", input.accountId)
        .eq("organization_id", org.id)
        .maybeSingle();

      if (!receivable) {
        return {
          success: false,
          currency: null,
          rate: null,
          missingInvoice: false,
          error: "Cuenta por cobrar no encontrada",
        };
      }

      const currency = receivable.currency ?? "ARS";
      if (currency !== "USD") {
        return { success: true, currency, rate: null, missingInvoice: false };
      }

      let existingPayment:
        | { exchange_rate: number | null; created_at: string | null }
        | undefined;
      if (input.paymentId) {
        const { data: payment, error } = await supabase
          .from("receivable_payments")
          .select("exchange_rate, created_at")
          .eq("organization_id", org.id)
          .eq("account_receivable_id", input.accountId)
          .eq("id", input.paymentId)
          .single();
        if (error) {
          throw new Error("No se pudo obtener el pago asociado a la cuenta.");
        }
        existingPayment = payment;
      }
      const rate = await resolveReceivableExchangeRate({
        supabase,
        orgId: org.id,
        receivable,
        existingPayment,
      });

      return {
        success: true,
        currency,
        rate,
        missingInvoice: rate == null,
      };
    }

    const { data: payable } = await supabase
      .from("accounts_payable" as never)
      .select(
        "currency, supplier_id, purchase_order_id, supplier_invoice_id, exchange_rate"
      )
      .eq("id", input.accountId)
      .eq("organization_id", org.id)
      .maybeSingle();

    if (!payable) {
      return {
        success: false,
        currency: null,
        rate: null,
        missingInvoice: false,
        error: "Cuenta por pagar no encontrada",
      };
    }

    const currency =
      (payable as { currency?: string | null }).currency ?? "ARS";
    if (currency !== "USD") {
      return { success: true, currency, rate: null, missingInvoice: false };
    }

    const rate = await resolvePayableExchangeRate({
      supabase,
      orgId: org.id,
      payable: payable as never,
    });

    return {
      success: true,
      currency,
      rate,
      missingInvoice: rate == null,
    };
  } catch (error) {
    return {
      success: false,
      currency: null,
      rate: null,
      missingInvoice: false,
      error:
        error instanceof Error
          ? error.message
          : "Error inesperado obteniendo la cotización",
    };
  }
}
