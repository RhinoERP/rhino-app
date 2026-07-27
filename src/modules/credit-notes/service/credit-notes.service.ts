import { randomUUID } from "node:crypto";
import {
  buildNcVenta,
  type LineaDesglosadaInput,
} from "@/lib/accounting-client";
import {
  confirmAccountingEvent,
  previewAccountingEvent,
} from "@/lib/accounting-server";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { isAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import type { AnyEvento } from "@/modules/accounting/types";
import { getOrgSettings } from "@/modules/organizations/service/org-settings.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { deriveSaleCreditSupplier } from "@/modules/sales/service/sales.service";
import type { Database } from "@/types/supabase";
import type {
  CreateCreditNoteInput,
  CreateCreditNoteItemInput,
  CreateCreditNoteItemTaxInput,
  CreateCreditNoteResult,
  CreateCreditNoteSourceDocumentInput,
  CreateCreditNoteTaxInput,
  CreditNote,
  CreditNoteArcaStatus,
  CreditNoteMetrics,
  CreditNoteOriginType,
  PaginatedResult,
  SortParam,
} from "../types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type LinkedSaleForAccounting = {
  id: string;
  total_amount: number;
  total_tax_amount: number | null;
};

const CREDIT_NOTE_ITEM_SELECT = `
  credit_note_items(
    id,
    credit_note_id,
    sales_order_id,
    sales_order_item_id,
    sales_return_item_id,
    product_id,
    description,
    quantity,
    unit_price,
    discount_amount,
    net_amount,
    tax_amount,
    total_amount,
    products(name, sku, unit_of_measure),
    sales_order_items(unit_quantity, discount_percentage)
  ),
  credit_note_taxes(
    id,
    credit_note_id,
    tax_id,
    name,
    rate,
    base_amount,
    tax_amount,
    tax_code_snapshot
  ),
  credit_note_source_documents(
    id,
    credit_note_id,
    sales_order_id,
    applied_amount,
    invoice_type,
    invoice_number,
    arca_status,
    arca_point_of_sale,
    arca_voucher_number,
    arca_voucher_type_code,
    arca_voucher_date
  )
`;

function normalizeCreditNoteOriginType(value: unknown): CreditNoteOriginType {
  return value === "RETURN" || value === "PURCHASE_TARGET" || value === "OTHER"
    ? value
    : "MANUAL_ADJUSTMENT";
}

function resolveOriginType(input: CreateCreditNoteInput): CreditNoteOriginType {
  if (input.originType) {
    return input.originType;
  }

  if (input.salesReturnId) {
    return "RETURN";
  }

  return "MANUAL_ADJUSTMENT";
}

async function insertCreditNoteDetails(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  creditNoteId: string;
  items?: CreateCreditNoteItemInput[];
  itemTaxes?: CreateCreditNoteItemTaxInput[];
  taxes?: CreateCreditNoteTaxInput[];
  sourceDocuments?: CreateCreditNoteSourceDocumentInput[];
}) {
  const { supabase, orgId, creditNoteId } = params;

  const itemIdBySalesOrderItemId = new Map<string, string>();

  if (params.items?.length) {
    const itemRows = params.items.map((item) => {
      const id = item.id ?? randomUUID();
      if (item.salesOrderItemId) {
        itemIdBySalesOrderItemId.set(item.salesOrderItemId, id);
      }

      return {
        id,
        organization_id: orgId,
        credit_note_id: creditNoteId,
        sales_order_id: item.salesOrderId ?? null,
        sales_order_item_id: item.salesOrderItemId ?? null,
        sales_return_item_id: item.salesReturnItemId ?? null,
        product_id: item.productId ?? null,
        description: item.description,
        quantity: item.quantity,
        unit_price: truncateMoney(item.unitPrice),
        discount_amount: truncateMoney(item.discountAmount ?? 0),
        net_amount: truncateMoney(item.netAmount),
        tax_amount: truncateMoney(item.taxAmount ?? 0),
        total_amount: truncateMoney(item.totalAmount),
      };
    });

    const { error } = await supabase
      .from("credit_note_items" as never)
      .insert(itemRows as never);

    if (error) {
      throw new Error(
        `No se pudieron guardar las líneas de la nota de crédito: ${error.message}`
      );
    }
  }

  if (params.itemTaxes?.length) {
    const itemTaxesPayload = params.itemTaxes.map((tax) => ({
      organization_id: orgId,
      credit_note_id: creditNoteId,
      credit_note_item_id:
        tax.creditNoteItemId ??
        (tax.salesOrderItemId
          ? (itemIdBySalesOrderItemId.get(tax.salesOrderItemId) ?? null)
          : null),
      sales_order_item_id: tax.salesOrderItemId ?? null,
      product_id: tax.productId ?? null,
      tax_id: tax.taxId ?? null,
      name: tax.name,
      rate: tax.rate,
      base_amount: truncateMoney(tax.baseAmount),
      tax_amount: truncateMoney(tax.taxAmount),
      tax_code_snapshot: tax.taxCodeSnapshot ?? null,
      source: tax.source ?? "product",
    }));
    const missingItem = itemTaxesPayload.some(
      (tax) => !tax.credit_note_item_id
    );

    if (missingItem) {
      throw new Error(
        "No se pudieron vincular los impuestos por ítem de la nota de crédito."
      );
    }

    const { error } = await supabase
      .from("credit_note_item_taxes" as never)
      .insert(itemTaxesPayload as never);

    if (error) {
      throw new Error(
        `No se pudieron guardar los impuestos por ítem de la nota de crédito: ${error.message}`
      );
    }
  }

  if (params.taxes?.length) {
    const { error } = await supabase.from("credit_note_taxes" as never).insert(
      params.taxes.map((tax) => ({
        organization_id: orgId,
        credit_note_id: creditNoteId,
        tax_id: tax.taxId ?? null,
        name: tax.name,
        rate: tax.rate,
        base_amount: truncateMoney(tax.baseAmount),
        tax_amount: truncateMoney(tax.taxAmount),
        tax_code_snapshot: tax.taxCodeSnapshot ?? null,
      })) as never
    );

    if (error) {
      throw new Error(
        `No se pudieron guardar los impuestos de la nota de crédito: ${error.message}`
      );
    }
  }

  if (params.sourceDocuments?.length) {
    const { error } = await supabase
      .from("credit_note_source_documents" as never)
      .insert(
        params.sourceDocuments.map((source) => ({
          organization_id: orgId,
          credit_note_id: creditNoteId,
          sales_order_id: source.salesOrderId ?? null,
          applied_amount: truncateMoney(source.appliedAmount),
          invoice_type: source.invoiceType ?? null,
          invoice_number: source.invoiceNumber ?? null,
          arca_status: source.arcaStatus ?? null,
          arca_point_of_sale: source.arcaPointOfSale ?? null,
          arca_voucher_number: source.arcaVoucherNumber ?? null,
          arca_voucher_type_code: source.arcaVoucherTypeCode ?? null,
          arca_voucher_date: source.arcaVoucherDate ?? null,
        })) as never
      );

    if (error) {
      throw new Error(
        `No se pudieron guardar los comprobantes asociados de la nota de crédito: ${error.message}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Customer credit helpers
// ---------------------------------------------------------------------------

async function createNcCustomerCredit(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  customerId: string;
  ncAmount: number;
  creditNoteId: string;
}): Promise<void> {
  const { supabase, orgId, saleId, customerId, ncAmount, creditNoteId } =
    params;

  const creditSupplierId = await deriveSaleCreditSupplier(supabase, saleId);
  await supabase.from("customer_credits").insert({
    organization_id: orgId,
    customer_id: customerId,
    supplier_id: creditSupplierId,
    amount: ncAmount,
    remaining_amount: ncAmount,
    credit_note_id: creditNoteId,
    notes: `Saldo a favor generado por Nota de Crédito ${creditNoteId}`,
  });
}

async function cleanupCreditNoteRecord(params: {
  supabase: SupabaseServerClient;
  creditNoteId: string;
}): Promise<void> {
  await params.supabase
    .from("customer_credits")
    .delete()
    .eq("credit_note_id", params.creditNoteId);
  await params.supabase
    .from("credit_notes")
    .delete()
    .eq("id", params.creditNoteId);
}

async function buildCreditNoteAccountingPayload(params: {
  orgSlug: string;
  creditNote: {
    id: string;
    organization_id: string;
    customer_id: string;
    sales_order_id: string | null;
    credit_note_number: string | null;
    issue_date: string;
    amount: number;
  };
  linkedSale: LinkedSaleForAccounting;
  items?: CreateCreditNoteItemInput[];
  totalTaxAmount?: number;
}): Promise<AnyEvento | null> {
  const accountingIntegrationEnabled = await isAccountingIntegrationEnabled(
    params.orgSlug
  );

  if (!accountingIntegrationEnabled) {
    return null;
  }

  const lineItems: LineaDesglosadaInput[] | undefined = params.items?.length
    ? params.items.map((item) => ({
        accountCode: null,
        montoNeto: truncateMoney(item.netAmount),
        montoImpuestos: truncateMoney(item.taxAmount ?? 0),
      }))
    : undefined;

  return buildNcVenta(
    params.creditNote,
    {
      id: params.linkedSale.id,
      total_amount: params.linkedSale.total_amount,
      total_tax_amount: params.linkedSale.total_tax_amount,
    },
    {
      items: lineItems,
      totalTaxAmount: params.totalTaxAmount,
    }
  );
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

async function validateNcAmountAgainstSaleTotal(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  salesOrderId: string;
  amount: number;
  saleTotal: number;
}): Promise<void> {
  const { supabase, orgId, salesOrderId, amount, saleTotal } = params;

  const ncAmount = truncateMoney(amount);

  const { data: existingNcs } = await supabase
    .from("credit_notes")
    .select("amount, origin_type, sales_return_id")
    .eq("sales_order_id", salesOrderId)
    .eq("organization_id", orgId)
    .eq("status", "CONFIRMED");

  const existingNcTotal = truncateMoney(
    (existingNcs ?? []).reduce(
      // biome-ignore lint/suspicious/noExplicitAny: raw shape
      (acc: number, nc: any) => {
        if (nc.origin_type === "RETURN" && !nc.sales_return_id) {
          return acc;
        }

        return acc + Number(nc.amount);
      },
      0
    )
  );

  if (truncateMoney(existingNcTotal + ncAmount) > saleTotal) {
    throw new Error(
      `El total de notas de crédito emitidas ($${truncateMoney(existingNcTotal + ncAmount)}) superaría el total de la venta ($${saleTotal})`
    );
  }
}

// ---------------------------------------------------------------------------
// Public entry point: create
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrates multi-step NC flow intentionally
export async function createCreditNote(
  input: CreateCreditNoteInput
): Promise<CreateCreditNoteResult> {
  const {
    orgSlug,
    salesOrderId,
    amount,
    observations,
    salesReturnId,
    isHistorical,
    supplierId,
    customerId,
    issueDate,
    invoiceType,
  } = input;
  const originType = resolveOriginType(input);
  const reason = input.reason ?? observations ?? null;

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autenticado");
  }

  if (isHistorical) {
    if (!customerId) {
      throw new Error("Cliente requerido para NC histórica");
    }

    const { data: ncNum, error: rpcErr } = await supabase.rpc(
      "generate_credit_note_number",
      { org_id: org.id }
    );
    if (rpcErr || !ncNum) {
      throw new Error("No se pudo generar el número de nota de crédito");
    }

    const { data: ncRecord, error: ncInsertError } = await supabase
      .from("credit_notes")
      .insert({
        organization_id: org.id,
        sales_order_id: null,
        customer_id: customerId,
        supplier_id: supplierId ?? null,
        origin_type: originType,
        reason,
        purchase_target_credit_id: input.purchaseTargetCreditId ?? null,
        credit_note_number: ncNum,
        issue_date: issueDate ?? new Date().toISOString().split("T")[0],
        amount: truncateMoney(amount),
        invoice_type: (invoiceType ??
          "NOTA_DE_VENTA") as Database["public"]["Enums"]["invoice_type"],
        observations: observations ?? null,
        status: "CONFIRMED",
        is_historical: true,
        created_by: user.id,
      } as never)
      .select("id")
      .single();

    if (ncInsertError || !ncRecord) {
      throw new Error(
        `No se pudo crear la NC: ${ncInsertError?.message ?? "error desconocido"}`
      );
    }

    await supabase.from("customer_credits").insert({
      organization_id: org.id,
      customer_id: customerId,
      supplier_id: supplierId ?? null,
      amount: truncateMoney(amount),
      remaining_amount: truncateMoney(amount),
      credit_note_id: ncRecord.id,
      notes: `Saldo a favor por Nota de Crédito ${ncNum}`,
    });

    try {
      await insertCreditNoteDetails({
        supabase,
        orgId: org.id,
        creditNoteId: ncRecord.id,
        items: input.items,
        itemTaxes: input.itemTaxes,
        taxes: input.taxes,
        sourceDocuments: input.sourceDocuments,
      });
    } catch (error) {
      await cleanupCreditNoteRecord({ supabase, creditNoteId: ncRecord.id });
      throw error;
    }

    return {
      creditNoteId: ncRecord.id,
      creditNoteNumber: ncNum,
      accountingPayload: null,
    };
  }

  if (!salesOrderId) {
    throw new Error("La venta es requerida para NC no históricas");
  }

  const { data: sale } = await supabase
    .from("sales_orders")
    .select(
      "id, status, customer_id, total_amount, total_tax_amount, invoice_type"
    )
    .eq("id", salesOrderId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  if (!["CONFIRMED", "DISPATCH", "DELIVERED"].includes(sale.status)) {
    throw new Error(
      "Solo se pueden emitir notas de crédito para ventas confirmadas, despachadas o entregadas"
    );
  }

  if (!sale.customer_id) {
    throw new Error("La venta no tiene cliente asociado");
  }

  const sourceDocumentsTotal = truncateMoney(
    (input.sourceDocuments ?? []).reduce(
      (total, source) => total + Number(source.appliedAmount ?? 0),
      0
    )
  );
  const saleTotal = truncateMoney(Number(sale.total_amount ?? 0));
  const validationTotal =
    originType === "PURCHASE_TARGET" && sourceDocumentsTotal > 0
      ? sourceDocumentsTotal
      : saleTotal;

  if (truncateMoney(amount) > validationTotal) {
    throw new Error(
      `El monto de la nota de crédito ($${truncateMoney(amount)}) no puede superar el total de referencia ($${validationTotal})`
    );
  }

  if (originType !== "PURCHASE_TARGET") {
    await validateNcAmountAgainstSaleTotal({
      supabase,
      orgId: org.id,
      salesOrderId,
      amount,
      saleTotal,
    });
  }

  // Generate number atomically
  const { data: creditNoteNumber, error: rpcError } = await supabase.rpc(
    "generate_credit_note_number",
    { org_id: org.id }
  );

  if (rpcError || !creditNoteNumber) {
    throw new Error("No se pudo generar el número de nota de crédito");
  }

  const { data: record, error: insertError } = (await supabase
    .from("credit_notes")
    .insert({
      organization_id: org.id,
      sales_order_id: salesOrderId,
      customer_id: sale.customer_id,
      sales_return_id: salesReturnId ?? null,
      origin_type: originType,
      reason,
      purchase_target_credit_id: input.purchaseTargetCreditId ?? null,
      credit_note_number: creditNoteNumber,
      issue_date: new Date().toISOString().split("T")[0],
      amount: truncateMoney(amount),
      invoice_type: sale.invoice_type,
      observations: observations ?? null,
      status: "CONFIRMED",
      created_by: user.id,
    } as never)
    .select("id")
    .single()) as unknown as {
    data: { id: string } | null;
    error: { message: string } | null;
  };

  if (insertError || !record) {
    throw new Error(
      `No se pudo crear la nota de crédito: ${insertError?.message ?? "error desconocido"}`
    );
  }

  // Las NCs standalone siempre generan un saldo a favor del cliente
  // sin modificar la cuenta corriente. Las NCs de devolución no generan
  // crédito adicional porque el AR ya fue reducido por la devolución.
  if (!salesReturnId) {
    await createNcCustomerCredit({
      supabase,
      orgId: org.id,
      saleId: salesOrderId,
      customerId: sale.customer_id,
      ncAmount: truncateMoney(amount),
      creditNoteId: record.id,
    });
  }

  try {
    await insertCreditNoteDetails({
      supabase,
      orgId: org.id,
      creditNoteId: record.id,
      items: input.items,
      itemTaxes: input.itemTaxes,
      taxes: input.taxes,
      sourceDocuments: input.sourceDocuments,
    });
  } catch (error) {
    await cleanupCreditNoteRecord({ supabase, creditNoteId: record.id });
    throw error;
  }

  const totalTaxAmount = truncateMoney(
    (input.taxes ?? []).reduce(
      (sum, tax) => sum + Number(tax.taxAmount ?? 0),
      0
    )
  );

  const accountingParams = {
    supabase,
    orgSlug,
    orgId: org.id,
    creditNote: {
      id: record.id,
      organization_id: org.id,
      customer_id: sale.customer_id,
      sales_order_id: salesOrderId,
      credit_note_number: creditNoteNumber,
      issue_date: new Date().toISOString().split("T")[0],
      amount: truncateMoney(amount),
    },
    linkedSale: {
      id: sale.id,
      total_amount: saleTotal,
      total_tax_amount: sale.total_tax_amount,
    },
    items: input.items,
    totalTaxAmount,
  };

  const accountingPayload = await buildCreditNoteAccountingPayload({
    orgSlug: accountingParams.orgSlug,
    creditNote: accountingParams.creditNote,
    linkedSale: accountingParams.linkedSale,
    items: accountingParams.items,
    totalTaxAmount: accountingParams.totalTaxAmount,
  });

  if (!accountingPayload) {
    return {
      creditNoteId: record.id,
      creditNoteNumber,
      accountingPayload: null,
    };
  }

  const orgSettings = await getOrgSettings(orgSlug);
  const automaticAccountingEnabled = orgSettings.automatic_accounting_enabled;

  if (automaticAccountingEnabled) {
    try {
      const preview = await previewAccountingEvent(accountingPayload);
      if (preview.estadoImputacion === "COMPLETO") {
        await confirmAccountingEvent(accountingPayload);
        return {
          creditNoteId: record.id,
          creditNoteNumber,
          accountingPayload: null,
        };
      }
    } catch (previewError) {
      console.error(
        "No se pudo automatizar el asiento de NC, abriendo revisión manual",
        previewError
      );
    }
  }

  // Manual review path: return payload so the client can confirm as formal entry
  return {
    creditNoteId: record.id,
    creditNoteNumber,
    accountingPayload,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function normalizeCreditNoteArcaStatus(value: unknown): CreditNoteArcaStatus {
  return value === "pending" || value === "authorized" || value === "error"
    ? value
    : "not_requested";
}

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
function mapCreditNoteArcaFields(row: any) {
  return {
    arcaStatus: normalizeCreditNoteArcaStatus(row.arca_status),
    arcaCae: row.arca_cae ?? null,
    arcaCaeExpiresAt: row.arca_cae_expires_at ?? null,
    arcaAuthorizedAt: row.arca_authorized_at ?? null,
    arcaPointOfSale: row.arca_point_of_sale ?? null,
    arcaVoucherNumber: row.arca_voucher_number ?? null,
    arcaVoucherTypeCode: row.arca_voucher_type_code ?? null,
    arcaLastError: row.arca_last_error ?? null,
    arcaAssociatedVoucherTypeCode:
      row.arca_associated_voucher_type_code ?? null,
    arcaAssociatedPointOfSale: row.arca_associated_point_of_sale ?? null,
    arcaAssociatedVoucherNumber: row.arca_associated_voucher_number ?? null,
    arcaAssociatedVoucherDate: row.arca_associated_voucher_date ?? null,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
function mapCreditNoteCustomer(row: any): CreditNote["customer"] {
  return row.customers
    ? {
        id: row.customers.id,
        businessName: row.customers.business_name,
        fantasyName: row.customers.fantasy_name,
        email: row.customers.email ?? null,
        cuit: row.customers.cuit ?? null,
        taxCondition: row.customers.tax_condition ?? null,
        address: row.customers.address ?? null,
        city: row.customers.city ?? null,
        clientNumber: row.customers.client_number ?? null,
        dueDays:
          row.customers.due_days === null ||
          row.customers.due_days === undefined
            ? null
            : Number(row.customers.due_days),
      }
    : null;
}

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
function mapCreditNoteSale(row: any): CreditNote["sale"] {
  return row.sales_orders
    ? {
        saleNumber: row.sales_orders.sale_number,
        invoiceNumber: row.sales_orders.invoice_number,
        invoiceType: row.sales_orders.invoice_type,
        totalAmount: Number(row.sales_orders.total_amount),
        arcaStatus: row.sales_orders.arca_status ?? null,
        arcaPointOfSale: row.sales_orders.arca_point_of_sale ?? null,
        arcaVoucherNumber: row.sales_orders.arca_voucher_number ?? null,
        arcaVoucherTypeCode: row.sales_orders.arca_voucher_type_code ?? null,
        arcaAuthorizedAt: row.sales_orders.arca_authorized_at ?? null,
      }
    : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
function mapCreditNoteItem(item: any): CreditNote["items"][number] {
  return {
    id: item.id,
    creditNoteId: item.credit_note_id,
    salesOrderId: item.sales_order_id ?? null,
    salesOrderItemId: item.sales_order_item_id ?? null,
    salesReturnItemId: item.sales_return_item_id ?? null,
    productId: item.product_id ?? null,
    productName: item.products?.name ?? null,
    productSku: item.products?.sku ?? null,
    productUnitOfMeasure: item.products?.unit_of_measure ?? null,
    weightQuantity: toNullableNumber(item.sales_order_items?.unit_quantity),
    discountPercent: toNullableNumber(
      item.sales_order_items?.discount_percentage
    ),
    description: item.description ?? "Producto",
    quantity: Number(item.quantity ?? 0),
    unitPrice: Number(item.unit_price ?? 0),
    discountAmount: Number(item.discount_amount ?? 0),
    netAmount: Number(item.net_amount ?? 0),
    taxAmount: Number(item.tax_amount ?? 0),
    totalAmount: Number(item.total_amount ?? 0),
  };
}

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
function mapCreditNoteItems(row: any): CreditNote["items"] {
  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (row.credit_note_items ?? []).map((item: any) =>
    mapCreditNoteItem(item)
  );
}

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
function mapCreditNoteTaxes(row: any): CreditNote["taxes"] {
  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (row.credit_note_taxes ?? []).map((tax: any) => ({
    id: tax.id,
    creditNoteId: tax.credit_note_id,
    taxId: tax.tax_id ?? null,
    name: tax.name ?? "Impuesto",
    rate: Number(tax.rate ?? 0),
    baseAmount: Number(tax.base_amount ?? 0),
    taxAmount: Number(tax.tax_amount ?? 0),
    taxCodeSnapshot: tax.tax_code_snapshot ?? null,
  }));
}

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
function mapCreditNoteSourceDocuments(row: any): CreditNote["sourceDocuments"] {
  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (row.credit_note_source_documents ?? []).map((source: any) => ({
    id: source.id,
    creditNoteId: source.credit_note_id,
    salesOrderId: source.sales_order_id ?? null,
    appliedAmount: Number(source.applied_amount ?? 0),
    invoiceType: source.invoice_type ?? null,
    invoiceNumber: source.invoice_number ?? null,
    arcaStatus: source.arca_status ?? null,
    arcaPointOfSale: source.arca_point_of_sale ?? null,
    arcaVoucherNumber: source.arca_voucher_number ?? null,
    arcaVoucherTypeCode: source.arca_voucher_type_code ?? null,
    arcaVoucherDate: source.arca_voucher_date ?? null,
  }));
}

// biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
function mapCreditNoteRow(row: any): CreditNote {
  return {
    id: row.id,
    organizationId: row.organization_id,
    salesOrderId: row.sales_order_id,
    customerId: row.customer_id,
    salesReturnId: row.sales_return_id,
    purchaseTargetCreditId: row.purchase_target_credit_id ?? null,
    originType: normalizeCreditNoteOriginType(row.origin_type),
    reason: row.reason ?? null,
    creditNoteNumber: row.credit_note_number,
    issueDate: row.issue_date,
    amount: Number(row.amount),
    invoiceType: row.invoice_type,
    observations: row.observations,
    status: row.status,
    isHistorical: row.is_historical ?? false,
    createdAt: row.created_at,
    ...mapCreditNoteArcaFields(row),
    invoiceEmailStatus: row.invoice_email_status ?? "not_sent",
    invoiceEmailRecipient: row.invoice_email_recipient ?? null,
    invoiceEmailSentAt: row.invoice_email_sent_at ?? null,
    invoiceEmailDeliveredAt: row.invoice_email_delivered_at ?? null,
    invoiceEmailLastAttemptAt: row.invoice_email_last_attempt_at ?? null,
    invoiceEmailLastEvent: row.invoice_email_last_event ?? null,
    invoiceEmailLastEventAt: row.invoice_email_last_event_at ?? null,
    invoiceEmailLastError: row.invoice_email_last_error ?? null,
    items: mapCreditNoteItems(row),
    taxes: mapCreditNoteTaxes(row),
    sourceDocuments: mapCreditNoteSourceDocuments(row),
    customer: mapCreditNoteCustomer(row),
    sale: mapCreditNoteSale(row),
  };
}

export async function getCreditNotesByOrgSlug(
  orgSlug: string
): Promise<CreditNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("credit_notes")
    .select(
      `
      id,
      organization_id,
      sales_order_id,
      customer_id,
      sales_return_id,
      purchase_target_credit_id,
      origin_type,
      reason,
      credit_note_number,
      issue_date,
      amount,
      invoice_type,
      observations,
      status,
      is_historical,
      created_at,
      arca_status,
      arca_cae,
      arca_cae_expires_at,
      arca_authorized_at,
      arca_point_of_sale,
      arca_voucher_number,
      arca_voucher_type_code,
      arca_last_error,
      arca_associated_voucher_type_code,
      arca_associated_point_of_sale,
      arca_associated_voucher_number,
      arca_associated_voucher_date,
      invoice_email_status,
      invoice_email_recipient,
      invoice_email_sent_at,
      invoice_email_delivered_at,
      invoice_email_last_attempt_at,
      invoice_email_last_event,
      invoice_email_last_event_at,
      invoice_email_last_error,
      ${CREDIT_NOTE_ITEM_SELECT},
      customers(id, business_name, fantasy_name, email, cuit, tax_condition, address, city, client_number, due_days),
      sales_orders(sale_number, invoice_number, invoice_type, total_amount, arca_status, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_authorized_at)
    `
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (data as any[]).map(mapCreditNoteRow);
}

export async function getCreditNotesByCustomerId(
  orgSlug: string,
  customerId: string
): Promise<CreditNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("credit_notes")
    .select(
      `
      id,
      organization_id,
      sales_order_id,
      customer_id,
      sales_return_id,
      purchase_target_credit_id,
      origin_type,
      reason,
      credit_note_number,
      issue_date,
      amount,
      invoice_type,
      observations,
      status,
      is_historical,
      created_at,
      arca_status,
      arca_cae,
      arca_cae_expires_at,
      arca_authorized_at,
      arca_point_of_sale,
      arca_voucher_number,
      arca_voucher_type_code,
      arca_last_error,
      arca_associated_voucher_type_code,
      arca_associated_point_of_sale,
      arca_associated_voucher_number,
      arca_associated_voucher_date,
      invoice_email_status,
      invoice_email_recipient,
      invoice_email_sent_at,
      invoice_email_delivered_at,
      invoice_email_last_attempt_at,
      invoice_email_last_event,
      invoice_email_last_event_at,
      invoice_email_last_error,
      ${CREDIT_NOTE_ITEM_SELECT},
      customers(id, business_name, fantasy_name, email, cuit, tax_condition, address, city, client_number, due_days),
      sales_orders(sale_number, invoice_number, invoice_type, total_amount, arca_status, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_authorized_at),
      suppliers(name),
      customer_credits(remaining_amount)
    `
    )
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (data as any[]).map((row) => {
    const remaining = (row.customer_credits ?? []).reduce(
      // biome-ignore lint/suspicious/noExplicitAny: raw Supabase aggregate shape
      (sum: number, c: any) => sum + Number(c.remaining_amount ?? 0),
      0
    );

    return {
      ...mapCreditNoteRow(row),
      remainingAmount: truncateMoney(remaining),
      supplierName: row.suppliers?.name ?? null,
    };
  });
}

export async function getCreditNoteById(
  orgSlug: string,
  creditNoteId: string
): Promise<CreditNote | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("credit_notes")
    .select(
      `
      id,
      organization_id,
      sales_order_id,
      customer_id,
      sales_return_id,
      purchase_target_credit_id,
      origin_type,
      reason,
      credit_note_number,
      issue_date,
      amount,
      invoice_type,
      observations,
      status,
      is_historical,
      created_at,
      arca_status,
      arca_cae,
      arca_cae_expires_at,
      arca_authorized_at,
      arca_point_of_sale,
      arca_voucher_number,
      arca_voucher_type_code,
      arca_last_error,
      arca_associated_voucher_type_code,
      arca_associated_point_of_sale,
      arca_associated_voucher_number,
      arca_associated_voucher_date,
      invoice_email_status,
      invoice_email_recipient,
      invoice_email_sent_at,
      invoice_email_delivered_at,
      invoice_email_last_attempt_at,
      invoice_email_last_event,
      invoice_email_last_event_at,
      invoice_email_last_error,
      ${CREDIT_NOTE_ITEM_SELECT},
      customers(id, business_name, fantasy_name, email, cuit, tax_condition, address, city, client_number, due_days),
      sales_orders(sale_number, invoice_number, invoice_type, total_amount, arca_status, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_authorized_at)
    `
    )
    .eq("id", creditNoteId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapCreditNoteRow(data);
}

export async function getCreditNotesBySaleId(
  orgSlug: string,
  salesOrderId: string
): Promise<CreditNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("credit_notes")
    .select(
      `
      id,
      organization_id,
      sales_order_id,
      customer_id,
      sales_return_id,
      purchase_target_credit_id,
      origin_type,
      reason,
      credit_note_number,
      issue_date,
      amount,
      invoice_type,
      observations,
      status,
      is_historical,
      created_at,
      arca_status,
      arca_cae,
      arca_cae_expires_at,
      arca_authorized_at,
      arca_point_of_sale,
      arca_voucher_number,
      arca_voucher_type_code,
      arca_last_error,
      arca_associated_voucher_type_code,
      arca_associated_point_of_sale,
      arca_associated_voucher_number,
      arca_associated_voucher_date,
      invoice_email_status,
      invoice_email_recipient,
      invoice_email_sent_at,
      invoice_email_delivered_at,
      invoice_email_last_attempt_at,
      invoice_email_last_event,
      invoice_email_last_event_at,
      invoice_email_last_error,
      ${CREDIT_NOTE_ITEM_SELECT},
      customers(id, business_name, fantasy_name, email, cuit, tax_condition, address, city, client_number, due_days),
      sales_orders(sale_number, invoice_number, invoice_type, total_amount, arca_status, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_authorized_at)
    `
    )
    .eq("organization_id", org.id)
    .eq("sales_order_id", salesOrderId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (data as any[]).map(mapCreditNoteRow);
}

const CREDIT_NOTE_LIST_SELECT = `
  id,
  organization_id,
  sales_order_id,
  customer_id,
  sales_return_id,
  purchase_target_credit_id,
  origin_type,
  reason,
  credit_note_number,
  issue_date,
  amount,
  invoice_type,
  observations,
  status,
  is_historical,
  created_at,
  arca_status,
  arca_cae,
  arca_cae_expires_at,
  arca_authorized_at,
  arca_point_of_sale,
  arca_voucher_number,
  arca_voucher_type_code,
  arca_last_error,
  arca_associated_voucher_type_code,
  arca_associated_point_of_sale,
  arca_associated_voucher_number,
  arca_associated_voucher_date,
  invoice_email_status,
  invoice_email_recipient,
  invoice_email_sent_at,
  invoice_email_delivered_at,
  invoice_email_last_attempt_at,
  invoice_email_last_event,
  invoice_email_last_event_at,
  invoice_email_last_error,
  customers(id, business_name, fantasy_name),
  sales_orders(sale_number, invoice_number, invoice_type, total_amount, arca_status, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_authorized_at)
`;

export type CreditNotesPaginatedParams = {
  page: number;
  pageSize: number;
  sort?: SortParam[];
  search?: string;
  status?: string;
  customerId?: string;
};

export async function getCreditNotesPaginated(
  orgSlug: string,
  params: CreditNotesPaginatedParams
): Promise<PaginatedResult<CreditNote>> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return {
      data: [],
      totalCount: 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  const supabase = await createClient();

  let query = supabase
    .from("credit_notes")
    .select(CREDIT_NOTE_LIST_SELECT, { count: "exact" })
    .eq("organization_id", org.id);

  if (params.status && params.status !== "ALL") {
    query = query.eq("status", params.status as CreditNote["status"]);
  }

  if (params.customerId) {
    query = query.eq("customer_id", params.customerId);
  }

  if (params.search) {
    query = query.ilike("credit_note_number", `%${params.search}%`);
  }

  if (params.sort && params.sort.length > 0) {
    for (const s of params.sort) {
      query = query.order(s.id, { ascending: !s.desc });
    }
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error || !data) {
    return {
      data: [],
      totalCount: 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  return {
    // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
    data: (data as any[]).map(mapCreditNoteRow),
    totalCount: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getCreditNoteMetrics(
  orgSlug: string
): Promise<CreditNoteMetrics> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return {
      totalCount: 0,
      confirmedCount: 0,
      cancelledCount: 0,
      currentMonthCount: 0,
      currentMonthAmount: 0,
      lastMonthCount: 0,
      lastMonthAmount: 0,
    };
  }

  const supabase = await createClient();

  const now = new Date();
  const currentMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
  const lastMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1
  ).toISOString();
  const lastMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  const [
    { count: totalCount },
    { count: confirmedCount },
    { count: cancelledCount },
    currentMonthData,
    lastMonthData,
  ] = await Promise.all([
    supabase
      .from("credit_notes")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id),
    supabase
      .from("credit_notes")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "CONFIRMED"),
    supabase
      .from("credit_notes")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("status", "CANCELLED"),
    supabase
      .from("credit_notes")
      .select("amount")
      .eq("organization_id", org.id)
      .eq("status", "CONFIRMED")
      .gte("issue_date", currentMonthStart),
    supabase
      .from("credit_notes")
      .select("amount")
      .eq("organization_id", org.id)
      .eq("status", "CONFIRMED")
      .gte("issue_date", lastMonthStart)
      .lte("issue_date", lastMonthEnd),
  ]);

  const currentMonthAmount = (currentMonthData.data ?? []).reduce(
    (sum, r) => sum + Number(r.amount),
    0
  );
  const lastMonthAmount = (lastMonthData.data ?? []).reduce(
    (sum, r) => sum + Number(r.amount),
    0
  );

  return {
    totalCount: totalCount ?? 0,
    confirmedCount: confirmedCount ?? 0,
    cancelledCount: cancelledCount ?? 0,
    currentMonthCount: currentMonthData.data?.length ?? 0,
    currentMonthAmount: truncateMoney(currentMonthAmount),
    lastMonthCount: lastMonthData.data?.length ?? 0,
    lastMonthAmount: truncateMoney(lastMonthAmount),
  };
}

export async function getAllCreditNotesForExport(
  orgSlug: string,
  filters?: { status?: string }
): Promise<CreditNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  let query = supabase
    .from("credit_notes")
    .select(CREDIT_NOTE_LIST_SELECT)
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(10_000);

  if (filters?.status && filters.status !== "ALL") {
    query = query.eq("status", filters.status as CreditNote["status"]);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape
  return (data as any[]).map(mapCreditNoteRow);
}
