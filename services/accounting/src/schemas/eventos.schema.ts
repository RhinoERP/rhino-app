import { z } from "zod";

// Regex para strings numéricos con hasta 4 decimales
// Acepta: "1210.0000", "0", "210.50", "-50.0000" (para ajustes)
const montoStr = z
  .string()
  .regex(
    /^-?\d+(\.\d{1,4})?$/,
    'Monto debe ser un string numérico (ej: "1210.0000")'
  );

// Schema de línea desglosada (facturas manuales y remitos)
const lineaImpuestoSchema = z.object({
  monto: montoStr,
  accountCode: z.string().nullable().optional(),
  taxCode: z.string().nullable().optional(),
  nombre: z.string().nullable().optional(),
});

const lineaDesglosadaSchema = z.object({
  accountCode: z.string().nullable(),
  montoNeto: montoStr,
  montoImpuestos: montoStr.optional(),
  impuestos: z.array(lineaImpuestoSchema).optional(),
});

// Campos USD opcionales — presentes en todos los schemas
const usdFields = {
  moneda: z.enum(["ARS", "USD"]).optional(),
  tipoCambio: montoStr.optional(),
  montoUSD: montoStr.optional(),
};

// ------------------------------------------------------------
// Evento base — campos comunes a todos los eventos
// ------------------------------------------------------------
const EventoBaseSchema = z.object({
  orgId: z.string().uuid(),
  referenciaId: z.string().uuid(),
  referenciaTabla: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD"),
  descripcion: z.string().min(1).max(500),
  idempotencyKey: z.string().min(1).max(200),
});

// ------------------------------------------------------------
// FACTURA_VENTA
// ------------------------------------------------------------
export const EventoFacturaVentaSchema = EventoBaseSchema.extend({
  tipoEvento: z.literal("FACTURA_VENTA"),
  referenciaTabla: z.literal("sales_orders"),
  datos: z.object({
    tipoFactura: z.enum(["MANUAL", "REMITO", "ANTICIPO"]),
    totalFactura: montoStr,
    montoNeto: montoStr.optional(),
    montoImpuestos: montoStr.optional(),
    condicionVenta: z.enum(["CONTADO", "CREDITO"]),
    clienteId: z.string().uuid(),
    facturaNumero: z.string(),
    lineasDesglosadas: z.array(lineaDesglosadaSchema).optional(),
    ...usdFields,
  }),
});

export type EventoFacturaVenta = z.infer<typeof EventoFacturaVentaSchema>;

// ------------------------------------------------------------
// FACTURA_COMPRA
// ------------------------------------------------------------
export const EventoFacturaCompraSchema = EventoBaseSchema.extend({
  tipoEvento: z.literal("FACTURA_COMPRA"),
  referenciaTabla: z.literal("purchase_orders"),
  datos: z.object({
    montoNeto: montoStr,
    montoImpuestos: montoStr,
    totalFactura: montoStr,
    condicionCompra: z.enum(["CONTADO", "CREDITO"]),
    proveedorId: z.string().uuid(),
    facturaNumero: z.string(),
    montoIIBB: montoStr.optional(),
    ...usdFields,
  }),
});

export type EventoFacturaCompra = z.infer<typeof EventoFacturaCompraSchema>;

// ------------------------------------------------------------
// NC_VENTA
// ------------------------------------------------------------
export const EventoNcVentaSchema = EventoBaseSchema.extend({
  tipoEvento: z.literal("NC_VENTA"),
  referenciaTabla: z.literal("credit_notes"),
  datos: z.object({
    tipoFactura: z.enum(["MANUAL", "REMITO", "ANTICIPO"]),
    totalFactura: montoStr,
    montoNeto: montoStr.optional(),
    montoImpuestos: montoStr.optional(),
    clienteId: z.string().uuid(),
    ventaId: z.string().uuid().optional(),
    lineasDesglosadas: z.array(lineaDesglosadaSchema).optional(),
    ...usdFields,
  }),
});

export type EventoNcVenta = z.infer<typeof EventoNcVentaSchema>;

// ------------------------------------------------------------
// ND_VENTA
// ------------------------------------------------------------
export const EventoNdVentaSchema = EventoBaseSchema.extend({
  tipoEvento: z.literal("ND_VENTA"),
  referenciaTabla: z.literal("debit_notes"),
  datos: z.object({
    totalFactura: montoStr,
    montoNeto: montoStr.optional(),
    montoImpuestos: montoStr.optional(),
    clienteId: z.string().uuid(),
    ventaId: z.string().uuid().optional(),
    lineasDesglosadas: z.array(lineaDesglosadaSchema).optional(),
    ...usdFields,
  }),
});

export type EventoNdVenta = z.infer<typeof EventoNdVentaSchema>;

// ------------------------------------------------------------
// NC_COMPRA
// ------------------------------------------------------------
export const EventoNcCompraSchema = EventoBaseSchema.extend({
  tipoEvento: z.literal("NC_COMPRA"),
  referenciaTabla: z.literal("purchase_orders"),
  datos: z.object({
    montoNeto: montoStr,
    montoImpuestos: montoStr,
    totalFactura: montoStr,
    proveedorId: z.string().uuid(),
    facturaNumero: z.string(),
    montoIIBB: montoStr.optional(),
    ...usdFields,
  }),
});

export type EventoNcCompra = z.infer<typeof EventoNcCompraSchema>;

// ------------------------------------------------------------
// COBRO
// ------------------------------------------------------------
export const EventoCobroSchema = EventoBaseSchema.extend({
  tipoEvento: z.literal("COBRO"),
  referenciaTabla: z.literal("receivable_payments"),
  datos: z.object({
    montoCobrado: montoStr,
    metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "E-CHEQ"]),
    clienteId: z.string().uuid(),
    facturaId: z.string().uuid().optional(),
    bancoAccountCode: z.string().optional(),
    ...usdFields,
  }),
});

export type EventoCobro = z.infer<typeof EventoCobroSchema>;

// ------------------------------------------------------------
// ORDEN_PAGO
// ------------------------------------------------------------
export const EventoOrdenPagoSchema = EventoBaseSchema.extend({
  tipoEvento: z.literal("ORDEN_PAGO"),
  referenciaTabla: z.literal("payable_payments"),
  datos: z.object({
    monto: montoStr,
    metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "E-CHEQ"]),
    proveedorId: z.string().uuid(),
    facturaId: z.string().uuid().optional(),
    bancoAccountCode: z.string().optional(),
    ...usdFields,
  }),
});

export type EventoOrdenPago = z.infer<typeof EventoOrdenPagoSchema>;

// ------------------------------------------------------------
// ASIENTO_MANUAL
// ------------------------------------------------------------
export const EventoAsientoManualSchema = EventoBaseSchema.extend({
  tipoEvento: z.literal("ASIENTO_MANUAL"),
  referenciaTabla: z.literal("manual"),
  datos: z.object({
    usuarioId: z.string().uuid().optional(),
    referenciaLibre: z.string().max(120).optional(),
    ...usdFields,
  }),
});

export type EventoAsientoManual = z.infer<typeof EventoAsientoManualSchema>;

// ------------------------------------------------------------
// Union discriminada — usada en POST /preview y POST /eventos
// ------------------------------------------------------------
export const AnyEventoSchema = z.discriminatedUnion("tipoEvento", [
  EventoFacturaVentaSchema,
  EventoFacturaCompraSchema,
  EventoNcVentaSchema,
  EventoNdVentaSchema,
  EventoNcCompraSchema,
  EventoCobroSchema,
  EventoOrdenPagoSchema,
  EventoAsientoManualSchema,
]);

export type AnyEvento =
  | EventoFacturaVenta
  | EventoFacturaCompra
  | EventoNcVenta
  | EventoNdVenta
  | EventoNcCompra
  | EventoCobro
  | EventoOrdenPago
  | EventoAsientoManual;
