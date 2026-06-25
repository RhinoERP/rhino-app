import type {
  AnyEvento,
  EventoCobro,
  EventoFacturaCompra,
  EventoFacturaVenta,
  EventoNcCompra,
  EventoNcVenta,
  EventoOrdenPago,
  InformalEntry,
  PreviewResponse,
} from "@/modules/accounting/types";

const BASE_URL = "/api/contabilidad";
const TIMEOUT_MS = 10_000;

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
  const res = await fetchWithTimeout(`${BASE_URL}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(evento),
  });

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
  const res = await fetchWithTimeout(`${BASE_URL}/eventos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

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

export async function createInformalEntry(
  evento: AnyEvento,
  sourceType: "NOTA_DE_VENTA" | "FACTURA_PENDIENTE",
  options: AccountingEventSubmitOptions = {}
): Promise<string> {
  const res = await fetchWithTimeout(`${BASE_URL}/eventos/informal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...evento,
      source_type: sourceType,
      lineasEditadas: options.lineasEditadas ?? [],
      lineasManuales: options.lineasManuales ?? [],
    }),
  });

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
  informalEntryId: string
): Promise<string> {
  const res = await fetchWithTimeout(
    `${BASE_URL}/informal-entries/${informalEntryId}/formalizar`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
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

export async function fetchInformalEntries(params: {
  orgId: string;
  estadoFormalizacion?: "PENDIENTE" | "FORMALIZADO" | "CANCELADO";
  sourceType?: "NOTA_DE_VENTA" | "FACTURA_PENDIENTE";
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

  const res = await fetchWithTimeout(`${BASE_URL}/informal-entries?${query}`, {
    method: "GET",
  });

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
};

export type LineaDesglosada = {
  accountCode: string | null;
  montoNeto: string;
  montoImpuestos?: string;
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
    { accountCode: string | null; montoNeto: number; montoImpuestos: number }
  >();

  for (const item of items) {
    const key = item.accountCode ?? "__SIN_CUENTA__";
    const current = grouped.get(key) ?? {
      accountCode: item.accountCode,
      montoNeto: 0,
      montoImpuestos: 0,
    };

    current.montoNeto += item.montoNeto;
    current.montoImpuestos += item.montoImpuestos;
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
    }));
}

// ------------------------------------------------------------
// buildFacturaCompra
// Construye el EventoFacturaCompra desde el purchaseOrder
// retornado por createPurchaseOrder (la row de Supabase).
// montoNeto = total_amount - tax_amount (base imponible efectiva)
// ------------------------------------------------------------
export function buildFacturaCompra(purchaseOrder: {
  id: string;
  organization_id: string;
  supplier_id: string;
  purchase_date: string;
  expiration_date: string | null;
  subtotal_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  remittance_number: string | null;
}): EventoFacturaCompra {
  const total = purchaseOrder.total_amount ?? 0;
  const tax = purchaseOrder.tax_amount ?? 0;
  const montoNeto = total - tax;
  const facturaNumero =
    purchaseOrder.remittance_number ?? `PO-${purchaseOrder.id}`;

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
      montoImpuestos: toAccountingStr(tax),
      totalFactura: toAccountingStr(total),
      condicionCompra: purchaseOrder.expiration_date ? "CREDITO" : "CONTADO",
      proveedorId: purchaseOrder.supplier_id,
      facturaNumero,
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
  } | null,
  options: CurrencyFields = {}
): EventoNcCompra {
  const total = creditNote.amount;
  const purchaseTotal = linkedPurchase?.total_amount ?? 0;
  const purchaseTax = linkedPurchase?.tax_amount ?? 0;
  const inferredTax =
    purchaseTotal > 0 ? (total * Math.max(0, purchaseTax)) / purchaseTotal : 0;
  const tax = creditNote.tax_amount ?? inferredTax;
  const montoNeto = total - tax;
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
    descripcion: reference ? `Cobro ${reference}` : `Cobro ${payment.id}`,
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

// ------------------------------------------------------------
// Tipos de respuesta para los libros
// ------------------------------------------------------------

export type DiarioRow = {
  numero: number;
  fecha: string;
  tipo_evento: string | null;
  descripcion: string | null;
  referencia: string | null;
  cuenta_nombre: string | null;
  cuenta_codigo: string | null;
  debe: string;
  haber: string;
  estado_imputacion: string;
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

  const res = await fetchWithTimeout(`${BASE_URL}/diario?${query}`, {
    method: "GET",
  });
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
  const res = await fetchWithTimeout(`${BASE_URL}/mayor/${cuentaId}?${query}`, {
    method: "GET",
  });
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
  const res = await fetchWithTimeout(`${BASE_URL}/libros/iva?${query}`, {
    method: "GET",
  });
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
  const res = await fetchWithTimeout(`${BASE_URL}/libros/iibb?${query}`, {
    method: "GET",
  });
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
  const res = await fetchWithTimeout(`${BASE_URL}/cuentas?org_id=${orgId}`, {
    method: "GET",
  });
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
    { method: "GET" }
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
