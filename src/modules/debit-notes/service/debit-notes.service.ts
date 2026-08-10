import "server-only";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { normalizeArcaTaxCode } from "@/modules/arca/tax-codes";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { calculateDebitNoteBreakdown } from "../debit-note-calculations";
import type {
  CreateDebitNoteInput,
  DebitNote,
  DebitNoteReason,
  UpdateDebitNoteInput,
} from "../types";

type AccessContext = {
  scope: "all" | "own";
  userId: string | null;
};

function canViewAll(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("debitnotes.read.all") ||
    permissions.includes("debitnotes.manage.all")
  );
}

async function resolveAccessContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgSlug: string
): Promise<AccessContext> {
  const [{ data: authData }, permissionsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_user_org_permissions_by_slug", {
      target_org_slug: orgSlug,
    }),
  ]);

  const permissions = permissionsResult.error
    ? []
    : ((permissionsResult.data ?? []) as string[]);

  return {
    scope: canViewAll(permissions) ? "all" : "own",
    userId: authData.user?.id ?? null,
  };
}

// The generated Supabase types are refreshed after applying this migration.
type UntypedSupabase = {
  // biome-ignore lint/suspicious/noExplicitAny: migration-owned table until generation.
  from: (table: string) => any;
  // biome-ignore lint/suspicious/noExplicitAny: migration-owned RPC until generation.
  rpc: (fn: string, args?: unknown) => any;
};

const SUPPORTED_INVOICE_TYPES = new Set([
  "FACTURA_A",
  "FACTURA_A_RETENCION",
  "FACTURA_B",
  "FACTURA_C",
]);
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function db(client: Awaited<ReturnType<typeof createClient>>): UntypedSupabase {
  return client as unknown as UntypedSupabase;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: raw database mapper.
// biome-ignore lint/suspicious/noExplicitAny: raw Supabase join shape.
function mapDebitNote(row: Record<string, any>): DebitNote {
  const customer = Array.isArray(row.customers)
    ? row.customers[0]
    : row.customers;
  const sale = Array.isArray(row.sales_orders)
    ? row.sales_orders[0]
    : row.sales_orders;
  const accountReceivable = Array.isArray(row.accounts_receivable)
    ? row.accounts_receivable[0]
    : row.accounts_receivable;
  return {
    id: row.id,
    organizationId: row.organization_id,
    salesOrderId: row.sales_order_id,
    customerId: row.customer_id,
    debitNoteNumber: row.debit_note_number,
    invoiceType: row.invoice_type,
    reason: row.reason as DebitNoteReason,
    reasonDetail: row.reason_detail ?? null,
    observations: row.observations ?? null,
    concept: row.concept ?? null,
    dueDate: row.due_date ?? null,
    paymentCondition: row.payment_condition ?? null,
    externalReference: row.external_reference ?? null,
    issueDate: row.issue_date,
    amount: Number(row.amount),
    status: row.status,
    arcaCae: row.arca_cae ?? null,
    arcaCaeExpiresAt: row.arca_cae_expires_at ?? null,
    arcaAuthorizedAt: row.arca_authorized_at ?? null,
    arcaPointOfSale: row.arca_point_of_sale ?? null,
    arcaVoucherNumber: row.arca_voucher_number ?? null,
    arcaVoucherTypeCode: row.arca_voucher_type_code ?? null,
    arcaLastError: row.arca_last_error ?? null,
    arcaRequestJson: row.arca_request_json ?? null,
    arcaResponseJson: row.arca_response_json ?? null,
    accountReceivableId: row.account_receivable_id ?? null,
    accountReceivable: accountReceivable
      ? {
          pendingBalance: Number(accountReceivable.pending_balance ?? 0),
          totalAmount: Number(accountReceivable.total_amount ?? 0),
          dueDate: accountReceivable.due_date,
        }
      : null,
    financialAppliedAt: row.financial_applied_at ?? null,
    createdAt: row.created_at,
    // biome-ignore lint/suspicious/noExplicitAny: raw nested Supabase relation shape.
    items: (row.debit_note_items ?? []).map((item: Record<string, any>) => ({
      id: item.id,
      debitNoteId: item.debit_note_id,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      netAmount: Number(item.net_amount),
      taxAmount: Number(item.tax_amount),
      totalAmount: Number(item.total_amount),
      taxes: (item.debit_note_item_taxes ?? []).map(
        // biome-ignore lint/suspicious/noExplicitAny: raw nested Supabase relation shape.
        (tax: Record<string, any>) => ({
          taxId: tax.tax_id ?? null,
          name: tax.name,
          rate: Number(tax.rate),
          baseAmount: Number(tax.base_amount),
          taxAmount: Number(tax.tax_amount),
          taxCodeSnapshot: tax.tax_code_snapshot ?? null,
        })
      ),
    })),
    // biome-ignore lint/suspicious/noExplicitAny: raw nested Supabase relation shape.
    taxes: (row.debit_note_taxes ?? []).map((tax: Record<string, any>) => ({
      id: tax.id,
      debitNoteId: tax.debit_note_id,
      taxId: tax.tax_id ?? null,
      name: tax.name,
      rate: Number(tax.rate),
      baseAmount: Number(tax.base_amount),
      taxAmount: Number(tax.tax_amount),
      taxCodeSnapshot: tax.tax_code_snapshot ?? null,
    })),
    customer: customer
      ? {
          businessName: customer.business_name,
          fantasyName: customer.fantasy_name ?? null,
          email: customer.email ?? null,
        }
      : null,
    sale: sale
      ? {
          saleNumber: sale.sale_number ?? null,
          invoiceNumber: sale.invoice_number ?? null,
          arcaStatus: sale.arca_status ?? null,
        }
      : null,
  };
}

const DEBIT_NOTE_SELECT = `
  *,
  debit_note_items(*, debit_note_item_taxes(*)),
  debit_note_taxes(*),
  accounts_receivable(pending_balance, total_amount, due_date),
  customers(business_name, fantasy_name, email),
  sales_orders(sale_number, invoice_number, arca_status)
`;

async function validateSaleForDebitNote(params: {
  orgId: string;
  salesOrderId: string;
}) {
  const client = await createClient();
  const { data, error } = await client
    .from("sales_orders")
    .select(
      "id, customer_id, status, invoice_type, arca_status, arca_cae, arca_point_of_sale, arca_voucher_number, arca_voucher_type_code"
    )
    .eq("organization_id", params.orgId)
    .eq("id", params.salesOrderId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("La factura seleccionada no existe en esta organización.");
  }
  if (!data.customer_id) {
    throw new Error("La factura no tiene cliente asociado.");
  }
  if (!SUPPORTED_INVOICE_TYPES.has(data.invoice_type)) {
    throw new Error("El tipo fiscal de esta factura no admite Nota de Débito.");
  }
  if (data.status === "CANCELLED") {
    throw new Error("No se puede ajustar una factura anulada.");
  }
  if (
    data.arca_status !== "authorized" ||
    !data.arca_cae ||
    !data.arca_point_of_sale ||
    !data.arca_voucher_number ||
    !data.arca_voucher_type_code
  ) {
    throw new Error(
      "La factura debe estar autorizada en ARCA antes de crear una Nota de Débito."
    );
  }
  return data;
}

function validateInput(input: CreateDebitNoteInput) {
  if (!input.concept?.trim()) {
    throw new Error("Indicá el concepto de la Nota de Débito.");
  }
  if (!DATE_ONLY_REGEX.test(input.dueDate ?? "")) {
    throw new Error("Indicá una fecha de vencimiento válida.");
  }
  if (!["CASH", "CURRENT_ACCOUNT"].includes(input.paymentCondition)) {
    throw new Error("Seleccioná una condición de pago válida.");
  }
  if (input.reason === "OTHER" && !input.reasonDetail?.trim()) {
    throw new Error("Indicá el detalle del motivo Otro.");
  }
}

async function replaceDebitNoteDetails(params: {
  client: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  debitNoteId: string;
  items: CreateDebitNoteInput["items"];
}) {
  const fiscal = calculateDebitNoteBreakdown(params.items);
  const client = db(params.client);
  await Promise.all([
    client
      .from("debit_note_taxes")
      .delete()
      .eq("debit_note_id", params.debitNoteId),
    client
      .from("debit_note_items")
      .delete()
      .eq("debit_note_id", params.debitNoteId),
  ]);
  const itemIds = fiscal.items.map(() => randomUUID());
  const { error: itemError } = await client.from("debit_note_items").insert(
    fiscal.items.map((item, index) => ({
      id: itemIds[index],
      organization_id: params.orgId,
      debit_note_id: params.debitNoteId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      net_amount: item.netAmount,
      tax_amount: item.taxAmount,
      total_amount: item.totalAmount,
    }))
  );
  if (itemError) {
    throw new Error(`No se pudieron guardar los ítems: ${itemError.message}`);
  }
  const itemTaxRows = fiscal.items.flatMap((item, index) =>
    item.taxes.map((tax) => ({
      organization_id: params.orgId,
      debit_note_id: params.debitNoteId,
      debit_note_item_id: itemIds[index],
      tax_id: tax.taxId ?? null,
      name: tax.name,
      rate: tax.rate,
      base_amount: tax.baseAmount,
      tax_amount: tax.taxAmount,
      tax_code_snapshot: tax.taxCodeSnapshot ?? null,
    }))
  );
  if (itemTaxRows.length) {
    const { error } = await client
      .from("debit_note_item_taxes")
      .insert(itemTaxRows);
    if (error) {
      throw new Error(
        `No se pudieron guardar los impuestos por ítem: ${error.message}`
      );
    }
  }
  if (fiscal.taxes.length) {
    const { error } = await client.from("debit_note_taxes").insert(
      fiscal.taxes.map((tax) => ({
        organization_id: params.orgId,
        debit_note_id: params.debitNoteId,
        tax_id: tax.taxId ?? null,
        name: tax.name,
        rate: tax.rate,
        base_amount: tax.baseAmount,
        tax_amount: tax.taxAmount,
        tax_code_snapshot: tax.taxCodeSnapshot ?? null,
      }))
    );
    if (error) {
      throw new Error(`No se pudieron guardar los impuestos: ${error.message}`);
    }
  }
  return fiscal;
}

async function resolveFiscalItemsFromOrganization(params: {
  client: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  items: CreateDebitNoteInput["items"];
}) {
  const taxIds = [
    ...new Set(
      params.items.flatMap((item) =>
        (item.taxes ?? []).map((tax) => tax.taxId).filter(Boolean)
      )
    ),
  ];
  if (taxIds.length === 0) {
    return params.items;
  }
  const { data, error } = await params.client
    .from("taxes")
    .select("id, name, rate, code, is_active")
    .eq("organization_id", params.orgId)
    .in("id", taxIds as string[]);
  if (error) {
    throw new Error(`No se pudieron validar los impuestos: ${error.message}`);
  }
  const byId = new Map((data ?? []).map((tax) => [tax.id, tax]));
  return params.items.map((item) => ({
    ...item,
    taxes: (item.taxes ?? []).map((selected) => {
      const tax = selected.taxId ? byId.get(selected.taxId) : null;
      if (!tax?.is_active) {
        throw new Error(
          "Uno de los impuestos seleccionados ya no está activo."
        );
      }
      const code = normalizeArcaTaxCode(tax.code);
      if (!code) {
        throw new Error(
          `El impuesto "${tax.name}" no tiene un código fiscal ARCA válido.`
        );
      }
      return {
        taxId: tax.id,
        name: tax.name,
        rate: Number(tax.rate),
        taxCodeSnapshot: code,
      };
    }),
  }));
}

async function addEvent(params: {
  orgId: string;
  debitNoteId: string;
  eventType: string;
  from?: string | null;
  to?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  const { error } = await db(client)
    .from("debit_note_events")
    .insert({
      organization_id: params.orgId,
      debit_note_id: params.debitNoteId,
      event_type: params.eventType,
      from_status: params.from ?? null,
      to_status: params.to ?? null,
      actor_id: auth.user?.id ?? null,
      metadata: params.metadata ?? {},
    });
  if (error) {
    throw new Error(
      `No se pudo registrar la auditoría de la nota de débito: ${error.message}`
    );
  }
}

export async function createDebitNote(
  input: CreateDebitNoteInput
): Promise<DebitNote> {
  validateInput(input);
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada.");
  }
  const [sale, client] = await Promise.all([
    validateSaleForDebitNote({
      orgId: org.id,
      salesOrderId: input.salesOrderId,
    }),
    createClient(),
  ]);
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) {
    throw new Error("No autenticado.");
  }
  const fiscalItems = await resolveFiscalItemsFromOrganization({
    client,
    orgId: org.id,
    items: input.items,
  });
  const fiscal = calculateDebitNoteBreakdown(fiscalItems);
  const { data: number, error: numberError } = await db(client).rpc(
    "generate_debit_note_number",
    { org_id: org.id }
  );
  if (numberError || !number) {
    throw new Error("No se pudo generar el número de Nota de Débito.");
  }
  const { data, error } = await db(client)
    .from("debit_notes")
    .insert({
      organization_id: org.id,
      sales_order_id: sale.id,
      customer_id: sale.customer_id,
      debit_note_number: number,
      invoice_type: sale.invoice_type,
      reason: input.reason,
      reason_detail: input.reasonDetail?.trim() || null,
      observations: input.observations?.trim() || null,
      concept: input.concept.trim(),
      due_date: input.dueDate,
      payment_condition: input.paymentCondition,
      external_reference: input.externalReference?.trim() || null,
      amount: fiscal.totalAmount,
      created_by: auth.user.id,
    })
    .select(DEBIT_NOTE_SELECT)
    .single();
  if (error || !data) {
    throw new Error(
      `No se pudo crear la Nota de Débito: ${error?.message ?? "error desconocido"}`
    );
  }
  await replaceDebitNoteDetails({
    client,
    orgId: org.id,
    debitNoteId: data.id,
    items: fiscalItems,
  });
  const { data: detailed, error: detailedError } = await db(client)
    .from("debit_notes")
    .select(DEBIT_NOTE_SELECT)
    .eq("id", data.id)
    .single();
  if (detailedError || !detailed) {
    throw new Error(
      "La Nota de Débito se creó pero no se pudo recuperar su detalle."
    );
  }
  await addEvent({
    orgId: org.id,
    debitNoteId: data.id,
    eventType: "created",
    to: "draft",
  });
  return mapDebitNote(detailed);
}

export async function updateDebitNote(
  input: UpdateDebitNoteInput
): Promise<DebitNote> {
  validateInput(input);
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada.");
  }
  const client = await createClient();
  const { data: current, error: currentError } = await db(client)
    .from("debit_notes")
    .select("status")
    .eq("id", input.debitNoteId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (currentError || !current) {
    throw new Error("Nota de Débito no encontrada.");
  }
  if (!["draft", "error"].includes(current.status)) {
    throw new Error(
      "Sólo se pueden editar borradores o notas con error de emisión."
    );
  }
  const sale = await validateSaleForDebitNote({
    orgId: org.id,
    salesOrderId: input.salesOrderId,
  });
  const fiscalItems = await resolveFiscalItemsFromOrganization({
    client,
    orgId: org.id,
    items: input.items,
  });
  const fiscal = calculateDebitNoteBreakdown(fiscalItems);
  const { data, error } = await db(client)
    .from("debit_notes")
    .update({
      sales_order_id: sale.id,
      customer_id: sale.customer_id,
      invoice_type: sale.invoice_type,
      reason: input.reason,
      reason_detail: input.reasonDetail?.trim() || null,
      observations: input.observations?.trim() || null,
      concept: input.concept.trim(),
      due_date: input.dueDate,
      payment_condition: input.paymentCondition,
      external_reference: input.externalReference?.trim() || null,
      amount: fiscal.totalAmount,
      status: "draft",
      arca_last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.debitNoteId)
    .eq("organization_id", org.id)
    .select(DEBIT_NOTE_SELECT)
    .single();
  if (error || !data) {
    throw new Error(
      `No se pudo actualizar la Nota de Débito: ${error?.message ?? "error desconocido"}`
    );
  }
  await replaceDebitNoteDetails({
    client,
    orgId: org.id,
    debitNoteId: data.id,
    items: fiscalItems,
  });
  const { data: detailed, error: detailedError } = await db(client)
    .from("debit_notes")
    .select(DEBIT_NOTE_SELECT)
    .eq("id", data.id)
    .single();
  if (detailedError || !detailed) {
    throw new Error(
      "La Nota de Débito se actualizó pero no se pudo recuperar su detalle."
    );
  }
  await addEvent({
    orgId: org.id,
    debitNoteId: data.id,
    eventType: "updated",
    from: current.status,
    to: "draft",
  });
  return mapDebitNote(detailed);
}

export async function deleteDebitNote(
  orgSlug: string,
  debitNoteId: string
): Promise<void> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada.");
  }
  const client = await createClient();
  const { data: current } = await db(client)
    .from("debit_notes")
    .select("status")
    .eq("id", debitNoteId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!current) {
    throw new Error("Nota de Débito no encontrada.");
  }
  if (!["draft", "error"].includes(current.status)) {
    throw new Error(
      "Sólo se pueden eliminar borradores o notas con error no autorizadas."
    );
  }
  await addEvent({
    orgId: org.id,
    debitNoteId,
    eventType: "deleted",
    from: current.status,
  });
  const { error } = await db(client)
    .from("debit_notes")
    .delete()
    .eq("id", debitNoteId)
    .eq("organization_id", org.id);
  if (error) {
    throw new Error(`No se pudo eliminar la Nota de Débito: ${error.message}`);
  }
}

export async function getDebitNotesByOrgSlug(
  orgSlug: string
): Promise<DebitNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }
  const client = await createClient();
  const accessContext = await resolveAccessContext(client, orgSlug);
  let query = db(client)
    .from("debit_notes")
    .select(DEBIT_NOTE_SELECT)
    .eq("organization_id", org.id);
  if (accessContext.scope === "own" && accessContext.userId) {
    query = query.eq("created_by", accessContext.userId);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error || !data) {
    return [];
  }
  return data.map(mapDebitNote);
}

export async function getDebitNoteById(
  orgSlug: string,
  debitNoteId: string
): Promise<DebitNote | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return null;
  }
  const client = await createClient();
  const { data, error } = await db(client)
    .from("debit_notes")
    .select(DEBIT_NOTE_SELECT)
    .eq("organization_id", org.id)
    .eq("id", debitNoteId)
    .maybeSingle();
  return error || !data ? null : mapDebitNote(data);
}

export async function getDebitNotesBySaleId(
  orgSlug: string,
  salesOrderId: string
): Promise<DebitNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }
  const client = await createClient();
  const accessContext = await resolveAccessContext(client, orgSlug);
  let query = db(client)
    .from("debit_notes")
    .select(DEBIT_NOTE_SELECT)
    .eq("organization_id", org.id)
    .eq("sales_order_id", salesOrderId);
  if (accessContext.scope === "own" && accessContext.userId) {
    query = query.eq("created_by", accessContext.userId);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  return error || !data ? [] : data.map(mapDebitNote);
}

export async function getDebitNotesByCustomerId(
  orgSlug: string,
  customerId: string
): Promise<DebitNote[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }
  const client = await createClient();
  const accessContext = await resolveAccessContext(client, orgSlug);
  let query = db(client)
    .from("debit_notes")
    .select(DEBIT_NOTE_SELECT)
    .eq("organization_id", org.id)
    .eq("customer_id", customerId);
  if (accessContext.scope === "own" && accessContext.userId) {
    query = query.eq("created_by", accessContext.userId);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  return error || !data ? [] : data.map(mapDebitNote);
}
