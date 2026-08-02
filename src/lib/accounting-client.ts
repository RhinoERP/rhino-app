import type {
  AnyEvento,
  EventoAsientoManual,
  EventoCobro,
  EventoFacturaCompra,
  EventoFacturaVenta,
  EventoNcCompra,
  EventoNcVenta,
  EventoNdVenta,
  EventoOrdenPago,
  InformalEntry,
  InformalEntryFormalizationStatus,
  InformalEntrySourceType,
  InformalEntryWithLines,
  PreviewResponse,
} from "@/modules/accounting/types";

const BASE_URL = "/api/contabilidad";
const TIMEOUT_MS = 10_000;
const ORG_SLUG_HEADER = "x-org-slug";

function getCurrentOrgSlug(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const pathParts = window.location.pathname.split("/").filter(Boolean);
  if (pathParts[0] === "org" && pathParts[1]) {
    return pathParts[1];
  }

  if (
    pathParts[0] === "admin" &&
    pathParts[1] === "organizacion" &&
    pathParts[2]
  ) {
    return pathParts[2];
  }

  return null;
}

function withOrgSlugHeader(init: RequestInit): RequestInit {
  const headers = new Headers(init.headers);
  const orgSlug = getCurrentOrgSlug();

  if (orgSlug) {
    headers.set(ORG_SLUG_HEADER, orgSlug);
  }

  return {
    ...init,
    headers,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// previewAccountingEvent
// Llama POST /api/contabilidad/preview — no persiste nada.
// ------------------------------------------------------------
export async function previewAccountingEvent(
  evento: AnyEvento
): Promise<PreviewResponse> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/preview`,
    withOrgSlugHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evento),
    })
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Preview falló: ${res.status}`
    );
  }

  const json = await res.json();
  return (json as { data: PreviewResponse }).data;
}

export type AccountingLineEdit = {
  index: number;
  cuentaId?: string;
  monto?: string;
};

export type AccountingManualLine = {
  lado: "DEBE" | "HABER";
  cuentaId: string;
  monto: string;
};

export type AccountingEventSubmitOptions = {
  lineasEditadas?: AccountingLineEdit[];
  lineasManuales?: AccountingManualLine[];
};

export type CreateManualJournalEntryInput = {
  orgId: string;
  fecha: string;
  descripcion: string;
  referenciaLibre?: string;
  creadoPor?: string;
  moneda?: "ARS" | "USD";
  tipoCambio?: number;
  lineas: AccountingManualLine[];
};

function generateUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  const randomHex = () => Math.floor(Math.random() * 16).toString(16);
  const variantHex = () =>
    ["8", "9", "a", "b"][Math.floor(Math.random() * 4)] ?? "8";

  return `${Array.from({ length: 8 }, randomHex).join("")}-${Array.from(
    { length: 4 },
    randomHex
  ).join(
    ""
  )}-4${Array.from({ length: 3 }, randomHex).join("")}-${variantHex()}${Array.from(
    { length: 3 },
    randomHex
  ).join("")}-${Array.from({ length: 12 }, randomHex).join("")}`;
}

// ------------------------------------------------------------
// confirmAccountingEvent
// Llama POST /api/contabilidad/eventos — crea el asiento.
// lineasEditadas: sobreescribe cuentas/montos del preview.
// lineasManuales: agrega líneas nuevas antes de persistir.
// ------------------------------------------------------------
export async function confirmAccountingEvent(
  evento: AnyEvento,
  options: AccountingEventSubmitOptions = {}
): Promise<string> {
  const body = {
    ...evento,
    lineasEditadas: options.lineasEditadas ?? [],
    lineasManuales: options.lineasManuales ?? [],
  };
  const res = await fetchWithTimeout(
    `${BASE_URL}/eventos`,
    withOrgSlugHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(
      (payload as { error?: string }).error ??
        `Confirmar evento falló: ${res.status}`
    );
  }

  const json = await res.json();
  return (json as { data: { asientoId: string } }).data.asientoId;
}

export function createManualJournalEntry(
  input: CreateManualJournalEntryInput
): Promise<string> {
  const referenciaId = generateUuid();
  const evento: EventoAsientoManual = {
    tipoEvento: "ASIENTO_MANUAL",
    orgId: input.orgId,
    referenciaId,
    referenciaTabla: "manual",
    fecha: input.fecha,
    descripcion: input.referenciaLibre?.trim()
      ? `${input.descripcion} · Ref: ${input.referenciaLibre.trim()}`
      : input.descripcion,
    idempotencyKey: `MANUAL_${referenciaId}`,
    datos: {
      ...(input.creadoPor ? { usuarioId: input.creadoPor } : {}),
      ...(input.moneda ? { moneda: input.moneda } : {}),
      ...(input.moneda === "USD" && input.tipoCambio
        ? {
            tipoCambio: toAccountingStr(input.tipoCambio),
          }
        : {}),
      ...(input.referenciaLibre?.trim()
        ? { referenciaLibre: input.referenciaLibre.trim() }
        : {}),
    },
  };

  return confirmAccountingEvent(evento, {
    lineasManuales: input.lineas,
  });
}

export async function createInformalEntry(
  evento: AnyEvento,
  sourceType: InformalEntrySourceType,
  options: AccountingEventSubmitOptions = {}
): Promise<string> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/eventos/informal`,
    withOrgSlugHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...evento,
        source_type: sourceType,
        lineasEditadas: options.lineasEditadas ?? [],
        lineasManuales: options.lineasManuales ?? [],
      }),
    })
  );

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(
      (payload as { error?: string }).error ??
        `Crear asiento informal falló: ${res.status}`
    );
  }

  const json = await res.json();
  return (json as { data: { informalEntryId: string } }).data.informalEntryId;
}

export async function formalizarEntry(
  informalEntryId: string,
  options: AccountingEventSubmitOptions = {}
): Promise<string> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/informal-entries/${informalEntryId}/formalizar`,
    withOrgSlugHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineasEditadas: options.lineasEditadas ?? [],
        lineasManuales: options.lineasManuales ?? [],
      }),
    })
  );

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(
      (payload as { error?: string }).error ??
        `Formalizar asiento informal falló: ${res.status}`
    );
  }

  const json = await res.json();
  return (json as { data: { journalEntryId: string } }).data.journalEntryId;
}

export async function cancelInformalEntry(
  informalEntryId: string
): Promise<string> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/informal-entries/${informalEntryId}/cancelar`,
    withOrgSlugHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  );

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const errorMessage =
      (payload as { error?: string }).error ??
      `Cancelar asiento informal falló: ${res.status}`;

    if (res.status === 404) {
      return informalEntryId;
    }

    throw new Error(errorMessage);
  }

  const json = await res.json();
  return (json as { data: { informalEntryId: string } }).data.informalEntryId;
}

export async function asentarInformalEntry(
  informalEntryId: string
): Promise<string> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/informal-entries/${informalEntryId}/asentar`,
    withOrgSlugHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  );

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(
      (payload as { error?: string }).error ??
        `Asentar asiento informal falló: ${res.status}`
    );
  }

  const json = await res.json();
  return (json as { data: { informalEntryId: string } }).data.informalEntryId;
}

export async function fetchInformalEntries(params: {
  orgId: string;
  estadoFormalizacion?: InformalEntryFormalizationStatus;
  sourceType?: InformalEntrySourceType;
  desde?: string;
  hasta?: string;
}): Promise<InformalEntry[]> {
  const query = new URLSearchParams({ org_id: params.orgId });
  if (params.estadoFormalizacion) {
    query.set("estado_formalizacion", params.estadoFormalizacion);
  }
  if (params.sourceType) {
    query.set("source_type", params.sourceType);
  }
  if (params.desde) {
    query.set("desde", params.desde);
  }
  if (params.hasta) {
    query.set("hasta", params.hasta);
  }

  const res = await fetchWithTimeout(
    `${BASE_URL}/informal-entries?${query}`,
    withOrgSlugHeader({ method: "GET" })
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Asientos informales falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: InformalEntry[] }).data;
}

export async function fetchInformalEntryById(params: {
  orgId: string;
  entryId: string;
}): Promise<InformalEntryWithLines> {
  const query = new URLSearchParams({ org_id: params.orgId });
  const res = await fetchWithTimeout(
    `${BASE_URL}/informal-entries/${params.entryId}?${query}`,
    withOrgSlugHeader({ method: "GET" })
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Detalle de asiento informal falló: ${res.status}`
    );
  }

  const json = await res.json();
  return (json as { data: InformalEntryWithLines }).data;
}

// ------------------------------------------------------------
// Helpers para construir payloads desde el monolito
// ------------------------------------------------------------

/** Convierte number a string con 4 decimales para el servicio contable */
export function toAccountingStr(n: number): string {
  return n.toFixed(4);
}

export type LineaDesglosadaInput = {
  montoNeto: number;
  montoImpuestos: number;
  accountCode: string | null;
  impuestos?: LineaImpuestoInput[];
};

export type LineaImpuestoInput = {
  monto: number;
  accountCode?: string | null;
  taxCode?: string | null;
  nombre?: string | null;
};

export type LineaDesglosada = {
  accountCode: string | null;
  montoNeto: string;
  montoImpuestos?: string;
  impuestos?: LineaImpuesto[];
};

export type LineaImpuesto = {
  monto: string;
  accountCode?: string | null;
  taxCode?: string | null;
  nombre?: string | null;
};

export type AccountingPaymentMethodInput =
  | "efectivo"
  | "transferencia"
  | "cheque"
  | "deposito"
  | "e-cheq"
  | "tarjeta_de_credito"
  | "tarjeta_de_debito"
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "CHEQUE"
  | "E-CHEQ";

type AccountingServicePaymentMethod =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "CHEQUE"
  | "E-CHEQ";

type CurrencyFields = {
  moneda?: "ARS" | "USD";
  tipoCambio?: number | string | null;
  montoUSD?: number | string | null;
};

type PurchaseAccountingTax = {
  tax_amount?: number | null;
  tax_code_snapshot?: string | null;
  taxCodeSnapshot?: string | null;
  taxCode?: string | null;
  code?: string | null;
};

export type PurchaseAccountingLineItemInput = {
  subtotal: number | null;
  accountingAccountCode?: string | null;
};

function getPurchaseTaxCode(tax: PurchaseAccountingTax): string | null {
  return (
    (
      tax.tax_code_snapshot ??
      tax.taxCodeSnapshot ??
      tax.taxCode ??
      tax.code ??
      null
    )
      ?.trim()
      .toUpperCase() ?? null
  );
}

function splitPurchaseTaxes(taxes: PurchaseAccountingTax[] | undefined) {
  let montoIVA = 0;
  let montoIIBB = 0;

  for (const tax of taxes ?? []) {
    const taxAmount = Number(tax.tax_amount ?? 0);
    if (!Number.isFinite(taxAmount) || taxAmount <= 0) {
      continue;
    }

    const taxCode = getPurchaseTaxCode(tax);
    if (taxCode?.startsWith("IVA_")) {
      montoIVA += taxAmount;
      continue;
    }

    if (taxCode === "TRIBUTO_02") {
      montoIIBB += taxAmount;
    }
  }

  return { montoIVA, montoIIBB };
}

function normalizePaymentMethod(
  method: AccountingPaymentMethodInput
): AccountingServicePaymentMethod {
  switch (method) {
    case "EFECTIVO":
    case "efectivo":
      return "EFECTIVO";
    case "CHEQUE":
    case "cheque":
      return "CHEQUE";
    case "E-CHEQ":
    case "e-cheq":
      return "E-CHEQ";
    default:
      return "TRANSFERENCIA";
  }
}

function toOptionalAccountingStr(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return;
  }
  return typeof value === "number" ? toAccountingStr(value) : value;
}

function buildCurrencyDatos(fields?: CurrencyFields) {
  if (!fields) {
    return {};
  }

  return {
    moneda: fields.moneda,
    tipoCambio: toOptionalAccountingStr(fields.tipoCambio),
    montoUSD: toOptionalAccountingStr(fields.montoUSD),
  };
}

export function buildLineasDesglosadas(
  items: LineaDesglosadaInput[]
): LineaDesglosada[] {
  const grouped = new Map<
    string,
    {
      accountCode: string | null;
      montoNeto: number;
      montoImpuestos: number;
      impuestos: Map<
        string,
        {
          monto: number;
          accountCode?: string | null;
          taxCode?: string | null;
          nombre?: string | null;
        }
      >;
    }
  >();

  for (const item of items) {
    const key = item.accountCode ?? "__SIN_CUENTA__";
    const current = grouped.get(key) ?? {
      accountCode: item.accountCode,
      montoNeto: 0,
      montoImpuestos: 0,
      impuestos: new Map(),
    };

    current.montoNeto += item.montoNeto;
    current.montoImpuestos += item.montoImpuestos;

    for (const impuesto of item.impuestos ?? []) {
      const impuestoKey = [
        impuesto.accountCode ?? "__SIN_CUENTA__",
        impuesto.taxCode ?? "__SIN_CODIGO__",
        impuesto.nombre ?? "__SIN_NOMBRE__",
      ].join(":");
      const currentImpuesto = current.impuestos.get(impuestoKey) ?? {
        accountCode: impuesto.accountCode,
        taxCode: impuesto.taxCode,
        nombre: impuesto.nombre,
        monto: 0,
      };
      currentImpuesto.monto += impuesto.monto;
      current.impuestos.set(impuestoKey, currentImpuesto);
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .filter(
      (item) =>
        Math.abs(item.montoNeto) > 0.0001 ||
        Math.abs(item.montoImpuestos) > 0.0001
    )
    .map((item) => ({
      accountCode: item.accountCode,
      montoNeto: toAccountingStr(item.montoNeto),
      montoImpuestos: toAccountingStr(item.montoImpuestos),
      impuestos:
        item.impuestos.size > 0
          ? Array.from(item.impuestos.values())
              .filter((impuesto) => Math.abs(impuesto.monto) > 0.0001)
              .map((impuesto) => ({
                monto: toAccountingStr(impuesto.monto),
                accountCode: impuesto.accountCode ?? null,
                taxCode: impuesto.taxCode ?? null,
                nombre: impuesto.nombre ?? null,
              }))
          : undefined,
    }));
}

export function buildPurchaseLineasDesglosadas(params: {
  items: PurchaseAccountingLineItemInput[];
  totalTaxAmount?: number | null;
  globalDiscountAmount?: number | null;
}): LineaDesglosadaInput[] {
  const normalizedItems = params.items
    .map((item) => ({
      accountCode: item.accountingAccountCode ?? null,
      subtotal: Number(item.subtotal ?? 0),
    }))
    .filter((item) => Number.isFinite(item.subtotal) && item.subtotal > 0);

  if (normalizedItems.length === 0) {
    return [];
  }

  const totalSubtotal = normalizedItems.reduce(
    (sum, item) => sum + item.subtotal,
    0
  );
  const discountAmount = Math.max(0, Number(params.globalDiscountAmount ?? 0));
  const totalTaxAmount = Math.max(0, Number(params.totalTaxAmount ?? 0));
  const totalNetAmount = Math.max(0, totalSubtotal - discountAmount);

  let remainingNetAmount = totalNetAmount;
  let remainingTaxAmount = totalTaxAmount;

  const getProratedAmount = (args: {
    isLastItem: boolean;
    remainingAmount: number;
    subtotal: number;
    totalAmount: number;
  }) => {
    if (args.isLastItem) {
      return args.remainingAmount;
    }

    if (totalSubtotal <= 0) {
      return 0;
    }

    return (args.subtotal / totalSubtotal) * args.totalAmount;
  };

  return normalizedItems.map((item, index) => {
    const isLastItem = index === normalizedItems.length - 1;
    const montoNeto = getProratedAmount({
      isLastItem,
      remainingAmount: remainingNetAmount,
      subtotal: item.subtotal,
      totalAmount: totalNetAmount,
    });
    const montoImpuestos = getProratedAmount({
      isLastItem,
      remainingAmount: remainingTaxAmount,
      subtotal: item.subtotal,
      totalAmount: totalTaxAmount,
    });

    remainingNetAmount -= montoNeto;
    remainingTaxAmount -= montoImpuestos;

    return {
      accountCode: item.accountCode,
      montoNeto,
      montoImpuestos,
    };
  });
}

function getPurchaseTaxAmounts(purchaseOrder: {
  tax_amount: number | null;
  taxes?: PurchaseAccountingTax[] | null;
}) {
  const hasDetailedTaxes = Boolean(purchaseOrder.taxes?.length);
  const splitTaxes = splitPurchaseTaxes(purchaseOrder.taxes ?? undefined);
  const totalTaxAmountFromRows = (purchaseOrder.taxes ?? []).reduce(
    (sum, taxRow) => sum + Number(taxRow.tax_amount ?? 0),
    0
  );
  const hasSplitTaxes = splitTaxes.montoIVA > 0 || splitTaxes.montoIIBB > 0;

  let montoImpuestos = purchaseOrder.tax_amount ?? 0;
  if (hasDetailedTaxes) {
    montoImpuestos = hasSplitTaxes
      ? splitTaxes.montoIVA
      : totalTaxAmountFromRows || (purchaseOrder.tax_amount ?? 0);
  }

  return {
    montoImpuestos,
    montoIIBB: hasDetailedTaxes && hasSplitTaxes ? splitTaxes.montoIIBB : 0,
  };
}

function getPurchaseFacturaNumero(purchaseOrder: {
  remittance_number: string | null;
  purchase_number?: number | null;
}) {
  if (purchaseOrder.remittance_number) {
    return purchaseOrder.remittance_number;
  }

  if (purchaseOrder.purchase_number) {
    return `Compra ${purchaseOrder.purchase_number}`;
  }

  return "Sin comprobante";
}

// ------------------------------------------------------------
// buildFacturaCompra
// Construye el EventoFacturaCompra desde el purchaseOrder
// retornado por createPurchaseOrder (la row de Supabase).
// montoNeto = total_amount - tax_amount (base imponible efectiva)
// ------------------------------------------------------------
export function buildFacturaCompra(
  purchaseOrder: {
    id: string;
    organization_id: string;
    supplier_id: string;
    purchase_date: string;
    expiration_date: string | null;
    subtotal_amount: number | null;
    tax_amount: number | null;
    total_amount: number | null;
    remittance_number: string | null;
    purchase_number?: number | null;
    taxes?: PurchaseAccountingTax[] | null;
  },
  options: {
    items?: LineaDesglosadaInput[];
  } = {}
): EventoFacturaCompra {
  const total = purchaseOrder.total_amount ?? 0;
  const { montoImpuestos, montoIIBB } = getPurchaseTaxAmounts(purchaseOrder);
  const montoNeto = total - montoImpuestos - montoIIBB;
  const facturaNumero = getPurchaseFacturaNumero(purchaseOrder);
  const lineasDesglosadas = options.items?.length
    ? buildLineasDesglosadas(options.items)
    : undefined;

  return {
    tipoEvento: "FACTURA_COMPRA",
    orgId: purchaseOrder.organization_id,
    referenciaId: purchaseOrder.id,
    referenciaTabla: "purchase_orders",
    fecha: purchaseOrder.purchase_date,
    descripcion: `Factura compra ${facturaNumero}`,
    idempotencyKey: `FACTURA_COMPRA_${purchaseOrder.id}`,
    datos: {
      montoNeto: toAccountingStr(montoNeto),
      montoImpuestos: toAccountingStr(montoImpuestos),
      montoIIBB: toAccountingStr(montoIIBB),
      totalFactura: toAccountingStr(total),
      condicionCompra: purchaseOrder.expiration_date ? "CREDITO" : "CONTADO",
      proveedorId: purchaseOrder.supplier_id,
      facturaNumero,
      lineasDesglosadas,
    },
  };
}

export function buildNcCompra(
  creditNote: {
    id: string;
    organization_id: string;
    supplier_id: string;
    purchase_order_id: string;
    issue_date: string;
    credit_note_number: string | null;
    amount: number;
    tax_amount?: number | null;
  },
  linkedPurchase?: {
    id: string;
    tax_amount?: number | null;
    total_amount?: number | null;
    remittance_number?: string | null;
    taxes?: PurchaseAccountingTax[] | null;
  } | null,
  options: CurrencyFields = {}
): EventoNcCompra {
  const total = creditNote.amount;
  const purchaseTotal = linkedPurchase?.total_amount ?? 0;
  const purchaseTax = linkedPurchase?.tax_amount ?? 0;
  const purchaseTaxRatio = purchaseTotal > 0 ? total / purchaseTotal : 0;
  const splitTaxes = splitPurchaseTaxes(linkedPurchase?.taxes ?? undefined);
  const hasDetailedTaxes = Boolean(linkedPurchase?.taxes?.length);
  const inferredTax =
    purchaseTotal > 0 ? (total * Math.max(0, purchaseTax)) / purchaseTotal : 0;
  const tax = hasDetailedTaxes
    ? splitTaxes.montoIVA * purchaseTaxRatio
    : (creditNote.tax_amount ?? inferredTax);
  const montoIIBB = hasDetailedTaxes
    ? splitTaxes.montoIIBB * purchaseTaxRatio
    : 0;
  const montoNeto = total - tax - montoIIBB;
  const facturaNumero =
    creditNote.credit_note_number ??
    linkedPurchase?.remittance_number ??
    `NC-COMPRA-${creditNote.id.slice(0, 8)}`;

  return {
    tipoEvento: "NC_COMPRA",
    orgId: creditNote.organization_id,
    referenciaId: creditNote.purchase_order_id,
    referenciaTabla: "purchase_orders",
    fecha: creditNote.issue_date,
    descripcion: `Nota de credito compra ${facturaNumero}`,
    idempotencyKey: `NC_COMPRA_${creditNote.id}`,
    datos: {
      montoNeto: toAccountingStr(montoNeto),
      montoImpuestos: toAccountingStr(tax),
      montoIIBB: toAccountingStr(montoIIBB),
      totalFactura: toAccountingStr(total),
      proveedorId: creditNote.supplier_id,
      facturaNumero,
      ...buildCurrencyDatos(options),
    },
  };
}

export function buildCobro(
  payment: {
    id: string;
    organization_id: string;
    account_receivable_id?: string | null;
    amount: number;
    payment_method: AccountingPaymentMethodInput;
    payment_date: string;
    reference_number?: string | null;
  },
  receivable: {
    customer_id: string;
    sales_order_id?: string | null;
  },
  options: CurrencyFields & { bancoAccountCode?: string | null } = {}
): EventoCobro {
  const reference = payment.reference_number?.trim();

  return {
    tipoEvento: "COBRO",
    orgId: payment.organization_id,
    referenciaId: payment.id,
    referenciaTabla: "receivable_payments",
    fecha: payment.payment_date,
    descripcion: reference ? `Cobro ${reference}` : "Cobro",
    idempotencyKey: `COBRO_${payment.id}`,
    datos: {
      montoCobrado: toAccountingStr(payment.amount),
      metodoPago: normalizePaymentMethod(payment.payment_method),
      clienteId: receivable.customer_id,
      facturaId: receivable.sales_order_id ?? undefined,
      bancoAccountCode: options.bancoAccountCode ?? undefined,
      ...buildCurrencyDatos(options),
    },
  };
}

export function buildOrdenPago(
  payment: {
    id: string;
    organization_id: string;
    account_payable_id?: string | null;
    amount: number;
    payment_method: AccountingPaymentMethodInput;
    payment_date: string;
    reference_number?: string | null;
  },
  payable: {
    supplier_id: string;
    purchase_order_id?: string | null;
  },
  options: CurrencyFields & { bancoAccountCode?: string | null } = {}
): EventoOrdenPago {
  const reference = payment.reference_number?.trim();

  return {
    tipoEvento: "ORDEN_PAGO",
    orgId: payment.organization_id,
    referenciaId: payment.id,
    referenciaTabla: "payable_payments",
    fecha: payment.payment_date,
    descripcion: reference
      ? `Orden de pago ${reference}`
      : `Orden de pago ${payment.id}`,
    idempotencyKey: `ORDEN_PAGO_${payment.id}`,
    datos: {
      monto: toAccountingStr(payment.amount),
      metodoPago: normalizePaymentMethod(payment.payment_method),
      proveedorId: payable.supplier_id,
      facturaId: payable.purchase_order_id ?? undefined,
      bancoAccountCode: options.bancoAccountCode ?? undefined,
      ...buildCurrencyDatos(options),
    },
  };
}

// ------------------------------------------------------------
// buildFacturaVentaManual
// Construye el EventoFacturaVenta desde el sales_order.
// Implementación trivial: una sola línea con accountCode: null
// → el usuario asigna la cuenta manualmente en el modal.
// ------------------------------------------------------------
export function buildFacturaVentaManual(
  sale: {
    id: string;
    organization_id: string;
    customer_id: string;
    sale_date: string;
    expiration_date: string | null;
    invoice_number: string | null;
  },
  totals: { total: number; totalTaxAmount: number },
  options: {
    items?: LineaDesglosadaInput[];
    tipoFactura?: "MANUAL" | "REMITO" | "ANTICIPO";
  } = {}
): EventoFacturaVenta {
  const montoNeto = totals.total - totals.totalTaxAmount;
  const facturaNumero = sale.invoice_number ?? `VTA-${sale.id.slice(0, 8)}`;
  const lineasDesglosadas = options.items?.length
    ? buildLineasDesglosadas(options.items)
    : [
        {
          accountCode: null,
          montoNeto: toAccountingStr(montoNeto),
          montoImpuestos: toAccountingStr(totals.totalTaxAmount),
        },
      ];

  return {
    tipoEvento: "FACTURA_VENTA",
    orgId: sale.organization_id,
    referenciaId: sale.id,
    referenciaTabla: "sales_orders",
    fecha: sale.sale_date,
    descripcion: `Factura venta ${facturaNumero}`,
    idempotencyKey: `FACTURA_VENTA_${sale.id}`,
    datos: {
      tipoFactura: options.tipoFactura ?? "MANUAL",
      totalFactura: toAccountingStr(totals.total),
      montoNeto: toAccountingStr(montoNeto),
      montoImpuestos: toAccountingStr(totals.totalTaxAmount),
      condicionVenta: sale.expiration_date ? "CREDITO" : "CONTADO",
      clienteId: sale.customer_id,
      facturaNumero,
      lineasDesglosadas,
    },
  };
}

export function buildNcVenta(
  creditNote: {
    id: string;
    organization_id: string;
    customer_id: string;
    sales_order_id: string | null;
    credit_note_number: string | null;
    issue_date: string;
    amount: number;
  },
  linkedSale: {
    id: string;
    tipo_factura?: "MANUAL" | "REMITO" | "ANTICIPO" | null;
    total_amount?: number | null;
    total_tax_amount?: number | null;
  } | null,
  options: {
    items?: LineaDesglosadaInput[];
    totalTaxAmount?: number;
  } = {}
): EventoNcVenta {
  const total = creditNote.amount;
  const saleTotal = linkedSale?.total_amount ?? 0;
  const saleTax = linkedSale?.total_tax_amount ?? 0;
  const inferredTax =
    saleTotal > 0 ? (total * Math.max(0, saleTax)) / saleTotal : 0;
  const montoImpuestos = options.totalTaxAmount ?? inferredTax;
  const montoNeto = total - montoImpuestos;
  const lineasDesglosadas = options.items?.length
    ? buildLineasDesglosadas(options.items)
    : [
        {
          accountCode: null,
          montoNeto: toAccountingStr(montoNeto),
          montoImpuestos: toAccountingStr(montoImpuestos),
        },
      ];
  const creditNoteNumber =
    creditNote.credit_note_number ?? `NC-${creditNote.id.slice(0, 8)}`;

  return {
    tipoEvento: "NC_VENTA",
    orgId: creditNote.organization_id,
    referenciaId: creditNote.id,
    referenciaTabla: "credit_notes",
    fecha: creditNote.issue_date,
    descripcion: `Nota de credito venta ${creditNoteNumber}`,
    idempotencyKey: `NC_VENTA_${creditNote.id}`,
    datos: {
      tipoFactura: linkedSale?.tipo_factura ?? "MANUAL",
      totalFactura: toAccountingStr(total),
      montoNeto: toAccountingStr(montoNeto),
      montoImpuestos: toAccountingStr(montoImpuestos),
      clienteId: creditNote.customer_id,
      ventaId: creditNote.sales_order_id ?? undefined,
      lineasDesglosadas,
    },
  };
}

export function buildNdVenta(debitNote: {
  id: string;
  organizationId: string;
  customerId: string;
  salesOrderId: string;
  debitNoteNumber: string;
  issueDate: string;
  amount: number;
  items: Array<{
    netAmount: number;
    taxAmount: number;
    taxes: Array<{
      name: string;
      taxAmount: number;
      taxCodeSnapshot?: string | null;
    }>;
  }>;
}): EventoNdVenta {
  const lineasDesglosadas = buildLineasDesglosadas(
    debitNote.items.map((item) => ({
      accountCode: null,
      montoNeto: item.netAmount,
      montoImpuestos: item.taxAmount,
      impuestos: item.taxes.map((tax) => ({
        monto: tax.taxAmount,
        taxCode: tax.taxCodeSnapshot ?? null,
        nombre: tax.name,
        accountCode: tax.taxCodeSnapshot
          ?.trim()
          .toUpperCase()
          .startsWith("TRIBUTO_")
          ? "TRIBUTOS_A_PAGAR"
          : null,
      })),
    }))
  );
  const montoImpuestos = debitNote.items.reduce(
    (total, item) => total + item.taxAmount,
    0
  );
  const montoNeto = debitNote.amount - montoImpuestos;

  return {
    tipoEvento: "ND_VENTA",
    orgId: debitNote.organizationId,
    referenciaId: debitNote.id,
    referenciaTabla: "debit_notes",
    fecha: debitNote.issueDate,
    descripcion: `Nota de debito venta ${debitNote.debitNoteNumber}`,
    idempotencyKey: `ND_VENTA_${debitNote.id}`,
    datos: {
      totalFactura: toAccountingStr(debitNote.amount),
      montoNeto: toAccountingStr(montoNeto),
      montoImpuestos: toAccountingStr(montoImpuestos),
      clienteId: debitNote.customerId,
      ventaId: debitNote.salesOrderId,
      lineasDesglosadas,
    },
  };
}

// ------------------------------------------------------------
// Tipos de respuesta para los libros
// ------------------------------------------------------------

export type DiarioRow = {
  numero: number;
  fecha: string;
  tipo_evento: string | null;
  descripcion: string | null;
  cuenta_nombre: string | null;
  cuenta_codigo: string | null;
  debe: string;
  haber: string;
  journal_entry_id: string;
  linea_id: string;
};

export type DiarioResult = {
  rows: DiarioRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type MayorRow = {
  fecha: string;
  tipo_evento: string | null;
  descripcion: string | null;
  debe: string;
  haber: string;
  saldo_acumulado: string;
  journal_entry_id: string;
  linea_id: string;
};

export type MayorResult = {
  cuenta_id: string;
  cuenta_nombre: string;
  cuenta_codigo: string | null;
  saldo_inicial: string;
  rows: MayorRow[];
};

export type IVARow = {
  fecha: string;
  tipo_evento: string | null;
  referencia: string | null;
  neto_gravado: string;
  iva: string;
  total: string;
  journal_entry_id: string;
};

export type IVAResult = {
  tipo: "ventas" | "compras";
  rows: IVARow[];
};

export type IIBBRow = {
  fecha: string;
  tipo_evento: string | null;
  descripcion: string | null;
  base_imponible: string;
  iibb: string;
  journal_entry_id: string;
};

export type IIBBResult = {
  rows: IIBBRow[];
};

export type CuentaItem = {
  id: string;
  codigo: string;
  nombre: string;
  account_code: string | null;
  tipo: string;
  naturaleza: string;
  activa: boolean;
  permite_movimientos: boolean;
  padre_id: string | null;
  moneda: string;
};

// ------------------------------------------------------------
// fetchLibroDiario
// ------------------------------------------------------------
export async function fetchLibroDiario(params: {
  orgId: string;
  desde: string;
  hasta: string;
  page?: number;
  pageSize?: number;
  cuentaId?: string;
  tipoEvento?: string;
}): Promise<DiarioResult> {
  const query = new URLSearchParams({
    org_id: params.orgId,
    desde: params.desde,
    hasta: params.hasta,
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 50),
  });
  if (params.cuentaId) {
    query.set("cuenta_id", params.cuentaId);
  }
  if (params.tipoEvento) {
    query.set("tipo_evento", params.tipoEvento);
  }

  const res = await fetchWithTimeout(
    `${BASE_URL}/diario?${query}`,
    withOrgSlugHeader({ method: "GET" })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Diario falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: DiarioResult }).data;
}

// ------------------------------------------------------------
// fetchLibroMayor
// ------------------------------------------------------------
export async function fetchLibroMayor(
  cuentaId: string,
  params: { orgId: string; desde: string; hasta: string }
): Promise<MayorResult> {
  const query = new URLSearchParams({
    org_id: params.orgId,
    desde: params.desde,
    hasta: params.hasta,
  });
  const res = await fetchWithTimeout(
    `${BASE_URL}/mayor/${cuentaId}?${query}`,
    withOrgSlugHeader({ method: "GET" })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Mayor falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: MayorResult }).data;
}

// ------------------------------------------------------------
// fetchLibroIVA
// ------------------------------------------------------------
export async function fetchLibroIVA(params: {
  orgId: string;
  desde: string;
  hasta: string;
  tipo: "ventas" | "compras";
}): Promise<IVAResult> {
  const query = new URLSearchParams({
    org_id: params.orgId,
    desde: params.desde,
    hasta: params.hasta,
    tipo: params.tipo,
  });
  const res = await fetchWithTimeout(
    `${BASE_URL}/libros/iva?${query}`,
    withOrgSlugHeader({ method: "GET" })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `IVA falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: IVAResult }).data;
}

// ------------------------------------------------------------
// fetchLibroIIBB
// ------------------------------------------------------------
export async function fetchLibroIIBB(params: {
  orgId: string;
  desde: string;
  hasta: string;
}): Promise<IIBBResult> {
  const query = new URLSearchParams({
    org_id: params.orgId,
    desde: params.desde,
    hasta: params.hasta,
  });
  const res = await fetchWithTimeout(
    `${BASE_URL}/libros/iibb?${query}`,
    withOrgSlugHeader({ method: "GET" })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `IIBB falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: IIBBResult }).data;
}

// ------------------------------------------------------------
// fetchCuentas
// ------------------------------------------------------------
export async function fetchCuentas(orgId: string): Promise<CuentaItem[]> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/cuentas?org_id=${orgId}`,
    withOrgSlugHeader({ method: "GET" })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Cuentas falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: CuentaItem[] }).data;
}

// ------------------------------------------------------------
// fetchReglas
// ------------------------------------------------------------
export type RuleLineItem = {
  id: string;
  rule_id: string;
  lado: "DEBE" | "HABER";
  account_code: string | null;
  cuenta_id: string | null;
  formula: string;
  fija: boolean;
  orden: number;
};

export type ReglaItem = {
  id: string;
  org_id: string;
  tipo_evento: string;
  condicion: string | Record<string, unknown> | null;
  prioridad: number;
  activa: boolean;
  descripcion: string | null;
  lines: RuleLineItem[];
};

export async function fetchReglas(orgId: string): Promise<ReglaItem[]> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/cuentas/reglas?org_id=${orgId}`,
    withOrgSlugHeader({ method: "GET" })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Reglas falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: ReglaItem[] }).data;
}

// ============================================================
// Plan de Cuentas — CRUD
// ============================================================

export type CreateCuentaInput = {
  orgId: string;
  codigo: string;
  nombre: string;
  accountCode?: string;
  tipo: "ACTIVO" | "PASIVO" | "PN" | "INGRESO" | "EGRESO";
  naturaleza: "DEUDORA" | "ACREEDORA";
  permiteMovimientos: boolean;
  activa?: boolean;
  padreId?: string;
  moneda?: "ARS" | "USD" | "AMBAS";
};

export type UpdateCuentaInput = Partial<Omit<CreateCuentaInput, "orgId">>;

export async function fetchCuenta(
  id: string,
  orgId: string
): Promise<CuentaItem & { padre: CuentaItem | null }> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/cuentas/${id}?org_id=${orgId}`,
    withOrgSlugHeader({ method: "GET" })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Cuenta falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: CuentaItem & { padre: CuentaItem | null } }).data;
}

export type CuentaTreeNode = CuentaItem & { children: CuentaTreeNode[] };

export async function fetchCuentasArbol(
  orgId: string
): Promise<CuentaTreeNode[]> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/cuentas/arbol?org_id=${orgId}`,
    withOrgSlugHeader({ method: "GET" })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Plan de cuentas falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: CuentaTreeNode[] }).data;
}

export async function createCuenta(
  input: CreateCuentaInput
): Promise<CuentaItem> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/cuentas`,
    withOrgSlugHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId: input.orgId,
        codigo: input.codigo,
        nombre: input.nombre,
        accountCode: input.accountCode,
        tipo: input.tipo,
        naturaleza: input.naturaleza,
        permiteMovimientos: input.permiteMovimientos,
        activa: input.activa ?? true,
        padreId: input.padreId,
        moneda: input.moneda ?? "ARS",
      }),
    })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Crear cuenta falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: CuentaItem }).data;
}

export async function updateCuenta(
  id: string,
  input: UpdateCuentaInput
): Promise<CuentaItem> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/cuentas/${id}`,
    withOrgSlugHeader({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Actualizar cuenta falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: CuentaItem }).data;
}

export async function toggleCuentaEstado(
  id: string,
  activa: boolean
): Promise<CuentaItem> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/cuentas/${id}/estado`,
    withOrgSlugHeader({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa }),
    })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Toggle cuenta falló: ${res.status}`
    );
  }
  const json = await res.json();
  return (json as { data: CuentaItem }).data;
}

// ============================================================
// Tesorería — tipos y wrappers fetch (client-side, vía proxy)
// ============================================================

export type TreasuryMovementTipo =
  | "DEBITO_BANCARIO"
  | "CREDITO_BANCARIO"
  | "CHEQUE_RECIBIDO_RECHAZADO"
  | "CHEQUE_PROPIO_RECHAZADO"
  | "DEPOSITO_CHEQUES"
  | "DEPOSITO_EFECTIVO"
  | "DEBITO_CHEQUE_PROPIO";

export type ReceivedCheckEstado =
  | "EN_CARTERA"
  | "DEPOSITADO"
  | "RECHAZADO"
  | "ANULADO";
export type IssuedCheckEstado =
  | "EMITIDO"
  | "DEBITADO"
  | "RECHAZADO"
  | "ANULADO";
export type DepositSlipTipo = "CHEQUES" | "EFECTIVO";
export type DepositSlipEstado = "CONFIRMADA" | "ANULADA";

export type TreasuryBankAccount = {
  id: string;
  org_id: string;
  nombre: string;
  banco: string;
  numero_cuenta: string | null;
  alias: string | null;
  moneda: "ARS" | "USD";
  saldo_operativo: string;
  activa: boolean;
  cuenta_contable_id: string;
  descripcion: string | null;
  creado_at: string;
  actualizado_at: string;
};

export type TreasuryMovement = {
  id: string;
  org_id: string;
  cuenta_bancaria_id: string;
  tipo: TreasuryMovementTipo;
  fecha: string;
  descripcion: string;
  importe: string;
  lado: "DEBE" | "HABER";
  journal_entry_id: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  estado: "ACTIVO" | "ANULADO";
  creado_por: string | null;
  creado_at: string;
};

export type ReceivedCheck = {
  id: string;
  org_id: string;
  numero_cheque: string;
  banco_emisor: string;
  importe: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  tipo: "CDF" | "ECH";
  librador: string | null;
  librador_id: string | null;
  notas: string | null;
  estado: ReceivedCheckEstado;
  deposit_slip_id: string | null;
  journal_entry_id: string | null;
  creado_por: string | null;
  creado_at: string;
  actualizado_at: string;
};

export type IssuedCheck = {
  id: string;
  org_id: string;
  cuenta_bancaria_id: string;
  numero_cheque: string;
  importe: string;
  fecha_emision: string;
  fecha_debito: string;
  beneficiario: string;
  tipo: "CDF" | "ECH";
  beneficiario_id: string | null;
  notas: string | null;
  estado: IssuedCheckEstado;
  referencia_pago_id: string | null;
  referencia_pago_tabla: string | null;
  journal_entry_id: string | null;
  creado_por: string | null;
  creado_at: string;
  actualizado_at: string;
};

export type TreasuryDepositSlip = {
  id: string;
  org_id: string;
  cuenta_bancaria_id: string;
  tipo: DepositSlipTipo;
  fecha: string;
  importe_total: string;
  descripcion: string;
  cuenta_caja_code: string | null;
  journal_entry_id: string | null;
  estado: DepositSlipEstado;
  creado_por: string | null;
  creado_at: string;
};

// ── Input types ───────────────────────────────────────────────────────────────

export type CreateBankAccountInput = {
  orgId: string;
  nombre: string;
  banco: string;
  moneda: "ARS" | "USD";
  cuentaContableId: string;
  numerosCuenta?: string;
  alias?: string;
  descripcion?: string;
};

export type UpdateBankAccountInput = {
  nombre?: string;
  banco?: string;
  moneda?: "ARS" | "USD";
  cuentaContableId?: string;
  numerosCuenta?: string | null;
  alias?: string | null;
  descripcion?: string | null;
};

export type CreateMovimientoBancarioInput = {
  orgId: string;
  operationId?: string;
  cuentaBancariaId: string;
  tipo: "DEBITO_BANCARIO" | "CREDITO_BANCARIO";
  fecha: string;
  descripcion: string;
  importe: string;
  cuentaContrapartidaCode: string;
};

export type CreateReceivedCheckInput = {
  orgId: string;
  operationId?: string;
  numeroCheque: string;
  bancoEmisor: string;
  importe: string;
  fechaEmision: string;
  fechaVencimiento: string;
  tipo?: "CDF" | "ECH";
  librador?: string;
  libradorId?: string;
  notas?: string;
};

export type CreateIssuedCheckInput = {
  orgId: string;
  operationId?: string;
  cuentaBancariaId: string;
  numeroCheque: string;
  importe: string;
  fechaEmision: string;
  fechaDebito: string;
  beneficiario: string;
  tipo?: "CDF" | "ECH";
  beneficiarioId?: string;
  notas?: string;
  referenciaPagoId?: string;
  referenciaPagoTabla?: string;
};

export type CreateCheckDepositSlipInput = {
  orgId: string;
  operationId?: string;
  cuentaBancariaId: string;
  fecha: string;
  descripcion: string;
  checkIds: string[];
};

export type CreateCashDepositSlipInput = {
  orgId: string;
  operationId?: string;
  cuentaBancariaId: string;
  fecha: string;
  descripcion: string;
  importe: string;
  cuentaCajaCode: string;
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function treasuryGet<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/tesoreria/${path}`,
    withOrgSlugHeader({ method: "GET" })
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Tesorería falló: ${res.status}`
    );
  }
  return ((await res.json()) as { data: T }).data;
}

async function _treasuryPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/tesoreria/${path}`,
    withOrgSlugHeader({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: string }).error ?? `Tesorería falló: ${res.status}`
    );
  }
  return ((await res.json()) as { data: T }).data;
}

async function _treasuryPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/tesoreria/${path}`,
    withOrgSlugHeader({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: string }).error ?? `Tesorería falló: ${res.status}`
    );
  }
  return ((await res.json()) as { data: T }).data;
}

async function _treasuryPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/tesoreria/${path}`,
    withOrgSlugHeader({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: string }).error ?? `Tesorería falló: ${res.status}`
    );
  }
  return ((await res.json()) as { data: T }).data;
}

// ── Cuentas Bancarias ─────────────────────────────────────────────────────────

export function fetchCuentasBancarias(
  orgId: string,
  soloActivas?: boolean
): Promise<TreasuryBankAccount[]> {
  const q = new URLSearchParams({ org_id: orgId });
  if (soloActivas) {
    q.set("solo_activas", "true");
  }
  return treasuryGet(`cuentas-bancarias?${q}`);
}

export function fetchCuentaBancaria(
  id: string,
  orgId: string
): Promise<TreasuryBankAccount> {
  return treasuryGet(`cuentas-bancarias/${id}?org_id=${orgId}`);
}

// ── Movimientos ───────────────────────────────────────────────────────────────

export function fetchMovimientos(params: {
  orgId: string;
  cuentaId?: string;
  desde?: string;
  hasta?: string;
  tipo?: TreasuryMovementTipo;
}): Promise<TreasuryMovement[]> {
  const q = new URLSearchParams({ org_id: params.orgId });
  if (params.cuentaId) {
    q.set("cuenta_id", params.cuentaId);
  }
  if (params.desde) {
    q.set("desde", params.desde);
  }
  if (params.hasta) {
    q.set("hasta", params.hasta);
  }
  if (params.tipo) {
    q.set("tipo", params.tipo);
  }
  return treasuryGet(`movimientos?${q}`);
}

// ── Cheques recibidos ─────────────────────────────────────────────────────────

export function fetchChequesRecibidos(
  orgId: string,
  estado?: ReceivedCheckEstado
): Promise<ReceivedCheck[]> {
  const q = new URLSearchParams({ org_id: orgId });
  if (estado) {
    q.set("estado", estado);
  }
  return treasuryGet(`cheques/recibidos?${q}`);
}

export function fetchChequeRecibido(
  id: string,
  orgId: string
): Promise<ReceivedCheck> {
  return treasuryGet(`cheques/recibidos/${id}?org_id=${orgId}`);
}

// ── Cheques emitidos ──────────────────────────────────────────────────────────

export function fetchChequesEmitidos(
  orgId: string,
  estado?: IssuedCheckEstado
): Promise<IssuedCheck[]> {
  const q = new URLSearchParams({ org_id: orgId });
  if (estado) {
    q.set("estado", estado);
  }
  return treasuryGet(`cheques/emitidos?${q}`);
}

export function fetchChequeEmitido(
  id: string,
  orgId: string
): Promise<IssuedCheck> {
  return treasuryGet(`cheques/emitidos/${id}?org_id=${orgId}`);
}

// ── Boletas ───────────────────────────────────────────────────────────────────

export function fetchBoletas(
  orgId: string,
  cuentaId?: string
): Promise<TreasuryDepositSlip[]> {
  const q = new URLSearchParams({ org_id: orgId });
  if (cuentaId) {
    q.set("cuenta_id", cuentaId);
  }
  return treasuryGet(`boletas?${q}`);
}
