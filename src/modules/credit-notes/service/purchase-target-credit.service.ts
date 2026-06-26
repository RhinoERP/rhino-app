import "server-only";

import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import { createCreditNote } from "./credit-notes.service";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type InvoiceType = Database["public"]["Enums"]["invoice_type"];
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type PurchaseTargetBenefitType = "percentage" | "fixed_amount";

export type PurchaseTargetEligibleSale = {
  id: string;
  saleNumber: number | null;
  invoiceNumber: string | null;
  saleDate: string | null;
  invoiceType: InvoiceType;
  totalAmount: number;
  arcaStatus: string | null;
  arcaPointOfSale: number | null;
  arcaVoucherNumber: number | null;
  arcaVoucherTypeCode: number | null;
};

export type CalculatePurchaseTargetCreditInput = {
  orgSlug: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  thresholdAmount: number;
  benefitType: PurchaseTargetBenefitType;
  benefitValue: number;
};

export type CalculatePurchaseTargetCreditResult = {
  customerId: string;
  periodStart: string;
  periodEnd: string;
  eligibleSales: PurchaseTargetEligibleSale[];
  eligibleSalesTotal: number;
  thresholdAmount: number;
  qualifies: boolean;
  creditAmount: number;
};

export type CreatePurchaseTargetCreditNoteInput =
  CalculatePurchaseTargetCreditInput & {
    selectedSalesOrderIds: string[];
    observations?: string | null;
  };

export type CreatePurchaseTargetCreditNoteResult = {
  purchaseTargetId: string;
  purchaseTargetCreditId: string;
  creditNoteId: string;
  creditNoteNumber: string;
  creditAmount: number;
};

type LoadedTargetSale = PurchaseTargetEligibleSale & {
  customerId: string;
  taxes: Array<{
    taxId: string | null;
    name: string;
    rate: number;
    baseAmount: number;
    taxAmount: number;
    taxCodeSnapshot: string | null;
  }>;
};

function assertIsoDate(value: string, field: string) {
  if (!ISO_DATE_REGEX.test(value)) {
    throw new Error(`${field} debe tener formato YYYY-MM-DD.`);
  }
}

function calculateCreditAmount(params: {
  eligibleSalesTotal: number;
  thresholdAmount: number;
  benefitType: PurchaseTargetBenefitType;
  benefitValue: number;
}) {
  if (params.eligibleSalesTotal < params.thresholdAmount) {
    return 0;
  }

  if (params.benefitType === "percentage") {
    return truncateMoney(
      params.eligibleSalesTotal * (Math.max(0, params.benefitValue) / 100)
    );
  }

  return truncateMoney(Math.max(0, params.benefitValue));
}

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase query shape
function mapEligibleSale(row: any): PurchaseTargetEligibleSale {
  return {
    id: row.id,
    saleNumber: row.sale_number ?? null,
    invoiceNumber: row.invoice_number ?? null,
    saleDate: row.sale_date ?? null,
    invoiceType: row.invoice_type,
    totalAmount: truncateMoney(Number(row.total_amount ?? 0)),
    arcaStatus: row.arca_status ?? null,
    arcaPointOfSale: row.arca_point_of_sale ?? null,
    arcaVoucherNumber: row.arca_voucher_number ?? null,
    arcaVoucherTypeCode: row.arca_voucher_type_code ?? null,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase query shape
function mapLoadedTargetSale(row: any): LoadedTargetSale {
  return {
    ...mapEligibleSale(row),
    customerId: row.customer_id,
    // biome-ignore lint/suspicious/noExplicitAny: raw nested tax shape
    taxes: (row.taxes ?? []).map((tax: any) => ({
      taxId: tax.tax_id ?? null,
      name: tax.name ?? "Impuesto",
      rate: Number(tax.rate ?? 0),
      baseAmount: truncateMoney(Number(tax.base_amount ?? 0)),
      taxAmount: truncateMoney(Number(tax.tax_amount ?? 0)),
      taxCodeSnapshot: tax.tax_code_snapshot ?? null,
    })),
  };
}

async function getCurrentUserId(supabase: SupabaseServerClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    throw new Error("No autenticado");
  }

  return user.id;
}

async function loadEligibleSales(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  input: CalculatePurchaseTargetCreditInput;
}): Promise<LoadedTargetSale[]> {
  assertIsoDate(params.input.periodStart, "periodStart");
  assertIsoDate(params.input.periodEnd, "periodEnd");

  const { data, error } = await params.supabase
    .from("sales_orders")
    .select(
      `
      id,
      sale_number,
      invoice_number,
      sale_date,
      customer_id,
      invoice_type,
      total_amount,
      arca_status,
      arca_point_of_sale,
      arca_voucher_number,
      arca_voucher_type_code,
      taxes:sales_order_taxes(
        tax_id,
        name,
        rate,
        base_amount,
        tax_amount,
        tax_code_snapshot
      )
    `
    )
    .eq("organization_id", params.orgId)
    .eq("customer_id", params.input.customerId)
    .in("status", ["CONFIRMED", "DISPATCH", "DELIVERED"])
    .eq("arca_status", "authorized")
    .gte("sale_date", params.input.periodStart)
    .lte("sale_date", params.input.periodEnd)
    .order("sale_date", { ascending: true });

  if (error) {
    throw new Error(
      `No se pudieron calcular ventas elegibles: ${error.message}`
    );
  }

  return (data ?? []).map(mapLoadedTargetSale);
}

export async function calculatePurchaseTargetCredit(
  input: CalculatePurchaseTargetCreditInput
): Promise<CalculatePurchaseTargetCreditResult> {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const eligibleSales = await loadEligibleSales({
    supabase,
    orgId: org.id,
    input,
  });
  const eligibleSalesTotal = truncateMoney(
    eligibleSales.reduce((sum, sale) => sum + sale.totalAmount, 0)
  );
  const thresholdAmount = truncateMoney(Math.max(0, input.thresholdAmount));
  const creditAmount = calculateCreditAmount({
    eligibleSalesTotal,
    thresholdAmount,
    benefitType: input.benefitType,
    benefitValue: input.benefitValue,
  });

  return {
    customerId: input.customerId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    eligibleSales,
    eligibleSalesTotal,
    thresholdAmount,
    qualifies: creditAmount > 0,
    creditAmount,
  };
}

function buildFiscalDistribution(params: {
  selectedSales: LoadedTargetSale[];
  creditAmount: number;
}) {
  const selectedTotal = truncateMoney(
    params.selectedSales.reduce((sum, sale) => sum + sale.totalAmount, 0)
  );

  if (selectedTotal <= 0) {
    throw new Error("Las facturas seleccionadas no tienen total válido.");
  }

  const sourceDocuments = params.selectedSales.map((sale) => {
    const ratio = sale.totalAmount / selectedTotal;
    return {
      salesOrderId: sale.id,
      appliedAmount: truncateMoney(params.creditAmount * ratio),
      invoiceType: sale.invoiceType,
      invoiceNumber: sale.invoiceNumber,
      arcaStatus: sale.arcaStatus,
      arcaPointOfSale: sale.arcaPointOfSale,
      arcaVoucherNumber: sale.arcaVoucherNumber,
      arcaVoucherTypeCode: sale.arcaVoucherTypeCode,
      arcaVoucherDate: sale.saleDate,
    };
  });

  const taxesByKey = new Map<
    string,
    {
      taxId: string | null;
      name: string;
      rate: number;
      baseAmount: number;
      taxAmount: number;
      taxCodeSnapshot: string | null;
    }
  >();

  for (const sale of params.selectedSales) {
    const saleRatio =
      sale.totalAmount > 0 ? sale.totalAmount / selectedTotal : 0;
    const saleCreditAmount = truncateMoney(params.creditAmount * saleRatio);
    const creditRatio =
      sale.totalAmount > 0 ? saleCreditAmount / sale.totalAmount : 0;

    for (const tax of sale.taxes) {
      const key = `${tax.taxId ?? tax.name}:${tax.rate}:${tax.taxCodeSnapshot ?? ""}`;
      const current = taxesByKey.get(key) ?? {
        taxId: tax.taxId,
        name: tax.name,
        rate: tax.rate,
        baseAmount: 0,
        taxAmount: 0,
        taxCodeSnapshot: tax.taxCodeSnapshot,
      };
      current.baseAmount = truncateMoney(
        current.baseAmount + tax.baseAmount * creditRatio
      );
      current.taxAmount = truncateMoney(
        current.taxAmount + tax.taxAmount * creditRatio
      );
      taxesByKey.set(key, current);
    }
  }

  return {
    sourceDocuments,
    taxes: Array.from(taxesByKey.values()),
  };
}

export async function createPurchaseTargetCreditNote(
  input: CreatePurchaseTargetCreditNoteInput
): Promise<CreatePurchaseTargetCreditNoteResult> {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (!input.selectedSalesOrderIds.length) {
    throw new Error("Seleccioná al menos una factura asociada.");
  }

  const supabase = await createClient();
  const userId = await getCurrentUserId(supabase);
  const calculation = await calculatePurchaseTargetCredit(input);

  if (!calculation.qualifies || calculation.creditAmount <= 0) {
    throw new Error("El cliente no cumple el objetivo indicado.");
  }

  const selectedIds = new Set(input.selectedSalesOrderIds);
  const selectedSales = (
    await loadEligibleSales({
      supabase,
      orgId: org.id,
      input,
    })
  ).filter((sale) => selectedIds.has(sale.id));

  if (selectedSales.length !== selectedIds.size) {
    throw new Error(
      "Una o más facturas seleccionadas no son elegibles o no están autorizadas en ARCA."
    );
  }

  const invoiceTypes = new Set(selectedSales.map((sale) => sale.invoiceType));
  if (invoiceTypes.size !== 1) {
    throw new Error(
      "Las facturas asociadas deben tener el mismo tipo fiscal para emitir una única NC."
    );
  }

  const selectedTotal = truncateMoney(
    selectedSales.reduce((sum, sale) => sum + sale.totalAmount, 0)
  );
  if (calculation.creditAmount > selectedTotal) {
    throw new Error(
      "El monto de la NC no puede superar el total de las facturas seleccionadas."
    );
  }

  const { sourceDocuments, taxes } = buildFiscalDistribution({
    selectedSales,
    creditAmount: calculation.creditAmount,
  });

  const { data: target, error: targetError } = await supabase
    .from("purchase_targets" as never)
    .insert({
      organization_id: org.id,
      customer_id: input.customerId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      threshold_amount: truncateMoney(input.thresholdAmount),
      benefit_type: input.benefitType,
      benefit_value: truncateMoney(input.benefitValue),
      status: "CONFIRMED",
      created_by: userId,
    } as never)
    .select("id")
    .single();

  if (targetError || !target) {
    throw new Error(
      `No se pudo guardar el objetivo de compra: ${targetError?.message ?? "error desconocido"}`
    );
  }
  const targetRecord = target as { id: string };

  const { data: targetCredit, error: creditError } = await supabase
    .from("purchase_target_credits" as never)
    .insert({
      organization_id: org.id,
      purchase_target_id: targetRecord.id,
      customer_id: input.customerId,
      eligible_sales_total: calculation.eligibleSalesTotal,
      credit_amount: calculation.creditAmount,
      selected_sales_order_ids: input.selectedSalesOrderIds,
      status: "CONFIRMED",
      created_by: userId,
    } as never)
    .select("id")
    .single();

  if (creditError || !targetCredit) {
    throw new Error(
      `No se pudo guardar el crédito por objetivo: ${creditError?.message ?? "error desconocido"}`
    );
  }
  const targetCreditRecord = targetCredit as { id: string };

  const firstSale = selectedSales[0];
  const result = await createCreditNote({
    orgSlug: input.orgSlug,
    salesOrderId: firstSale.id,
    amount: calculation.creditAmount,
    observations: input.observations ?? null,
    originType: "PURCHASE_TARGET",
    reason: "Bonificación por objetivo de compra",
    purchaseTargetCreditId: targetCreditRecord.id,
    sourceDocuments,
    taxes,
    items: [
      {
        salesOrderId: firstSale.id,
        description: `Bonificación por objetivo de compra ${input.periodStart} a ${input.periodEnd}`,
        quantity: 1,
        unitPrice: calculation.creditAmount,
        netAmount: truncateMoney(
          Math.max(
            0,
            calculation.creditAmount -
              taxes.reduce((sum, tax) => sum + tax.taxAmount, 0)
          )
        ),
        taxAmount: truncateMoney(
          taxes.reduce((sum, tax) => sum + tax.taxAmount, 0)
        ),
        totalAmount: calculation.creditAmount,
      },
    ],
  });

  await supabase
    .from("purchase_target_credits" as never)
    .update({ credit_note_id: result.creditNoteId } as never)
    .eq("id" as never, targetCreditRecord.id);

  return {
    purchaseTargetId: targetRecord.id,
    purchaseTargetCreditId: targetCreditRecord.id,
    creditNoteId: result.creditNoteId,
    creditNoteNumber: result.creditNoteNumber,
    creditAmount: calculation.creditAmount,
  };
}
