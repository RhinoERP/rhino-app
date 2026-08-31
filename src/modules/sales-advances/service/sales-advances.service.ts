import "server-only";

import { buildFacturaVentaManual } from "@/lib/accounting-client";
import {
  confirmAccountingEvent,
  previewAccountingEvent,
} from "@/lib/accounting-server";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { isAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import { assertCanManageOrganizationArca } from "@/modules/arca/server/access";
import { emitCreditNote } from "@/modules/arca/server/credit-note-invoicing.service";
import { emitSaleInvoice } from "@/modules/arca/server/sale-invoicing.service";
import { createCreditNote } from "@/modules/credit-notes/service/credit-notes.service";
import {
  getOrganizationMembersWithUsersAdmin,
  getOrganizationSalesMembersBySlug,
} from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";
import {
  balanceAfterAdvances,
  canCreatePreventaAdvance,
} from "../preventa-advance";
import { prorateFiscalSnapshots } from "../proration";
import type {
  CreateSalesAdvanceInput,
  IssuePreventaBalanceInput,
  IssueSalesAdvanceInput,
  SalesAdvance,
  SalesAdvanceListItem,
  SalesAdvanceListParams,
  SalesAdvanceSummary,
  SalesAdvancesPaginatedResult,
  SettleSalesAdvanceInput,
} from "../types";

// biome-ignore lint/suspicious/noExplicitAny: generated types are refreshed after applying this migration.
type Raw = Record<string, any>;
type Supabase = Awaited<ReturnType<typeof createClient>>;

function advanceTable(supabase: Supabase) {
  // biome-ignore lint/suspicious/noExplicitAny: table is new until generated database types are refreshed.
  return supabase.from("sales_advances" as never) as any;
}

function money(value: unknown) {
  return truncateMoney(Number(value ?? 0));
}

function mapAdvance(row: Raw): SalesAdvance {
  return {
    id: row.id,
    organizationId: row.organization_id,
    quoteId: row.quote_id ?? null,
    finalSalesOrderId: row.final_sales_order_id,
    originType: row.origin_type ?? "SALE",
    preventaSalesOrderId: row.preventa_sales_order_id ?? null,
    appliedAmount: money(row.applied_amount),
    pendingApplicationAmount: Math.max(
      0,
      money(row.amount) - money(row.applied_amount)
    ),
    advanceSalesOrderId: row.advance_sales_order_id ?? null,
    advanceReceivableId: row.advance_receivable_id ?? null,
    creditNoteId: row.credit_note_id ?? null,
    customerCreditId: row.customer_credit_id ?? null,
    finalReceivableId: row.final_receivable_id ?? null,
    settlementPaymentId: row.settlement_payment_id ?? null,
    creditApplicationId: row.credit_application_id ?? null,
    percentageSnapshot:
      row.percentage_snapshot === null ? null : Number(row.percentage_snapshot),
    amount: money(row.amount),
    currency: row.currency ?? "ARS",
    status: row.status,
    lastError: row.last_error ?? null,
    fiscalSnapshot: row.fiscal_snapshot ?? null,
  };
}

async function hydrateAdvance(
  supabase: Supabase,
  row: Raw
): Promise<SalesAdvance> {
  const [advanceSaleResult, creditNoteResult] = await Promise.all([
    row.advance_sales_order_id
      ? supabase
          .from("sales_orders")
          .select("invoice_number, arca_cae")
          .eq("id", row.advance_sales_order_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    row.credit_note_id
      ? supabase
          .from("credit_notes")
          .select("credit_note_number, arca_cae")
          .eq("id", row.credit_note_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    ...mapAdvance(row),
    advanceInvoiceNumber: advanceSaleResult.data?.invoice_number ?? null,
    advanceArcaCae: advanceSaleResult.data?.arca_cae ?? null,
    creditNoteNumber: creditNoteResult.data?.credit_note_number ?? null,
    creditNoteArcaCae: creditNoteResult.data?.arca_cae ?? null,
  };
}

function relatedRow(value: unknown): Raw | null {
  if (Array.isArray(value)) {
    return (value[0] as Raw | undefined) ?? null;
  }
  return (value as Raw | null | undefined) ?? null;
}

function mapAdvanceListItem(
  row: Raw,
  sellersByUserId: Map<string, string | null>
): SalesAdvanceListItem {
  const finalSale = relatedRow(row.final_sale);
  const customer = relatedRow(finalSale?.customer);
  const finalReceivable = relatedRow(row.final_receivable);
  const finalSaleTotal = money(finalSale?.total_amount);
  const hasFinalReceivable = Boolean(finalReceivable?.id);
  const advanceSale = relatedRow(row.advance_sale);
  const creditNote = relatedRow(row.credit_note);
  const sellerId = (finalSale?.user_id as string | null | undefined) ?? null;

  return {
    ...mapAdvance(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finalBalance: hasFinalReceivable
      ? money(finalReceivable?.pending_balance)
      : Math.max(0, finalSaleTotal - money(row.amount)),
    finalBalanceEstimated: !hasFinalReceivable,
    finalSale: {
      id: finalSale?.id ?? row.final_sales_order_id,
      saleNumber:
        finalSale?.sale_number === null || finalSale?.sale_number === undefined
          ? null
          : Number(finalSale.sale_number),
      invoiceNumber: finalSale?.invoice_number ?? null,
      totalAmount: finalSaleTotal,
    },
    customer: customer?.id
      ? {
          id: customer.id,
          businessName: customer.business_name ?? "Cliente sin nombre",
          fantasyName: customer.fantasy_name ?? null,
        }
      : null,
    seller: sellerId
      ? { id: sellerId, name: sellersByUserId.get(sellerId) ?? null }
      : null,
    advanceInvoiceNumber: advanceSale?.invoice_number ?? null,
    advanceArcaCae: advanceSale?.arca_cae ?? null,
    creditNoteNumber: creditNote?.credit_note_number ?? null,
    creditNoteArcaCae: creditNote?.arca_cae ?? null,
  };
}

async function assertCanReadAdvanceForSale(params: {
  supabase: Supabase;
  orgSlug: string;
  orgId: string;
  finalSaleId: string;
}) {
  const access = await getSalesAccessContext(params.orgSlug);
  if (!access.canRead) {
    throw new Error("No tienes permisos para ver anticipos");
  }
  const { data: sale, error } = await params.supabase
    .from("sales_orders")
    .select("id, user_id")
    .eq("id", params.finalSaleId)
    .eq("organization_id", params.orgId)
    .maybeSingle();
  if (error || !sale) {
    throw new Error("Venta final no encontrada");
  }
  if (access.scope === "own" && sale.user_id !== access.userId) {
    throw new Error("No tienes permisos para ver este anticipo");
  }
  return access;
}

async function resolveSalesAdvanceSearch(params: {
  supabase: Supabase;
  orgId: string;
  search: string;
}) {
  const term = params.search.trim();
  if (!term) {
    return null;
  }
  const numericSaleNumber = Number(term);
  const [
    customersResult,
    saleDocumentsResult,
    advanceDocumentsResult,
    notesResult,
  ] = await Promise.all([
    params.supabase
      .from("customers")
      .select("id")
      .eq("organization_id", params.orgId)
      .or(`business_name.ilike.%${term}%,fantasy_name.ilike.%${term}%`)
      .limit(200),
    params.supabase
      .from("sales_orders")
      .select("id")
      .eq("organization_id", params.orgId)
      .ilike("invoice_number", `%${term}%`)
      .limit(200),
    params.supabase
      .from("sales_orders")
      .select("id")
      .eq("organization_id", params.orgId)
      .ilike("invoice_number", `%${term}%`)
      .eq("document_type" as never, "ADVANCE")
      .limit(200),
    params.supabase
      .from("credit_notes")
      .select("id")
      .eq("organization_id", params.orgId)
      .ilike("credit_note_number", `%${term}%`)
      .limit(200),
  ]);

  const customerIds = (customersResult.data ?? []).map(
    (customer) => customer.id
  );
  const customerSalesResult = customerIds.length
    ? await params.supabase
        .from("sales_orders")
        .select("id")
        .eq("organization_id", params.orgId)
        .in("customer_id", customerIds)
        .limit(200)
    : { data: [] as { id: string }[] };
  const saleNumberResult = Number.isInteger(numericSaleNumber)
    ? await params.supabase
        .from("sales_orders")
        .select("id")
        .eq("organization_id", params.orgId)
        .eq("sale_number", numericSaleNumber)
        .limit(200)
    : { data: [] as { id: string }[] };

  const finalSaleIds = [
    ...(saleDocumentsResult.data ?? []),
    ...(customerSalesResult.data ?? []),
    ...(saleNumberResult.data ?? []),
  ].map((sale) => sale.id);
  const advanceSaleIds = (advanceDocumentsResult.data ?? []).map(
    (sale) => sale.id
  );
  const creditNoteIds = (notesResult.data ?? []).map((note) => note.id);
  const clauses = [
    finalSaleIds.length
      ? `final_sales_order_id.in.(${[...new Set(finalSaleIds)].join(",")})`
      : null,
    advanceSaleIds.length
      ? `advance_sales_order_id.in.(${[...new Set(advanceSaleIds)].join(",")})`
      : null,
    creditNoteIds.length
      ? `credit_note_id.in.(${[...new Set(creditNoteIds)].join(",")})`
      : null,
  ].filter((clause): clause is string => Boolean(clause));

  return clauses.length ? clauses.join(",") : "id.is.null";
}

async function assertCanManageAdvance(params: {
  orgSlug: string;
  saleUserId?: string | null;
  requiresArca?: boolean;
}) {
  const access = await getSalesAccessContext(params.orgSlug);
  if (!access.canManage) {
    throw new Error("No tienes permisos para gestionar anticipos");
  }
  if (
    params.saleUserId &&
    !access.isOrganizationAdmin &&
    !access.canManageAll &&
    access.userId !== params.saleUserId
  ) {
    throw new Error("Solo puedes gestionar anticipos de tus propias ventas");
  }
  if (params.requiresArca) {
    await assertCanManageOrganizationArca(params.orgSlug);
  }
}

async function getAdvance(
  supabase: Supabase,
  orgId: string,
  advanceId: string
) {
  const { data, error } = await advanceTable(supabase)
    .select("*")
    .eq("id", advanceId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo obtener el anticipo: ${error.message}`);
  }
  if (!data) {
    throw new Error("Anticipo no encontrado");
  }
  return data as Raw;
}

async function updateAdvance(
  supabase: Supabase,
  orgId: string,
  advanceId: string,
  payload: Raw
) {
  const { error } = await advanceTable(supabase)
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", advanceId)
    .eq("organization_id", orgId);
  if (error) {
    throw new Error(`No se pudo actualizar el anticipo: ${error.message}`);
  }
}

async function requireActor(supabase: Supabase) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    throw new Error("No autenticado");
  }
  return data.user.id;
}

async function assertSalesAdvancesEnabled(supabase: Supabase, orgId: string) {
  const { data, error } = await supabase
    .from("organizations")
    .select("sales_advances_enabled")
    .eq("id", orgId)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo obtener la configuración: ${error.message}`);
  }
  if ((data as Raw | null)?.sales_advances_enabled === false) {
    throw new Error(
      "Los anticipos están deshabilitados para esta organización"
    );
  }
}

async function ensureReceivable(params: {
  supabase: Supabase;
  orgId: string;
  saleId: string;
  customerId: string;
  amount: number;
  dueDate: string;
}) {
  const { data: existing, error: existingError } = await params.supabase
    .from("accounts_receivable")
    .select("id")
    .eq("organization_id", params.orgId)
    .eq("sales_order_id", params.saleId)
    .maybeSingle();
  if (existingError) {
    throw new Error(existingError.message);
  }
  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await params.supabase
    .from("accounts_receivable")
    .insert({
      organization_id: params.orgId,
      customer_id: params.customerId,
      sales_order_id: params.saleId,
      total_amount: params.amount,
      pending_balance: params.amount,
      due_date: params.dueDate,
      status: "PENDING",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`No se pudo crear la cuenta por cobrar: ${error?.message}`);
  }
  return data.id;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: durable fiscal-document creation requires ordered validation and persistence.
export async function createSalesAdvance(
  input: CreateSalesAdvanceInput
): Promise<SalesAdvance> {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const userId = await requireActor(supabase);
  await assertSalesAdvancesEnabled(supabase, org.id);

  const { data: finalSale, error } = await supabase
    .from("sales_orders")
    .select("*, sales_order_items(*), sales_order_taxes(*)")
    .eq("id", input.preventaId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo obtener la venta: ${error.message}`);
  }
  if (!finalSale) {
    throw new Error("Venta final no encontrada");
  }
  if ((finalSale as Raw).arca_status === "authorized") {
    throw new Error(
      "No se puede crear un anticipo para una venta ya facturada ante ARCA"
    );
  }
  const isPreventa = Boolean((finalSale as Raw).preventa_status);
  const preventaStatus = (finalSale as Raw).preventa_status as string | null;
  if (isPreventa) {
    const { data: balanceDocument, error: balanceError } = await supabase
      .from("sales_orders")
      .select("id")
      .eq("organization_id", org.id)
      .eq("parent_sales_order_id" as never, finalSale.id)
      .eq("document_type" as never, "BALANCE")
      .maybeSingle();
    if (balanceError) {
      throw new Error(
        `No se pudo verificar el saldo de la preventa: ${balanceError.message}`
      );
    }
    if (balanceDocument) {
      throw new Error(
        "No se pueden agregar anticipos porque ya existe un documento de saldo para esta preventa"
      );
    }
  }
  if (isPreventa && !canCreatePreventaAdvance(preventaStatus)) {
    throw new Error("Sólo una preventa aprobada puede recibir anticipos");
  }
  if (
    !(
      isPreventa ||
      (["CONFIRMED", "DISPATCH", "DELIVERED"] as const).includes(
        (finalSale as Raw).status
      )
    )
  ) {
    throw new Error(
      "El anticipo sólo puede generarse desde una preventa aprobada o una venta confirmada"
    );
  }

  const total = money((finalSale as Raw).total_amount);
  const amount = money(input.amount);
  if (!(amount > 0 && amount <= total)) {
    throw new Error(
      "El anticipo debe ser mayor a cero y no superar el total de la venta"
    );
  }
  const items = ((finalSale as Raw).sales_order_items ?? []) as Raw[];
  if (!items.length) {
    throw new Error("La venta final no tiene ítems fiscales confirmados");
  }
  if (
    !(["FACTURA_A", "FACTURA_B", "FACTURA_C"] as const).includes(
      (finalSale as Raw).invoice_type
    )
  ) {
    throw new Error(
      "En esta versión los anticipos requieren Factura A, Factura B o Factura C"
    );
  }
  await assertCanManageAdvance({
    orgSlug: input.orgSlug,
    saleUserId: (finalSale as Raw).user_id,
  });

  const quoteItemIds = items.map((item) => item.quote_item_id).filter(Boolean);
  let quoteId: string | null = null;
  if (quoteItemIds.length) {
    const { data: quoteItem } = await supabase
      .from("quote_items")
      .select("quote_id")
      .in("id", quoteItemIds)
      .limit(1)
      .maybeSingle();
    quoteId = quoteItem?.quote_id ?? null;
  }
  const { data: insertedAdvance, error: advanceError } = await advanceTable(
    supabase
  )
    .insert({
      organization_id: org.id,
      quote_id: quoteId,
      final_sales_order_id: finalSale.id,
      amount,
      currency: (finalSale as Raw).currency ?? "ARS",
      percentage_snapshot:
        input.percentage ?? truncateMoney((amount * 100) / total),
      status: "DRAFT",
      origin_type: isPreventa ? "PREVENTA" : "SALE",
      preventa_sales_order_id: isPreventa ? finalSale.id : null,
      commercial_snapshot: isPreventa
        ? {
            preventaId: finalSale.id,
            status: preventaStatus,
            totalAmount: total,
            currency: (finalSale as Raw).currency ?? "ARS",
            commercial: (finalSale as Raw).commercial_snapshot ?? {},
            items: items.map((item) => ({
              id: item.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unit_price,
              subtotal: item.subtotal,
              productId: item.product_id,
              productVariantId: item.product_variant_id,
            })),
          }
        : {},
      created_by: userId,
    })
    .select("*")
    .single();
  if (advanceError || !insertedAdvance) {
    throw new Error(
      advanceError?.code === "23505"
        ? "El anticipo ya fue registrado"
        : `No se pudo crear el anticipo: ${advanceError?.message}`
    );
  }

  // A Preventa has no final receivable yet. Legacy sale advances retain their
  // existing deferred-receivable behavior.
  if (!isPreventa) {
    const { error: deferError } = await supabase.rpc(
      "defer_sales_advance_final_receivable" as never,
      { p_advance_id: insertedAdvance.id } as never
    );
    if (deferError) {
      await advanceTable(supabase)
        .delete()
        .eq("id", insertedAdvance.id)
        .eq("organization_id", org.id);
      throw new Error(
        `No se pudo reservar la cuenta final para el anticipo: ${deferError.message}`
      );
    }
  }

  let createdAdvanceSaleId: string | null = null;
  try {
    const ratio = amount / total;
    const finalTax = money((finalSale as Raw).total_tax_amount);
    const targetTax = truncateMoney(finalTax * ratio);
    const netAmount = truncateMoney(amount - targetTax);
    const { data: advanceSale, error: saleError } = await supabase
      .from("sales_orders")
      .insert({
        organization_id: org.id,
        customer_id: finalSale.customer_id,
        user_id: (finalSale as Raw).user_id ?? userId,
        sale_date: new Date().toISOString().slice(0, 10),
        expiration_date: new Date().toISOString().slice(0, 10),
        credit_days: 0,
        currency: (finalSale as Raw).currency ?? "ARS",
        invoice_type: (finalSale as Raw).invoice_type,
        observations: `Anticipo de producción · ${isPreventa ? "preventa" : "venta"} ${finalSale.id}`,
        sub_total: netAmount,
        total_tax_amount: targetTax,
        total_amount: amount,
        status: "CONFIRMED",
        document_type: "ADVANCE",
        parent_sales_order_id: isPreventa ? finalSale.id : null,
        commercial_snapshot: isPreventa
          ? (insertedAdvance as Raw).commercial_snapshot
          : null,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (saleError || !advanceSale) {
      throw new Error(
        `No se pudo crear la venta documental: ${saleError?.message}`
      );
    }
    createdAdvanceSaleId = advanceSale.id;

    const { data: createdItems, error: itemsError } = await supabase
      .from("sales_order_items")
      .insert([
        {
          organization_id: org.id,
          sales_order_id: advanceSale.id,
          product_id: null,
          product_variant_id: null,
          description: "Anticipo de producción",
          quantity: 1,
          unit_quantity: null,
          unit_price: netAmount,
          base_price: netAmount,
          discount_percentage: 0,
          discount_amount: 0,
          subtotal: netAmount,
          is_adjustment: true,
        },
      ] as never)
      .select("id, product_id");
    if (itemsError || !createdItems) {
      throw new Error(
        `No se pudieron crear ítems del anticipo: ${itemsError?.message}`
      );
    }

    const taxes = prorateFiscalSnapshots(
      (((finalSale as Raw).sales_order_taxes ?? []) as Raw[]).map((tax) => ({
        taxId: tax.tax_id ?? null,
        name: tax.name,
        rate: Number(tax.rate ?? 0),
        baseAmount: money(tax.base_amount),
        taxAmount: money(tax.tax_amount),
        taxCodeSnapshot: tax.tax_code_snapshot ?? null,
      })),
      ratio,
      targetTax,
      netAmount
    );
    if (taxes.length) {
      const { error: taxesError } = await supabase
        .from("sales_order_taxes")
        .insert(
          taxes.map((tax) => ({
            organization_id: org.id,
            sales_order_id: advanceSale.id,
            tax_id: tax.taxId,
            name: tax.name,
            rate: tax.rate,
            base_amount: tax.baseAmount,
            tax_amount: tax.taxAmount,
            tax_code_snapshot: tax.taxCodeSnapshot,
          })) as never
        );
      if (taxesError) {
        throw new Error(
          `No se pudieron guardar impuestos del anticipo: ${taxesError.message}`
        );
      }
    }
    await updateAdvance(supabase, org.id, insertedAdvance.id, {
      advance_sales_order_id: advanceSale.id,
      fiscal_snapshot: {
        grossAmount: amount,
        netAmount,
        taxes,
        description: "Anticipo de producción",
      },
    });
    return mapAdvance({
      ...(insertedAdvance as Raw),
      advance_sales_order_id: advanceSale.id,
    });
  } catch (cause) {
    // Nothing fiscal has been issued yet. Undo the document graph in reverse
    // order so a failed creation never leaves products or operational rows.
    if (createdAdvanceSaleId) {
      await updateAdvance(supabase, org.id, insertedAdvance.id, {
        advance_sales_order_id: null,
      });
      await supabase
        .from("sales_orders")
        .delete()
        .eq("id", createdAdvanceSaleId);
    }
    if (!isPreventa) {
      await supabase.rpc(
        "release_sales_advance_final_receivable" as never,
        {
          p_advance_id: insertedAdvance.id,
        } as never
      );
    }
    await advanceTable(supabase)
      .delete()
      .eq("id", insertedAdvance.id)
      .eq("organization_id", org.id);
    throw cause;
  }
}

/**
 * Emits a fiscal-only balance document. The operational Venta remains at its
 * full commercial value and is never repurposed as an ARCA balance invoice.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: durable balance issuance mirrors ordered ARCA persistence.
export async function issuePreventaBalanceInvoice(
  input: IssuePreventaBalanceInput
) {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const userId = await requireActor(supabase);
  await assertSalesAdvancesEnabled(supabase, org.id);

  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select("*, sales_order_taxes(*)")
    .eq("id", input.preventaId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (saleError || !sale) {
    throw new Error("Preventa no encontrada");
  }
  if (
    (sale as Raw).preventa_status !== "CONVERTIDA_A_VENTA" ||
    sale.status !== "CONFIRMED"
  ) {
    throw new Error(
      "La preventa debe estar convertida y confirmada antes de facturar el saldo"
    );
  }
  await assertCanManageAdvance({
    orgSlug: input.orgSlug,
    saleUserId: sale.user_id,
    requiresArca: true,
  });

  const { data: advances, error: advancesError } = await advanceTable(supabase)
    .select("*")
    .eq("organization_id", org.id)
    .eq("preventa_sales_order_id", sale.id)
    .eq("origin_type", "PREVENTA");
  if (advancesError) {
    throw new Error(
      `No se pudieron obtener anticipos: ${advancesError.message}`
    );
  }

  const allAdvances = (advances ?? []) as Raw[];
  const unresolved = allAdvances.filter(
    (advance) =>
      !(["INVOICED", "PAID", "APPLIED", "VOIDED"] as const).includes(
        advance.status
      )
  );
  if (unresolved.length) {
    throw new Error(
      "No se puede facturar el saldo mientras haya anticipos pendientes, en emisión o con conciliación requerida"
    );
  }
  const applicable = allAdvances.filter((advance) =>
    (["INVOICED", "PAID", "APPLIED"] as const).includes(advance.status)
  );
  if (!applicable.length) {
    throw new Error("La preventa no tiene anticipos facturados para aplicar");
  }

  const { data: existingDocument, error: existingDocumentError } =
    await supabase
      .from("sales_orders")
      .select(
        "id, arca_status, total_amount, sub_total, total_tax_amount, customer_id, sale_date"
      )
      .eq("organization_id", org.id)
      .eq("parent_sales_order_id" as never, sale.id)
      .eq("document_type" as never, "BALANCE")
      .maybeSingle();
  if (existingDocumentError) {
    throw new Error(
      `No se pudo recuperar el documento de saldo: ${existingDocumentError.message}`
    );
  }

  const total = money(sale.total_amount);
  const balance = existingDocument
    ? money(existingDocument.total_amount)
    : balanceAfterAdvances(
        total,
        applicable.map((advance) => ({ amount: money(advance.amount) }))
      );
  if (!existingDocument && balance <= 0) {
    throw new Error("La preventa no tiene saldo fiscal pendiente");
  }

  const ratio = total > 0 ? balance / total : 0;
  const targetTax = existingDocument
    ? money(existingDocument.total_tax_amount)
    : truncateMoney(money(sale.total_tax_amount) * ratio);
  const netAmount = existingDocument
    ? money(existingDocument.sub_total)
    : truncateMoney(balance - targetTax);
  const taxes = prorateFiscalSnapshots(
    (((sale as Raw).sales_order_taxes ?? []) as Raw[]).map((tax) => ({
      taxId: tax.tax_id ?? null,
      name: tax.name,
      rate: Number(tax.rate ?? 0),
      baseAmount: money(tax.base_amount),
      taxAmount: money(tax.tax_amount),
      taxCodeSnapshot: tax.tax_code_snapshot ?? null,
    })),
    ratio,
    targetTax,
    netAmount
  );
  let balanceDocument = existingDocument;
  if (!balanceDocument) {
    const { data, error: documentError } = await supabase
      .from("sales_orders")
      .insert({
        organization_id: org.id,
        customer_id: sale.customer_id,
        user_id: sale.user_id ?? userId,
        sale_date: new Date().toISOString().slice(0, 10),
        expiration_date: new Date().toISOString().slice(0, 10),
        credit_days: 0,
        currency: sale.currency ?? "ARS",
        invoice_type: sale.invoice_type,
        observations: `Saldo de preventa · venta ${sale.id}`,
        sub_total: netAmount,
        total_tax_amount: targetTax,
        total_amount: balance,
        status: "CONFIRMED",
        document_type: "BALANCE",
        parent_sales_order_id: sale.id,
        commercial_snapshot: (sale as Raw).commercial_snapshot ?? {},
        created_by: userId,
      } as never)
      .select(
        "id, arca_status, total_amount, sub_total, total_tax_amount, customer_id, sale_date"
      )
      .single();
    if (documentError || !data) {
      if (documentError?.code === "23505") {
        const { data: concurrentDocument, error: concurrentError } =
          await supabase
            .from("sales_orders")
            .select(
              "id, arca_status, total_amount, sub_total, total_tax_amount, customer_id, sale_date"
            )
            .eq("organization_id", org.id)
            .eq("parent_sales_order_id" as never, sale.id)
            .eq("document_type" as never, "BALANCE")
            .single();
        if (!concurrentError && concurrentDocument) {
          balanceDocument = concurrentDocument;
        } else {
          throw new Error(
            "No se pudo recuperar el documento de saldo concurrente"
          );
        }
      } else {
        throw new Error(
          `No se pudo crear el documento de saldo: ${documentError?.message}`
        );
      }
    } else {
      balanceDocument = data;
    }
  }

  const { data: existingItems, error: existingItemsError } = await supabase
    .from("sales_order_items")
    .select("id")
    .eq("sales_order_id", balanceDocument.id)
    .limit(1);
  if (existingItemsError) {
    throw new Error(existingItemsError.message);
  }
  if (!existingItems?.length) {
    const { error: itemError } = await supabase
      .from("sales_order_items")
      .insert([
        {
          organization_id: org.id,
          sales_order_id: balanceDocument.id,
          product_id: null,
          product_variant_id: null,
          description: "Saldo de producción",
          quantity: 1,
          unit_price: netAmount,
          base_price: netAmount,
          discount_percentage: 0,
          discount_amount: 0,
          subtotal: netAmount,
          is_adjustment: true,
        },
      ] as never);
    if (itemError) {
      throw new Error(itemError.message);
    }
  }
  if (taxes.length) {
    const { data: existingTaxes, error: existingTaxesError } = await supabase
      .from("sales_order_taxes")
      .select("id")
      .eq("sales_order_id", balanceDocument.id)
      .limit(1);
    if (existingTaxesError) {
      throw new Error(existingTaxesError.message);
    }
    if (!existingTaxes?.length) {
      const { error: taxesError } = await supabase
        .from("sales_order_taxes")
        .insert(
          taxes.map((tax) => ({
            organization_id: org.id,
            sales_order_id: balanceDocument.id,
            tax_id: tax.taxId,
            name: tax.name,
            rate: tax.rate,
            base_amount: tax.baseAmount,
            tax_amount: tax.taxAmount,
            tax_code_snapshot: tax.taxCodeSnapshot,
          })) as never
        );
      if (taxesError) {
        throw new Error(taxesError.message);
      }
    }
  }

  if (balanceDocument.arca_status === "pending") {
    throw new Error(
      "El documento de saldo tiene una emisión ARCA en curso o indeterminada; requiere conciliación antes de reintentar"
    );
  }
  if (balanceDocument.arca_status !== "authorized") {
    await emitSaleInvoice({
      orgSlug: input.orgSlug,
      saleId: balanceDocument.id,
    });
  }
  await ensureReceivable({
    supabase,
    orgId: org.id,
    saleId: balanceDocument.id,
    customerId: balanceDocument.customer_id,
    amount: balance,
    dueDate: balanceDocument.sale_date,
  });

  for (const advance of applicable) {
    const { data: existingApplication, error: existingApplicationError } =
      await supabase
        .from("sales_advance_applications" as never)
        .select("id, amount")
        .eq("sales_advance_id", advance.id)
        .eq("balance_sales_order_id", balanceDocument.id)
        .maybeSingle();
    if (existingApplicationError) {
      throw new Error(existingApplicationError.message);
    }
    if (!existingApplication) {
      const { error: applicationError } = await supabase
        .from("sales_advance_applications" as never)
        .insert({
          organization_id: org.id,
          sales_advance_id: advance.id,
          balance_sales_order_id: balanceDocument.id,
          amount: money(advance.amount),
          created_by: userId,
        } as never);
      if (applicationError && applicationError.code !== "23505") {
        throw new Error(applicationError.message);
      }
    }
    await updateAdvance(supabase, org.id, advance.id, {
      applied_amount: money(advance.amount),
      status: "APPLIED",
    });
  }
  return { balanceSalesOrderId: balanceDocument.id, amount: balance };
}

export async function getSalesAdvanceByFinalSaleId(params: {
  orgSlug: string;
  finalSalesOrderId: string;
}): Promise<SalesAdvance | null> {
  const org = await getOrganizationBySlug(params.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  await assertCanReadAdvanceForSale({
    supabase,
    orgSlug: params.orgSlug,
    orgId: org.id,
    finalSaleId: params.finalSalesOrderId,
  });
  const { data, error } = await advanceTable(supabase)
    .select("*")
    .eq("organization_id", org.id)
    .eq("final_sales_order_id", params.finalSalesOrderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo obtener el anticipo: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return hydrateAdvance(supabase, data as Raw);
}

export async function getSalesAdvanceById(params: {
  orgSlug: string;
  advanceId: string;
}): Promise<SalesAdvance> {
  const org = await getOrganizationBySlug(params.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  const row = await getAdvance(supabase, org.id, params.advanceId);
  await assertCanReadAdvanceForSale({
    supabase,
    orgSlug: params.orgSlug,
    orgId: org.id,
    finalSaleId: row.final_sales_order_id,
  });
  return hydrateAdvance(supabase, row);
}

export async function getSalesAdvanceSummaryByFinalSaleId(params: {
  orgSlug: string;
  finalSalesOrderId: string;
}): Promise<SalesAdvanceSummary> {
  const org = await getOrganizationBySlug(params.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  await assertCanReadAdvanceForSale({
    supabase,
    orgSlug: params.orgSlug,
    orgId: org.id,
    finalSaleId: params.finalSalesOrderId,
  });
  const [{ data: sale, error: saleError }, { data, error }] = await Promise.all(
    [
      supabase
        .from("sales_orders")
        .select("total_amount")
        .eq("organization_id", org.id)
        .eq("id", params.finalSalesOrderId)
        .single(),
      advanceTable(supabase)
        .select("*")
        .eq("organization_id", org.id)
        .eq("final_sales_order_id", params.finalSalesOrderId)
        .order("created_at", { ascending: false }),
    ]
  );
  if (saleError || !sale) {
    throw new Error("Venta final no encontrada");
  }
  if (error) {
    throw new Error(`No se pudieron obtener los anticipos: ${error.message}`);
  }
  const advances = ((data ?? []) as Raw[]).map(mapAdvance);
  const committedAmount = truncateMoney(
    advances
      .filter((advance) => !["VOIDED", "SETTLED"].includes(advance.status))
      .reduce((sum, advance) => sum + advance.amount, 0)
  );
  const hasUnresolvedAdvance = advances.some(
    (advance) =>
      !(["INVOICED", "PAID", "APPLIED", "VOIDED"] as const).includes(
        advance.status as "INVOICED" | "PAID" | "APPLIED" | "VOIDED"
      )
  );
  return {
    advances,
    committedAmount,
    remainingAmount: Math.max(
      0,
      truncateMoney(money(sale.total_amount) - committedAmount)
    ),
    hasUnresolvedAdvance,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the operational listing deliberately applies all independently selectable filters before pagination.
export async function getSalesAdvancesPaginated(
  orgSlug: string,
  params: SalesAdvanceListParams
): Promise<SalesAdvancesPaginatedResult> {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { data: [], totalCount: 0, page, pageSize };
  }

  const supabase = await createClient();
  const access = await getSalesAccessContext(orgSlug);
  if (!access.canRead) {
    throw new Error("No tienes permisos para ver anticipos");
  }
  await assertSalesAdvancesEnabled(supabase, org.id);

  const searchFilter = params.search
    ? await resolveSalesAdvanceSearch({
        supabase,
        orgId: org.id,
        search: params.search,
      })
    : null;
  let query = advanceTable(supabase)
    .select(
      `
        *,
        final_sale:sales_orders!sales_advances_final_sales_order_id_fkey!inner(
          id, sale_number, invoice_number, total_amount, user_id, customer_id,
          customer:customers(id, business_name, fantasy_name)
        ),
        advance_sale:sales_orders!sales_advances_advance_sales_order_id_fkey(
          id, invoice_number, arca_cae
        ),
        credit_note:credit_notes!sales_advances_credit_note_id_fkey(
          id, credit_note_number, arca_cae
        ),
        final_receivable:accounts_receivable!sales_advances_final_receivable_id_fkey(
          id, pending_balance
        )
      `,
      { count: "exact" }
    )
    .eq("organization_id", org.id);

  if (params.view !== "ALL") {
    query = query.neq("status", "SETTLED");
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.customerId) {
    query = query.eq("final_sale.customer_id", params.customerId);
  }
  if (params.sellerId) {
    query = query.eq("final_sale.user_id", params.sellerId);
  }
  if (params.createdAt?.from) {
    query = query.gte("created_at", params.createdAt.from);
  }
  if (params.createdAt?.to) {
    query = query.lte("created_at", params.createdAt.to);
  }
  if (access.scope === "own") {
    if (!access.userId) {
      return { data: [], totalCount: 0, page, pageSize };
    }
    query = query.eq("final_sale.user_id", access.userId);
  }
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const allowedSorts = new Set([
    "amount",
    "status",
    "created_at",
    "updated_at",
  ]);
  const sort = (params.sort ?? []).filter((item) => allowedSorts.has(item.id));
  if (sort.length) {
    for (const item of sort) {
      query = query.order(item.id, { ascending: !item.desc });
    }
  } else {
    query = query.order("updated_at", { ascending: false });
  }
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    throw new Error(`No se pudieron obtener anticipos: ${error.message}`);
  }

  const sellers = access.canViewAll
    ? await getOrganizationMembersWithUsersAdmin(orgSlug)
    : await getOrganizationSalesMembersBySlug(orgSlug);
  const sellersByUserId = new Map(
    sellers.map((member) => [
      member.user_id,
      member.user?.name ?? member.user?.email ?? null,
    ])
  );
  return {
    data: ((data ?? []) as Raw[]).map((row) =>
      mapAdvanceListItem(row, sellersByUserId)
    ),
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

export async function getSalesAdvanceSuggestion(params: {
  orgSlug: string;
  finalSalesOrderId: string;
}): Promise<{ percentage: number | null; amount: number | null }> {
  const org = await getOrganizationBySlug(params.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  await assertCanReadAdvanceForSale({
    supabase,
    orgSlug: params.orgSlug,
    orgId: org.id,
    finalSaleId: params.finalSalesOrderId,
  });
  const { data: items, error } = await supabase
    .from("sales_order_items")
    .select("quote_item_id")
    .eq("sales_order_id", params.finalSalesOrderId)
    .limit(1);
  if (error || !items?.[0]?.quote_item_id) {
    return { percentage: null, amount: null };
  }
  const { data: quoteItem } = await supabase
    .from("quote_items")
    .select("quote_id")
    .eq("id", items[0].quote_item_id)
    .maybeSingle();
  if (!quoteItem?.quote_id) {
    return { percentage: null, amount: null };
  }
  const [{ data: quote }, { data: sale }] = await Promise.all([
    supabase
      .from("quotes")
      .select("advance_payment, advance_payment_percentage")
      .eq("id", quoteItem.quote_id)
      .eq("organization_id", org.id)
      .maybeSingle(),
    supabase
      .from("sales_orders")
      .select("total_amount")
      .eq("id", params.finalSalesOrderId)
      .eq("organization_id", org.id)
      .maybeSingle(),
  ]);
  const percentage = quote?.advance_payment
    ? Number(quote.advance_payment_percentage ?? 0) || null
    : null;
  return {
    percentage,
    amount:
      percentage && sale
        ? truncateMoney((money(sale.total_amount) * percentage) / 100)
        : null,
  };
}

async function registerAdvanceInvoiceAccounting(params: {
  orgSlug: string;
  sale: Raw;
}) {
  if (!(await isAccountingIntegrationEnabled(params.orgSlug))) {
    return;
  }
  const event = buildFacturaVentaManual(
    {
      id: params.sale.id,
      organization_id: params.sale.organization_id,
      customer_id: params.sale.customer_id,
      sale_date: params.sale.sale_date,
      expiration_date: params.sale.expiration_date,
      invoice_number: params.sale.invoice_number,
    },
    {
      total: money(params.sale.total_amount),
      totalTaxAmount: money(params.sale.total_tax_amount),
    },
    { tipoFactura: "ANTICIPO" }
  );
  const preview = await previewAccountingEvent(event);
  if (preview.estadoImputacion !== "COMPLETO") {
    throw new Error(
      "La factura de anticipo no tiene cuentas e IVA completamente configurados en el plan contable"
    );
  }
  await confirmAccountingEvent(event);
}

async function assertAdvanceInvoiceAccountingReady(params: {
  orgSlug: string;
  sale: Raw;
}) {
  if (!(await isAccountingIntegrationEnabled(params.orgSlug))) {
    return;
  }
  const event = buildFacturaVentaManual(
    {
      id: params.sale.id,
      organization_id: params.sale.organization_id,
      customer_id: params.sale.customer_id,
      sale_date: params.sale.sale_date,
      expiration_date: params.sale.expiration_date,
      invoice_number: params.sale.invoice_number,
    },
    {
      total: money(params.sale.total_amount),
      totalTaxAmount: money(params.sale.total_tax_amount),
    },
    { tipoFactura: "ANTICIPO" }
  );
  const preview = await previewAccountingEvent(event);
  if (preview.estadoImputacion !== "COMPLETO") {
    throw new Error(
      "Configurá las cuentas de Anticipos de clientes y el IVA antes de emitir el anticipo"
    );
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fiscal issuance includes ordered persistence and recovery steps.
export async function issueSalesAdvance(
  input: IssueSalesAdvanceInput
): Promise<SalesAdvance> {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  await assertSalesAdvancesEnabled(supabase, org.id);
  const advance = await getAdvance(supabase, org.id, input.advanceId);
  if (!advance.advance_sales_order_id) {
    throw new Error("El anticipo no tiene una venta documental");
  }
  const { data: advanceSaleForAccess } = await supabase
    .from("sales_orders")
    .select(
      "id, organization_id, customer_id, user_id, invoice_type, arca_status, sale_date, expiration_date, invoice_number, total_amount, total_tax_amount"
    )
    .eq("id", advance.advance_sales_order_id)
    .maybeSingle();
  await assertCanManageAdvance({
    orgSlug: input.orgSlug,
    saleUserId: advanceSaleForAccess?.user_id,
    requiresArca: true,
  });
  if (
    !(["DRAFT", "FAILED_RECOVERABLE", "ISSUE_SUBMITTED"] as const).includes(
      advance.status
    )
  ) {
    throw new Error("El anticipo no está disponible para emisión");
  }
  if (
    !(["FACTURA_A", "FACTURA_B", "FACTURA_C"] as const).includes(
      advanceSaleForAccess?.invoice_type as
        | "FACTURA_A"
        | "FACTURA_B"
        | "FACTURA_C"
    )
  ) {
    throw new Error(
      "El comprobante de anticipo debe ser Factura A, Factura B o Factura C"
    );
  }
  try {
    await assertAdvanceInvoiceAccountingReady({
      orgSlug: input.orgSlug,
      sale: advanceSaleForAccess as Raw,
    });
    await updateAdvance(supabase, org.id, advance.id, {
      status: "ISSUE_SUBMITTED",
      last_error: null,
    });
    await emitSaleInvoice({
      orgSlug: input.orgSlug,
      saleId: advance.advance_sales_order_id,
    });
    const { data: sale } = await supabase
      .from("sales_orders")
      .select(
        "id, organization_id, customer_id, sale_date, expiration_date, invoice_number, total_amount, total_tax_amount"
      )
      .eq("id", advance.advance_sales_order_id)
      .single();
    if (!sale) {
      throw new Error("No se encontró la venta documental autorizada");
    }
    const receivableId = await ensureReceivable({
      supabase,
      orgId: org.id,
      saleId: sale.id,
      customerId: sale.customer_id,
      amount: money(sale.total_amount),
      dueDate: sale.sale_date,
    });
    await registerAdvanceInvoiceAccounting({
      orgSlug: input.orgSlug,
      sale: sale as Raw,
    });
    await updateAdvance(supabase, org.id, advance.id, {
      status: "INVOICED",
      advance_receivable_id: receivableId,
      invoiced_at: new Date().toISOString(),
      last_error: null,
    });
    if (advance.origin_type === "PREVENTA" && advance.preventa_sales_order_id) {
      const { data: preventa, error: preventaReadError } = await supabase
        .from("sales_orders")
        .select("preventa_status")
        .eq("id", advance.preventa_sales_order_id)
        .eq("organization_id", org.id)
        .maybeSingle();
      if (preventaReadError || !preventa) {
        throw new Error(
          `La factura fue emitida, pero no se pudo recuperar la preventa: ${preventaReadError?.message}`
        );
      }
      // The first issued advance advances APROBADA to CON_ANTICIPO. Later
      // issuances must not undo production progress or a completed conversion.
      if ((preventa as Raw).preventa_status === "APROBADA") {
        const { error: preventaError } = await supabase
          .from("sales_orders")
          .update({ preventa_status: "CON_ANTICIPO" } as never)
          .eq("id", advance.preventa_sales_order_id)
          .eq("organization_id", org.id);
        if (preventaError) {
          throw new Error(
            `La factura fue emitida, pero no se pudo actualizar la preventa: ${preventaError.message}`
          );
        }
      }
    }
  } catch (error) {
    const { data: latestAdvanceSale } = await supabase
      .from("sales_orders")
      .select("arca_status")
      .eq("id", advance.advance_sales_order_id)
      .maybeSingle();
    await updateAdvance(supabase, org.id, advance.id, {
      status:
        latestAdvanceSale?.arca_status === "pending"
          ? "RECONCILIATION_REQUIRED"
          : "FAILED_RECOVERABLE",
      last_error:
        error instanceof Error ? error.message : "Error al emitir anticipo",
    });
    throw error;
  }
  return mapAdvance(await getAdvance(supabase, org.id, input.advanceId));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ARCA steps remain ordered and individually recoverable.
export async function settleSalesAdvance(
  input: SettleSalesAdvanceInput
): Promise<SalesAdvance> {
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const supabase = await createClient();
  await assertSalesAdvancesEnabled(supabase, org.id);
  const advance = await getAdvance(supabase, org.id, input.advanceId);
  if (advance.origin_type === "PREVENTA") {
    throw new Error(
      "Los anticipos de preventa se aplican mediante la factura de saldo; no se liquidan con nota de crédito"
    );
  }
  if (!(advance.advance_sales_order_id && advance.advance_receivable_id)) {
    throw new Error("El anticipo todavía no fue facturado");
  }
  const { data: advanceSaleForAccess } = await supabase
    .from("sales_orders")
    .select("user_id")
    .eq("id", advance.advance_sales_order_id)
    .maybeSingle();
  await assertCanManageAdvance({
    orgSlug: input.orgSlug,
    saleUserId: advanceSaleForAccess?.user_id,
    requiresArca: true,
  });
  if (
    !(
      [
        "PAID",
        "FAILED_RECOVERABLE",
        "CLOSING",
        "FINAL_INVOICED",
        "CREDIT_NOTE_SUBMITTED",
        "CREDIT_AVAILABLE",
      ] as const
    ).includes(advance.status)
  ) {
    throw new Error("El anticipo no está disponible para liquidación");
  }
  const { data: advanceAr } = await supabase
    .from("accounts_receivable")
    .select("pending_balance")
    .eq("id", advance.advance_receivable_id)
    .single();
  if (money(advanceAr?.pending_balance) > 0) {
    throw new Error(
      "El anticipo debe cobrarse completamente antes de liquidarlo"
    );
  }

  try {
    await updateAdvance(supabase, org.id, advance.id, {
      status: "CLOSING",
      settlement_started_at:
        advance.settlement_started_at ?? new Date().toISOString(),
      last_error: null,
    });
    const { data: finalSale } = await supabase
      .from("sales_orders")
      .select(
        "id, customer_id, sale_date, total_amount, currency, arca_status, invoice_type"
      )
      .eq("id", advance.final_sales_order_id)
      .eq("organization_id", org.id)
      .single();
    if (!finalSale?.customer_id) {
      throw new Error("Venta final no encontrada o sin cliente");
    }
    if (
      !(["FACTURA_A", "FACTURA_B", "FACTURA_C"] as const).includes(
        finalSale.invoice_type as "FACTURA_A" | "FACTURA_B" | "FACTURA_C"
      )
    ) {
      throw new Error(
        "La liquidación requiere Factura A, Factura B o Factura C final"
      );
    }
    await emitSaleInvoice({ orgSlug: input.orgSlug, saleId: finalSale.id });
    const finalReceivableId = await ensureReceivable({
      supabase,
      orgId: org.id,
      saleId: finalSale.id,
      customerId: finalSale.customer_id,
      amount: money(finalSale.total_amount),
      dueDate: finalSale.sale_date,
    });
    await updateAdvance(supabase, org.id, advance.id, {
      status: "FINAL_INVOICED",
      final_receivable_id: finalReceivableId,
    });
    if (!advance.credit_note_id) {
      const { data: advanceSale } = await supabase
        .from("sales_orders")
        .select(
          "id, invoice_type, invoice_number, arca_status, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code, arca_authorized_at, sales_order_items(*), sales_order_taxes(*)"
        )
        .eq("id", advance.advance_sales_order_id)
        .single();
      if (!advanceSale || advanceSale.arca_status !== "authorized") {
        throw new Error("La factura de anticipo debe estar autorizada");
      }
      const nc = await createCreditNote({
        orgSlug: input.orgSlug,
        salesOrderId: advance.advance_sales_order_id,
        amount: money(advance.amount),
        originType: "ADVANCE_SETTLEMENT",
        reason: "Liquidación de anticipo",
        // La NC debe mantener el tipo de la factura de anticipo: B/C nunca
        // se convierten en una NC A.
        invoiceType: advanceSale.invoice_type,
        items: ((advanceSale as Raw).sales_order_items ?? []).map(
          (item: Raw) => ({
            salesOrderId: advanceSale.id,
            salesOrderItemId: item.id,
            productId: item.product_id ?? null,
            description: item.description ?? "Anticipo",
            quantity: Number(item.quantity ?? 1),
            unitPrice: money(item.unit_price),
            discountAmount: money(item.discount_amount),
            netAmount: money(item.subtotal),
            taxAmount: 0,
            totalAmount: money(item.subtotal),
          })
        ),
        taxes: ((advanceSale as Raw).sales_order_taxes ?? []).map(
          (tax: Raw) => ({
            taxId: tax.tax_id,
            name: tax.name,
            rate: Number(tax.rate),
            baseAmount: money(tax.base_amount),
            taxAmount: money(tax.tax_amount),
            taxCodeSnapshot: tax.tax_code_snapshot ?? null,
          })
        ),
        sourceDocuments: [
          {
            salesOrderId: advanceSale.id,
            appliedAmount: money(advance.amount),
            invoiceType: advanceSale.invoice_type,
            invoiceNumber: advanceSale.invoice_number,
            arcaStatus: advanceSale.arca_status,
            arcaPointOfSale: advanceSale.arca_point_of_sale,
            arcaVoucherNumber: advanceSale.arca_voucher_number,
            arcaVoucherTypeCode: advanceSale.arca_voucher_type_code,
            arcaVoucherDate:
              advanceSale.arca_authorized_at?.slice(0, 10) ?? null,
          },
        ],
      });
      await updateAdvance(supabase, org.id, advance.id, {
        credit_note_id: nc.creditNoteId,
      });
      advance.credit_note_id = nc.creditNoteId;
    }
    await updateAdvance(supabase, org.id, advance.id, {
      status: "CREDIT_NOTE_SUBMITTED",
    });
    await emitCreditNote({
      orgSlug: input.orgSlug,
      creditNoteId: advance.credit_note_id,
    });
    let customerCreditId = advance.customer_credit_id;
    if (!customerCreditId) {
      const { data: insertedCredit, error: creditError } = await supabase
        .from("customer_credits")
        .insert({
          organization_id: org.id,
          customer_id: finalSale.customer_id,
          amount: money(advance.amount),
          remaining_amount: money(advance.amount),
          currency: finalSale.currency === "USD" ? "USD" : "ARS",
          credit_note_id: advance.credit_note_id,
          notes: `Saldo a favor por liquidación de anticipo ${advance.id}`,
        })
        .select("id")
        .single();
      if (creditError || !insertedCredit) {
        throw new Error(
          `No se pudo crear el crédito de anticipo: ${creditError?.message}`
        );
      }
      customerCreditId = insertedCredit.id;
      await updateAdvance(supabase, org.id, advance.id, {
        customer_credit_id: customerCreditId,
      });
    }
    await updateAdvance(supabase, org.id, advance.id, {
      status: "CREDIT_AVAILABLE",
      final_receivable_id: finalReceivableId,
      last_error: null,
    });
    const { error: applyError } = await supabase.rpc(
      "apply_sales_advance_credit" as never,
      { p_advance_id: advance.id } as never
    );
    if (applyError) {
      throw new Error(
        `No se pudo aplicar el crédito de anticipo: ${applyError.message}`
      );
    }
  } catch (error) {
    await updateAdvance(supabase, org.id, advance.id, {
      status: "FAILED_RECOVERABLE",
      last_error:
        error instanceof Error ? error.message : "Error al liquidar anticipo",
    });
    throw error;
  }
  return mapAdvance(await getAdvance(supabase, org.id, input.advanceId));
}
