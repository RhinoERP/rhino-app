import { z } from "zod";

export const caiModeSchema = z.enum(["preprinted", "self_printed"]);
const cuitSchema = z
  .string()
  .trim()
  .regex(/^\d{11}$/, "Ingresá el CUIT sin guiones.");
export const caiSettingsSchema = z.object({
  enabled: z.boolean(),
  mode: caiModeSchema,
  loginCuit: cuitSchema,
  pointOfSale: z.number().int().min(1).max(99_999),
  businessName: z.string().trim().min(1, "Completá la razón social.").max(200),
  address: z
    .string()
    .trim()
    .min(1, "Completá el domicilio comercial.")
    .max(300),
  vatCondition: z.string().trim().min(1, "Completá la condición IVA.").max(80),
  grossIncome: z
    .string()
    .trim()
    .min(1, "Completá Ingresos Brutos o la condición de no contribuyente.")
    .max(80),
  activityStart: z.iso.date(),
});
export type CaiSettings = z.infer<typeof caiSettingsSchema>;

export const caiActivationSchema = z
  .object({
    authorizationId: z.uuid(),
    firstNumber: z.number().int().min(1).max(99_999_999),
    lastNumber: z.number().int().min(1).max(99_999_999).nullable(),
    lastUsedNumber: z.number().int().min(0).max(99_999_998),
    printerName: z.string().trim().max(200),
    printerCuit: z
      .string()
      .trim()
      .regex(/^(?:\d{11})?$/, "CUIT de imprenta inválido."),
    printerRegistration: z.string().trim().max(80),
    printedAt: z.union([z.iso.date(), z.literal("")]),
    evidence: z
      .string()
      .trim()
      .min(1, "Indicá la referencia de la constancia de ARCA.")
      .max(500),
    confirmed: z.literal(true, {
      error:
        "Confirmá los datos de la constancia y la habilitación correspondiente.",
    }),
  })
  .refine(
    (value) =>
      value.lastNumber === null || value.lastNumber >= value.firstNumber,
    {
      message: "El número final debe ser igual o mayor al inicial.",
      path: ["lastNumber"],
    }
  )
  .refine(
    (value) =>
      value.lastUsedNumber >= value.firstNumber - 1 &&
      (value.lastNumber === null || value.lastUsedNumber < value.lastNumber),
    {
      message:
        "El último utilizado debe estar antes del próximo número disponible.",
      path: ["lastUsedNumber"],
    }
  );
export type CaiActivation = z.infer<typeof caiActivationSchema>;

export const fiscalSnapshotSchema = z.object({
  authorizationId: z.uuid(),
  cai: z.string().regex(/^\d{14}$/),
  expiresAt: z.iso.date(),
  pointOfSale: z.number().int().min(1).max(99_999),
  number: z.number().int().min(1).max(99_999_999),
  mode: caiModeSchema,
  firstNumber: z.number().int(),
  lastNumber: z.number().int().nullable(),
  businessName: z.string(),
  cuit: cuitSchema,
  address: z.string(),
  vatCondition: z.string(),
  grossIncome: z.string(),
  activityStart: z.iso.date(),
  printerName: z.string(),
  printerCuit: z.string(),
  printerRegistration: z.string(),
  printedAt: z.string(),
});
export type FiscalRemittanceSnapshot = z.infer<typeof fiscalSnapshotSchema>;

export const caiAuthorizationSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  cuit: cuitSchema,
  point_of_sale: z.number(),
  mode: caiModeSchema,
  cai: z.string().regex(/^\d{14}$/),
  expires_at: z.iso.date(),
  state: z.enum(["draft", "active", "replaced", "cancelled"]),
  first_number: z.number().nullable(),
  last_number: z.number().nullable(),
  next_number: z.number().nullable(),
  issued_count: z.number(),
  printer_name: z.string(),
  printer_cuit: z.string(),
  printer_registration: z.string(),
  printed_at: z.string(),
  evidence: z.string(),
  source_operation_id: z.uuid().nullable(),
  created_at: z.string(),
});
export type CaiAuthorization = z.infer<typeof caiAuthorizationSchema>;
export const caiOperationSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  request_key: z.uuid(),
  kind: z.enum(["validate", "request", "check_cancel", "cancel"]),
  state: z.enum(["starting", "pending", "complete", "uncertain", "failed"]),
  provider_id: z.string().nullable(),
  params: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
});
export type CaiOperation = z.infer<typeof caiOperationSchema>;

/** Strictly validate dates supplied by ARCA rather than relying on Date rollover. */
export function parseCaiExpiration(value: string): string {
  const parts = value.split("/");
  const iso =
    parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : value;
  return z.iso.date().parse(iso);
}

export function formatFiscalRemittanceNumber(
  pointOfSale: number,
  number: number
) {
  return `${String(pointOfSale).padStart(5, "0")}-${String(number).padStart(8, "0")}`;
}

export function authorizationAvailability(
  authorization: CaiAuthorization,
  today: string
): "inactive" | "expired" | "incomplete" | "exhausted" | "available" {
  if (authorization.state !== "active") {
    return "inactive";
  }
  if (authorization.expires_at < today) {
    return "expired";
  }
  if (authorization.next_number === null) {
    return "incomplete";
  }
  if (
    authorization.last_number !== null &&
    authorization.next_number > authorization.last_number
  ) {
    return "exhausted";
  }
  return "available";
}
