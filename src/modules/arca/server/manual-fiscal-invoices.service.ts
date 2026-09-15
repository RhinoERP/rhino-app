import "server-only";

import { z } from "zod";
import { confirmAccountingEvent } from "@/lib/accounting-server";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import type { AnyEvento } from "@/modules/accounting/types";
import { normalizeCustomerTaxCondition } from "@/modules/customers/tax-conditions";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  getArcaCbteTipo,
  isArcaSupportedInvoiceType,
} from "@/modules/sales/invoice-type-utils";
import type { InvoiceType } from "@/modules/sales/types";
import {
  ArcaConnectionError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import {
  type ArcaCurrencyQuoteClient,
  buildArcaCurrencyRequestFields,
  buildInvoiceFiscalCurrency,
  resolveArcaFiscalCurrency,
} from "../fiscal-currency";
import { buildArcaReceiverDocument } from "../receiver-document";
import { mapCustomerTaxConditionToArcaReceiverVatConditionId } from "../receiver-tax-conditions";
import { validateOrganizationCuit } from "../validation";
import { assertCanIssueOrganizationArca } from "./access";
import {
  createArcaClientFromCredentials,
  isArcaCertificateExpired,
  resolveArcaOrganizationCredentials,
} from "./client-factory";
import { toArcaStatus } from "./settings.service";

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  ivaRate: z.union([
    z.literal(0),
    z.literal(10.5),
    z.literal(21),
    z.literal(27),
  ]),
});
const ARCA_COMPACT_DATE_REGEX = /^\d{8}$/;

export const manualFiscalInvoiceSchema = z
  .object({
    orgSlug: z.string().min(1),
    customerId: z.string().uuid(),
    issueDate: z.string().date(),
    dueDate: z.string().date().nullable().optional(),
    invoiceType: z.enum(["FACTURA_A", "FACTURA_B", "FACTURA_C"]),
    currency: z.enum(["ARS", "USD"]),
    exchangeRate: z.number().positive().nullable().optional(),
    customMessage: z.string().trim().max(2000).nullable().optional(),
    emailRecipients: z.string().trim().max(1000).nullable().optional(),
    emailSubject: z.string().trim().max(300).nullable().optional(),
    emailBody: z.string().trim().max(5000).nullable().optional(),
    items: z.array(lineSchema).min(1),
  })
  .superRefine((value, ctx) => {
    if (value.currency === "USD" && !value.exchangeRate) {
      ctx.addIssue({
        code: "custom",
        path: ["exchangeRate"],
        message: "Ingresá la cotización para facturas en USD.",
      });
    }
  });

export type ManualFiscalInvoiceInput = z.infer<
  typeof manualFiscalInvoiceSchema
>;
export type ManualFiscalInvoice = {
  id: string;
  organization_id: string;
  customer_id: string;
  issue_date: string;
  due_date: string | null;
  invoice_type: InvoiceType;
  currency: "ARS" | "USD";
  exchange_rate: number | null;
  sub_total: number;
  total_tax_amount: number;
  total_amount: number;
  custom_message: string | null;
  email_recipients: string | null;
  email_subject: string | null;
  email_body: string | null;
  status: "draft" | "pending" | "authorized" | "error";
  invoice_number: string | null;
  arca_cae: string | null;
  arca_cae_expires_at: string | null;
  arca_authorized_at: string | null;
  arca_point_of_sale: number | null;
  arca_voucher_number: number | null;
  arca_voucher_type_code: number | null;
  arca_last_error: string | null;
  arca_request_json?: unknown;
  customer?: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
    email: string | null;
    cuit: string | null;
    tax_condition: string | null;
  } | null;
  items?: ManualFiscalInvoiceItem[];
};
export type ManualFiscalInvoiceItem = {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  iva_rate: number;
  net_amount: number;
  tax_amount: number;
  total_amount: number;
};

function table(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase.from("manual_fiscal_invoices" as never);
}
function itemsTable(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase.from("manual_fiscal_invoice_items" as never);
}
function formatNumber(point: number, voucher: number) {
  return `${String(point).padStart(4, "0")}-${String(voucher).padStart(8, "0")}`;
}
function caeDate(value: string) {
  const raw = value.trim();
  return ARCA_COMPACT_DATE_REGEX.test(raw)
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00.000Z`
    : new Date(raw).toISOString();
}
function ivaId(rate: number) {
  if (rate === 0) {
    return 3;
  }
  if (rate === 10.5) {
    return 4;
  }
  if (rate === 21) {
    return 5;
  }
  return 6;
}

function calculate(
  items: ManualFiscalInvoiceInput["items"]
): ManualFiscalInvoiceItem[] {
  return items.map((item) => {
    const net = truncateMoney(item.quantity * item.unitPrice);
    const tax = truncateMoney((net * item.ivaRate) / 100);
    return {
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      iva_rate: item.ivaRate,
      net_amount: net,
      tax_amount: tax,
      total_amount: truncateMoney(net + tax),
    };
  });
}

async function completeAuthorizedInvoiceSideEffects(params: {
  invoice: ManualFiscalInvoice;
  organizationId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<void> {
  const { invoice, organizationId, supabase } = params;

  try {
    const { data: existingReceivable, error: existingReceivableError } =
      await supabase
        .from("accounts_receivable")
        .select("id")
        .eq("manual_fiscal_invoice_id" as never, invoice.id)
        .maybeSingle();

    if (existingReceivableError) {
      throw existingReceivableError;
    }

    if (!existingReceivable) {
      const dueDate = invoice.due_date ?? invoice.issue_date;
      await supabase
        .from("accounts_receivable")
        .insert({
          organization_id: organizationId,
          customer_id: invoice.customer_id,
          sales_order_id: null,
          manual_fiscal_invoice_id: invoice.id,
          total_amount: invoice.total_amount,
          pending_balance: invoice.total_amount,
          currency: invoice.currency,
          due_date: dueDate,
          status: "PENDING",
        } as never)
        .throwOnError();
    }
  } catch (cause) {
    console.error("Factura manual autorizada sin cuenta por cobrar", cause);
    await table(supabase)
      .update({
        arca_last_error:
          "Factura autorizada. La cuenta por cobrar quedó pendiente de revisión.",
      } as never)
      .eq("id", invoice.id);
    return;
  }

  try {
    const accountingEvent = {
      tipoEvento: "FACTURA_VENTA",
      orgId: organizationId,
      referenciaId: invoice.id,
      referenciaTabla: "manual_fiscal_invoices",
      fecha: invoice.issue_date,
      descripcion: `Factura manual ${invoice.invoice_number ?? invoice.id}`,
      idempotencyKey: `FACTURA_VENTA_MANUAL_${invoice.id}`,
      datos: {
        tipoFactura: "MANUAL",
        totalFactura: invoice.total_amount.toFixed(2),
        montoNeto: invoice.sub_total.toFixed(2),
        montoImpuestos: invoice.total_tax_amount.toFixed(2),
        condicionVenta: invoice.due_date ? "CREDITO" : "CONTADO",
        clienteId: invoice.customer_id,
        facturaNumero: invoice.invoice_number ?? invoice.id,
        moneda: invoice.currency,
        ...(invoice.currency === "USD"
          ? {
              tipoCambio: String(invoice.exchange_rate),
              montoUSD: invoice.total_amount.toFixed(2),
            }
          : {}),
        lineasDesglosadas: [
          {
            accountCode: null,
            montoNeto: invoice.sub_total.toFixed(2),
            montoImpuestos: invoice.total_tax_amount.toFixed(2),
          },
        ],
      },
    } as unknown as AnyEvento;
    await confirmAccountingEvent(accountingEvent);
  } catch (cause) {
    console.error(
      "Factura manual autorizada con contabilidad pendiente",
      cause
    );
    await table(supabase)
      .update({
        arca_last_error:
          "Factura autorizada. El asiento contable quedó pendiente de revisión.",
      } as never)
      .eq("id", invoice.id);
  }
}

export async function createManualFiscalInvoice(
  input: ManualFiscalInvoiceInput
): Promise<ManualFiscalInvoice> {
  await assertCanIssueOrganizationArca(input.orgSlug);
  const supabase = await createClient();
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error("No autorizado");
  }
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", org.id)
    .eq("id", input.customerId)
    .maybeSingle();
  if (!customer) {
    throw new Error("Cliente no encontrado");
  }
  const items = calculate(input.items);
  const subTotal = truncateMoney(
    items.reduce((sum, item) => sum + item.net_amount, 0)
  );
  const tax = truncateMoney(
    items.reduce((sum, item) => sum + item.tax_amount, 0)
  );
  const { data: invoice, error } = await table(supabase)
    .insert({
      organization_id: org.id,
      customer_id: input.customerId,
      created_by: auth.user.id,
      issue_date: input.issueDate,
      due_date: input.dueDate ?? null,
      invoice_type: input.invoiceType,
      currency: input.currency,
      exchange_rate: input.exchangeRate ?? null,
      sub_total: subTotal,
      total_tax_amount: tax,
      total_amount: truncateMoney(subTotal + tax),
      custom_message: input.customMessage ?? null,
      email_recipients: input.emailRecipients ?? null,
      email_subject: input.emailSubject ?? null,
      email_body: input.emailBody ?? null,
    } as never)
    .select("*")
    .single();
  if (error || !invoice) {
    throw new Error(
      `No se pudo crear la factura manual: ${error?.message ?? "sin respuesta"}`
    );
  }
  const invoiceId = (invoice as { id: string }).id;
  const { error: itemsError } = await itemsTable(supabase).insert(
    items.map((item) => ({
      ...item,
      manual_fiscal_invoice_id: invoiceId,
    })) as never
  );
  if (itemsError) {
    await table(supabase).delete().eq("id", invoiceId);
    throw new Error(
      `No se pudieron guardar los renglones: ${itemsError.message}`
    );
  }
  return invoice as ManualFiscalInvoice;
}

export async function getManualFiscalInvoices(
  orgSlug: string
): Promise<ManualFiscalInvoice[]> {
  const [supabase, org] = await Promise.all([
    createClient(),
    getOrganizationBySlug(orgSlug),
  ]);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const { data, error } = await table(supabase)
    .select(
      "*, customer:customers(id, business_name, fantasy_name, email, cuit, tax_condition), items:manual_fiscal_invoice_items(*) "
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(
      `No se pudieron obtener las facturas manuales: ${error.message}`
    );
  }
  return (data ?? []) as unknown as ManualFiscalInvoice[];
}

export async function getManualFiscalInvoiceById(params: {
  orgSlug: string;
  invoiceId: string;
}): Promise<ManualFiscalInvoice> {
  const [supabase, org] = await Promise.all([
    createClient(),
    getOrganizationBySlug(params.orgSlug),
  ]);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const { data, error } = await table(supabase)
    .select(
      "*, customer:customers(id, business_name, fantasy_name, email, cuit, tax_condition), items:manual_fiscal_invoice_items(*)"
    )
    .eq("organization_id", org.id)
    .eq("id", params.invoiceId)
    .maybeSingle();
  if (error || !data) {
    throw new ArcaValidationError("Factura manual no encontrada.");
  }

  return data as unknown as ManualFiscalInvoice;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fiscal issuance needs a single durable ARCA flow.
export async function emitManualFiscalInvoice(params: {
  orgSlug: string;
  invoiceId: string;
}): Promise<ManualFiscalInvoice> {
  const organization = await assertCanIssueOrganizationArca(params.orgSlug);
  const supabase = await createClient();
  const { data, error } = await table(supabase)
    .select(
      "*, customer:customers(id, business_name, fantasy_name, email, cuit, tax_condition), items:manual_fiscal_invoice_items(*)"
    )
    .eq("organization_id", organization.id)
    .eq("id", params.invoiceId)
    .single();
  if (error || !data) {
    throw new ArcaValidationError("Factura manual no encontrada.");
  }
  const invoice = data as unknown as ManualFiscalInvoice;
  if (invoice.status === "authorized") {
    await completeAuthorizedInvoiceSideEffects({
      invoice,
      organizationId: organization.id,
      supabase,
    });
    return invoice;
  }
  if (invoice.status === "pending") {
    throw new ArcaValidationError(
      "La emisión de esta factura está en curso. No la reintentes hasta conciliarla."
    );
  }
  if (
    !(
      invoice.customer &&
      invoice.items?.length &&
      isArcaSupportedInvoiceType(invoice.invoice_type)
    )
  ) {
    throw new ArcaValidationError(
      "La factura manual no tiene datos fiscales válidos."
    );
  }
  const taxCondition = normalizeCustomerTaxCondition(
    invoice.customer.tax_condition
  );
  if (!taxCondition) {
    throw new ArcaValidationError(
      "El cliente no tiene condición fiscal válida."
    );
  }
  const credentials = await resolveArcaOrganizationCredentials({
    organizationId: organization.id,
    organizationCuit: validateOrganizationCuit(organization.cuit),
    actor: "system",
  });
  if (
    toArcaStatus(credentials.settings.status) !== "connected" ||
    isArcaCertificateExpired(credentials.certExpiresAt)
  ) {
    throw new ArcaValidationError(
      "La configuración ARCA no está disponible para emitir."
    );
  }
  const client = createArcaClientFromCredentials({
    cuit: credentials.organizationCuit,
    cert: credentials.cert,
    key: credentials.key,
    environment: credentials.environment,
  });
  const fiscalCurrency = await resolveArcaFiscalCurrency(
    client as unknown as ArcaCurrencyQuoteClient,
    buildInvoiceFiscalCurrency(invoice.currency)
  );
  const iva = new Map<number, { BaseImp: number; Importe: number }>();
  for (const item of invoice.items) {
    const current = iva.get(item.iva_rate) ?? { BaseImp: 0, Importe: 0 };
    current.BaseImp = truncateMoney(current.BaseImp + item.net_amount);
    current.Importe = truncateMoney(current.Importe + item.tax_amount);
    iva.set(item.iva_rate, current);
  }
  const receiver = buildArcaReceiverDocument({
    customerCuit: invoice.customer.cuit,
    customerTaxCondition: invoice.customer.tax_condition,
    invoiceType: invoice.invoice_type,
    totalAmount: invoice.total_amount,
  });
  const request = {
    Concepto: 2,
    DocTipo: receiver.documentType,
    DocNro: receiver.documentNumber,
    CondicionIVAReceptorId: mapCustomerTaxConditionToArcaReceiverVatConditionId(
      invoice.customer.tax_condition
    ),
    CbteFch: Number(invoice.issue_date.replaceAll("-", "")),
    ImpTotal: invoice.total_amount,
    ImpTotConc: 0,
    ImpNeto: invoice.sub_total,
    ImpOpEx: 0,
    ImpIVA: invoice.total_tax_amount,
    ImpTrib: 0,
    ...buildArcaCurrencyRequestFields(fiscalCurrency),
    PtoVta: credentials.pointOfSale,
    CbteTipo: getArcaCbteTipo(invoice.invoice_type),
    ...(invoice.total_tax_amount > 0
      ? {
          Iva: [...iva.entries()]
            .filter(([, value]) => value.Importe > 0)
            .map(([rate, value]) => ({ Id: ivaId(rate), ...value })),
        }
      : {}),
  };
  const requestJson = {
    manualFiscalInvoiceId: invoice.id,
    customer: invoice.customer,
    items: invoice.items,
    wsfeRequest: request,
  };
  const { data: locked } = await table(supabase)
    .update({
      status: "pending",
      arca_last_error: null,
      arca_request_json: requestJson,
    } as never)
    .eq("id", invoice.id)
    .in("status", ["draft", "error"])
    .select("id")
    .maybeSingle();
  if (!locked) {
    throw new ArcaValidationError(
      "La factura cambió de estado. Actualizá la pantalla."
    );
  }
  let authorization: Awaited<
    ReturnType<typeof client.ElectronicBilling.createNextVoucher>
  >;
  try {
    authorization = await client.ElectronicBilling.createNextVoucher(request);
  } catch (cause) {
    const message = sanitizeArcaErrorMessage(cause);
    const wasRejectedByArca = cause instanceof ArcaValidationError;
    await table(supabase)
      .update({
        status: wasRejectedByArca ? "error" : "pending",
        arca_last_error: wasRejectedByArca
          ? message
          : "Resultado ARCA indeterminado. Requiere conciliación antes de reintentar para evitar un comprobante duplicado.",
      } as never)
      .eq("id", invoice.id);
    throw new ArcaConnectionError(
      message || "No se pudo emitir la factura manual en ARCA."
    );
  }

  let authorized: unknown;
  try {
    const voucherNumber = Number(authorization.voucherNumber);
    const now = new Date().toISOString();
    const patch = {
      status: "authorized",
      invoice_number: formatNumber(credentials.pointOfSale, voucherNumber),
      arca_cae: String(authorization.CAE),
      arca_cae_expires_at: caeDate(String(authorization.CAEFchVto)),
      arca_authorized_at: now,
      arca_point_of_sale: credentials.pointOfSale,
      arca_voucher_number: voucherNumber,
      arca_voucher_type_code: request.CbteTipo,
      arca_last_error: null,
      arca_response_json: { authorization },
    };
    const { data: persistedInvoice, error: persistError } = await table(
      supabase
    )
      .update(patch as never)
      .eq("id", invoice.id)
      .select(
        "*, customer:customers(id, business_name, fantasy_name, email, cuit, tax_condition), items:manual_fiscal_invoice_items(*)"
      )
      .single();
    if (persistError || !persistedInvoice) {
      throw new ArcaConnectionError(
        "ARCA autorizó el comprobante pero Rhino no pudo guardarlo."
      );
    }
    authorized = persistedInvoice;
  } catch (cause) {
    const message = sanitizeArcaErrorMessage(cause);
    await table(supabase)
      .update({
        status: "pending",
        arca_last_error:
          "ARCA autorizó el comprobante, pero Rhino no pudo terminar de guardarlo. Requiere conciliación antes de reintentar.",
      } as never)
      .eq("id", invoice.id);
    throw new ArcaConnectionError(
      message || "No se pudo emitir la factura manual en ARCA."
    );
  }

  const authorizedInvoice = authorized as ManualFiscalInvoice;
  await completeAuthorizedInvoiceSideEffects({
    invoice: authorizedInvoice,
    organizationId: organization.id,
    supabase,
  });
  return authorizedInvoice;
}
