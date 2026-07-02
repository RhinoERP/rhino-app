// Client-side types for the accounting module.
// Mirror of the service's rules.types.ts / journal types — no dependency on the service package.

export type ResolvedLine = {
  lado: "DEBE" | "HABER";
  monto: string;
  cuentaId: string | null;
  cuentaCodigo: string | null; // account_code semantico (ej: "AR_CLIENTES")
  cuentaCodigoInterno: string | null; // codigo del plan de cuentas (ej: "1.1.01")
  cuentaNombre: string | null; // nombre de la cuenta (ej: "Clientes")
  esSeleccionable: boolean;
  opcionesCuenta: Array<{ accountCode: string; label: string }> | null;
  pendienteImputacion: boolean;
};

export type PreviewResponse = {
  estadoImputacion: "COMPLETO" | "SUSPENSO";
  lineas: ResolvedLine[];
  debeTotal: string;
  haberTotal: string;
};

export type JournalEntryLine = {
  id: string;
  journal_entry_id: string;
  cuenta_id: string | null;
  debe: string;
  haber: string;
  descripcion: string | null;
  pendiente_imputacion: boolean;
};

export type JournalEntryWithLines = {
  id: string;
  org_id: string;
  numero: number;
  fecha: string;
  descripcion: string | null;
  tipo_evento: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  estado: "ACTIVO" | "ANULADO";
  estado_imputacion: "COMPLETO" | "SUSPENSO";
  idempotency_key: string;
  creado_por: string | null;
  creado_at: string;
  lineas: JournalEntryLine[];
};

export type InformalEntry = {
  id: string;
  org_id: string;
  numero?: number | null;
  fecha: string;
  descripcion: string | null;
  tipo_evento: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  estado: "ACTIVO" | "ANULADO";
  estado_imputacion: "COMPLETO" | "SUSPENSO";
  idempotency_key: string;
  creado_por: string | null;
  creado_at: string;
  source_type:
    | "NOTA_DE_VENTA"
    | "FACTURA_PENDIENTE"
    | "COMPRA"
    | "NOTA_DE_CREDITO"
    | "COBRO"
    | "ORDEN_PAGO";
  estado_formalizacion: "PENDIENTE" | "CANCELADO" | "ASENTADO";
  formalized_journal_entry_id: string | null;
};

export type InformalEntryLine = {
  id: string;
  informal_entry_id: string;
  cuenta_id: string | null;
  debe: string;
  haber: string;
  descripcion: string | null;
  pendiente_imputacion: boolean;
};

export type InformalEntryWithLines = InformalEntry & {
  lineas: InformalEntryLine[];
};

export type InformalEntrySourceType = InformalEntry["source_type"];
export type InformalEntryFormalizationStatus =
  InformalEntry["estado_formalizacion"];

// Payload types sent to the service
export type EventoBase = {
  orgId: string;
  referenciaId: string;
  referenciaTabla: string;
  fecha: string;
  descripcion: string;
  idempotencyKey: string;
};

export interface EventoFacturaVenta extends EventoBase {
  tipoEvento: "FACTURA_VENTA";
  referenciaTabla: "sales_orders";
  datos: {
    tipoFactura: "MANUAL" | "REMITO" | "ANTICIPO";
    totalFactura: string;
    montoNeto?: string;
    montoImpuestos?: string;
    condicionVenta: "CONTADO" | "CREDITO";
    clienteId: string;
    facturaNumero: string;
    lineasDesglosadas?: Array<{
      accountCode: string | null;
      montoNeto: string;
      montoImpuestos?: string;
      impuestos?: Array<{
        monto: string;
        accountCode?: string | null;
        taxCode?: string | null;
        nombre?: string | null;
      }>;
    }>;
    moneda?: "ARS" | "USD";
    tipoCambio?: string;
    montoUSD?: string;
  };
}

export interface EventoFacturaCompra extends EventoBase {
  tipoEvento: "FACTURA_COMPRA";
  referenciaTabla: "purchase_orders";
  datos: {
    montoNeto: string;
    montoImpuestos: string;
    totalFactura: string;
    condicionCompra: "CONTADO" | "CREDITO";
    proveedorId: string;
    facturaNumero: string;
    montoIIBB?: string;
    lineasDesglosadas?: Array<{
      accountCode: string | null;
      montoNeto: string;
      montoImpuestos?: string;
      impuestos?: Array<{
        monto: string;
        accountCode?: string | null;
        taxCode?: string | null;
        nombre?: string | null;
      }>;
    }>;
    moneda?: "ARS" | "USD";
    tipoCambio?: string;
    montoUSD?: string;
  };
}

export interface EventoNcVenta extends EventoBase {
  tipoEvento: "NC_VENTA";
  referenciaTabla: "credit_notes";
  datos: {
    tipoFactura: "MANUAL" | "REMITO" | "ANTICIPO";
    totalFactura: string;
    montoNeto?: string;
    montoImpuestos?: string;
    clienteId: string;
    ventaId?: string;
    lineasDesglosadas?: Array<{
      accountCode: string | null;
      montoNeto: string;
      montoImpuestos?: string;
      impuestos?: Array<{
        monto: string;
        accountCode?: string | null;
        taxCode?: string | null;
        nombre?: string | null;
      }>;
    }>;
    moneda?: "ARS" | "USD";
    tipoCambio?: string;
    montoUSD?: string;
  };
}

export interface EventoNcCompra extends EventoBase {
  tipoEvento: "NC_COMPRA";
  referenciaTabla: "purchase_orders";
  datos: {
    montoNeto: string;
    montoImpuestos: string;
    totalFactura: string;
    proveedorId: string;
    facturaNumero: string;
    montoIIBB?: string;
    moneda?: "ARS" | "USD";
    tipoCambio?: string;
    montoUSD?: string;
  };
}

export interface EventoCobro extends EventoBase {
  tipoEvento: "COBRO";
  referenciaTabla: "receivable_payments";
  datos: {
    montoCobrado: string;
    metodoPago: "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "E-CHEQ";
    clienteId: string;
    facturaId?: string;
    bancoAccountCode?: string;
    moneda?: "ARS" | "USD";
    tipoCambio?: string;
    montoUSD?: string;
  };
}

export interface EventoOrdenPago extends EventoBase {
  tipoEvento: "ORDEN_PAGO";
  referenciaTabla: "payable_payments";
  datos: {
    monto: string;
    metodoPago: "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "E-CHEQ";
    proveedorId: string;
    facturaId?: string;
    bancoAccountCode?: string;
    moneda?: "ARS" | "USD";
    tipoCambio?: string;
    montoUSD?: string;
  };
}

export interface EventoAsientoManual extends EventoBase {
  tipoEvento: "ASIENTO_MANUAL";
  referenciaTabla: "manual";
  datos: {
    usuarioId?: string;
    referenciaLibre?: string;
    moneda?: "ARS" | "USD";
    tipoCambio?: string;
    montoUSD?: string;
  };
}

export type AnyEvento =
  | EventoFacturaVenta
  | EventoFacturaCompra
  | EventoNcVenta
  | EventoNcCompra
  | EventoCobro
  | EventoOrdenPago
  | EventoAsientoManual;
