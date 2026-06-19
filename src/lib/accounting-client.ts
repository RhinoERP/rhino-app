import type {
  AnyEvento,
  EventoFacturaCompra,
  EventoFacturaVenta,
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

// ------------------------------------------------------------
// confirmAccountingEvent
// Llama POST /api/contabilidad/eventos — crea el asiento.
// lineasAsignadas: sobreescribe cuentas seleccionables/suspenso.
// ------------------------------------------------------------
export async function confirmAccountingEvent(
  evento: AnyEvento,
  lineasAsignadas: Array<{ index: number; cuentaId: string }> = []
): Promise<string> {
  const body = { ...evento, lineasAsignadas };
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

// ------------------------------------------------------------
// Helpers para construir payloads desde el monolito
// ------------------------------------------------------------

/** Convierte number a string con 4 decimales para el servicio contable */
export function toAccountingStr(n: number): string {
  return n.toFixed(4);
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
  totals: { total: number; totalTaxAmount: number }
): EventoFacturaVenta {
  const montoNeto = totals.total - totals.totalTaxAmount;
  const facturaNumero = sale.invoice_number ?? `VTA-${sale.id.slice(0, 8)}`;
  return {
    tipoEvento: "FACTURA_VENTA",
    orgId: sale.organization_id,
    referenciaId: sale.id,
    referenciaTabla: "sales_orders",
    fecha: sale.sale_date,
    descripcion: `Factura venta ${facturaNumero}`,
    idempotencyKey: `FACTURA_VENTA_${sale.id}`,
    datos: {
      tipoFactura: "MANUAL",
      totalFactura: toAccountingStr(totals.total),
      montoNeto: toAccountingStr(montoNeto),
      montoImpuestos: toAccountingStr(totals.totalTaxAmount),
      condicionVenta: sale.expiration_date ? "CREDITO" : "CONTADO",
      clienteId: sale.customer_id,
      facturaNumero,
      lineasDesglosadas: [
        {
          accountCode: null,
          montoNeto: toAccountingStr(montoNeto),
          montoImpuestos: toAccountingStr(totals.totalTaxAmount),
        },
      ],
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
