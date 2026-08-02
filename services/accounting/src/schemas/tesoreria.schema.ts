import { z } from "zod";

const montoStr = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Monto debe ser numérico con hasta 4 decimales");

const fechaStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD");

const uuidStr = z.string().uuid();

// ── Bank Accounts ─────────────────────────────────────────────────────────────

export const CreateBankAccountSchema = z.object({
  orgId: uuidStr,
  nombre: z.string().min(1).max(150),
  banco: z.string().min(1).max(100),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
  cuentaContableId: uuidStr,
  numerosCuenta: z.string().max(50).optional(),
  alias: z.string().max(100).optional(),
  descripcion: z.string().max(500).optional(),
  creadoPor: uuidStr.optional(),
});

export const UpdateBankAccountSchema = z
  .object({
    nombre: z.string().min(1).max(150).optional(),
    banco: z.string().min(1).max(100).optional(),
    moneda: z.enum(["ARS", "USD"]).optional(),
    cuentaContableId: uuidStr.optional(),
    numerosCuenta: z.string().max(50).nullable().optional(),
    alias: z.string().max(100).nullable().optional(),
    descripcion: z.string().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const ToggleBankAccountEstadoSchema = z.object({
  activa: z.boolean(),
});

export const BankAccountQuerySchema = z.object({
  org_id: uuidStr,
  solo_activas: z.enum(["true", "false"]).optional(),
});

// ── Movements ─────────────────────────────────────────────────────────────────

export const TreasuryMovementTipoEnum = z.enum([
  "DEBITO_BANCARIO",
  "CREDITO_BANCARIO",
  "CHEQUE_RECIBIDO_RECHAZADO",
  "CHEQUE_PROPIO_RECHAZADO",
  "DEPOSITO_CHEQUES",
  "DEPOSITO_EFECTIVO",
  "DEBITO_CHEQUE_PROPIO",
]);

export const CreateBankMovementSchema = z.object({
  orgId: uuidStr,
  operationId: uuidStr.optional(),
  cuentaBancariaId: uuidStr,
  tipo: z.enum(["DEBITO_BANCARIO", "CREDITO_BANCARIO"]),
  fecha: fechaStr,
  descripcion: z.string().min(1, "La descripción es obligatoria").max(500),
  importe: montoStr,
  cuentaContrapartidaCode: z.string().min(1),
  creadoPor: uuidStr.optional(),
});

export const MovementsQuerySchema = z.object({
  org_id: uuidStr,
  cuenta_id: uuidStr.optional(),
  desde: fechaStr.optional(),
  hasta: fechaStr.optional(),
  tipo: TreasuryMovementTipoEnum.optional(),
});

// ── Received Checks ───────────────────────────────────────────────────────────

export const CreateReceivedCheckSchema = z.object({
  orgId: uuidStr,
  operationId: uuidStr.optional(),
  numeroCheque: z.string().min(1).max(50),
  bancoEmisor: z.string().min(1).max(100),
  importe: montoStr,
  fechaEmision: fechaStr,
  fechaVencimiento: fechaStr,
  tipo: z.enum(["CDF", "ECH"]).default("CDF"),
  librador: z.string().max(200).optional(),
  libradorId: uuidStr.optional(),
  notas: z.string().max(500).optional(),
  creadoPor: uuidStr.optional(),
});

export const ReceivedChecksQuerySchema = z.object({
  org_id: uuidStr,
  estado: z
    .enum(["EN_CARTERA", "DEPOSITADO", "ENDOSADO", "RECHAZADO", "ANULADO"])
    .optional(),
});

export const EndorseReceivedChecksForPayableSchema = z.object({
  orgId: uuidStr,
  operationId: uuidStr.optional(),
  accountPayableId: uuidStr,
  supplierId: uuidStr,
  receivedCheckIds: z
    .array(uuidStr)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Los cheques seleccionados no pueden repetirse",
    }),
  creditAmount: montoStr.optional().default("0"),
  paymentDate: fechaStr,
  referenceNumber: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  creadoPor: uuidStr.optional(),
});

export const RejectReceivedCheckSchema = z.object({
  cuentaBancariaId: uuidStr,
  creadoPor: uuidStr.optional(),
});

// ── Issued Checks ─────────────────────────────────────────────────────────────

export const CreateIssuedCheckSchema = z.object({
  orgId: uuidStr,
  operationId: uuidStr.optional(),
  cuentaBancariaId: uuidStr,
  numeroCheque: z.string().min(1).max(50),
  importe: montoStr,
  fechaEmision: fechaStr,
  fechaDebito: fechaStr,
  beneficiario: z.string().min(1).max(200),
  tipo: z.enum(["CDF", "ECH"]).default("CDF"),
  beneficiarioId: uuidStr.optional(),
  notas: z.string().max(500).optional(),
  referenciaPagoId: uuidStr.optional(),
  referenciaPagoTabla: z.string().max(100).optional(),
  creadoPor: uuidStr.optional(),
});

export const IssuedChecksQuerySchema = z.object({
  org_id: uuidStr,
  estado: z.enum(["EMITIDO", "DEBITADO", "RECHAZADO", "ANULADO"]).optional(),
});

export const DebitIssuedCheckSchema = z.object({
  creadoPor: uuidStr.optional(),
});

export const RejectIssuedCheckSchema = z.object({
  cuentaContrapartidaCode: z.string().min(1),
  creadoPor: uuidStr.optional(),
});

// ── Deposit Slips ─────────────────────────────────────────────────────────────

export const CreateCheckDepositSlipSchema = z.object({
  orgId: uuidStr,
  operationId: uuidStr.optional(),
  cuentaBancariaId: uuidStr,
  fecha: fechaStr,
  descripcion: z.string().min(1).max(500),
  checkIds: z.array(uuidStr).min(1, "Debe incluir al menos un cheque"),
  creadoPor: uuidStr.optional(),
});

export const CreateCashDepositSlipSchema = z.object({
  orgId: uuidStr,
  operationId: uuidStr.optional(),
  cuentaBancariaId: uuidStr,
  fecha: fechaStr,
  descripcion: z.string().min(1).max(500),
  importe: montoStr,
  cuentaCajaCode: z.string().min(1).max(100),
  creadoPor: uuidStr.optional(),
});

export const DepositSlipsQuerySchema = z.object({
  org_id: uuidStr,
  cuenta_id: uuidStr.optional(),
});

// Inferred types
export type CreateBankAccountInput = z.infer<typeof CreateBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof UpdateBankAccountSchema>;
export type CreateBankMovementInput = z.infer<typeof CreateBankMovementSchema>;
export type CreateReceivedCheckInput = z.infer<
  typeof CreateReceivedCheckSchema
>;
export type CreateIssuedCheckInput = z.infer<typeof CreateIssuedCheckSchema>;
export type CreateCheckDepositSlipInput = z.infer<
  typeof CreateCheckDepositSlipSchema
>;
export type CreateCashDepositSlipInput = z.infer<
  typeof CreateCashDepositSlipSchema
>;
