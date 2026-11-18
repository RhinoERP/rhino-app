import "server-only";
import { z } from "zod";
import { ArcaValidationError } from "@/modules/arca/errors";
import type { createArcaClientFromCredentials } from "@/modules/arca/server/client-factory";

type Client = {
  ElectronicBilling: Pick<
    ReturnType<typeof createArcaClientFromCredentials>["ElectronicBilling"],
    "getLastVoucher" | "getVoucherInfo"
  >;
};

export function assertMeliFiscalIdentity(
  snapshot: unknown,
  expected: { environment: string; issuerCuit: string }
) {
  const identity = z
    .object({ arcaEnvironment: z.string(), issuerCuit: z.string() })
    .safeParse(snapshot);
  if (
    !identity.success ||
    identity.data.arcaEnvironment !== expected.environment ||
    identity.data.issuerCuit !== expected.issuerCuit
  ) {
    throw new ArcaValidationError(
      "El emisor o ambiente ARCA no coincide con el intento original. Se conserva pendiente para revisión."
    );
  }
}
const money = z.number().finite().nonnegative();
const vat = z.object({ Id: z.number().int(), BaseImp: money, Importe: money });
const tribute = z.object({
  Id: z.number().int(),
  BaseImp: money,
  Alic: money,
  Importe: money,
});
const associated = z.object({
  Tipo: z.number().int(),
  PtoVta: z.number().int(),
  Nro: z.number().int(),
  CbteFch: z.coerce.number().int(),
});
const fields = z.object({
  Concepto: z.number().int(),
  DocTipo: z.number().int(),
  DocNro: z.number().int(),
  CondicionIVAReceptorId: z.number().int(),
  CbteFch: z.coerce.number().int(),
  PtoVta: z.number().int().positive(),
  CbteTipo: z.number().int().positive(),
  CbteDesde: z.number().int().positive(),
  CbteHasta: z.number().int().positive(),
  ImpTotal: money,
  ImpNeto: money,
  ImpIVA: money,
  ImpTrib: money,
  ImpOpEx: money,
  ImpTotConc: money,
  MonId: z.string(),
  MonCotiz: z.number().finite().positive(),
  CanMisMonExt: z.enum(["S", "N"]).optional(),
});
const requestSchema = fields.extend({
  Iva: z.array(vat).optional(),
  Tributos: z.array(tribute).optional(),
  CbtesAsoc: z.array(associated).optional(),
});
const infoSchema = fields.extend({
  Resultado: z.literal("A"),
  CodAutorizacion: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(z.string().regex(/^\d{14}$/)),
  FchVto: z.union([z.string(), z.number()]).transform(String),
  Iva: z.object({ AlicIva: z.union([vat, z.array(vat)]) }).optional(),
  Tributos: z
    .object({ Tributo: z.union([tribute, z.array(tribute)]) })
    .optional(),
  CbtesAsoc: z
    .object({ CbteAsoc: z.union([associated, z.array(associated)]) })
    .optional(),
});

export async function reserveMeliVoucherNumber<
  T extends { PtoVta: number; CbteTipo: number },
>(client: Client, request: T) {
  const last = Number(
    await client.ElectronicBilling.getLastVoucher(
      request.PtoVta,
      request.CbteTipo
    )
  );
  if (!Number.isSafeInteger(last) || last < 0 || last >= 99_999_999) {
    throw new ArcaValidationError(
      "ARCA no devolvió un último número de comprobante válido."
    );
  }
  return { ...request, CbteDesde: last + 1, CbteHasta: last + 1 };
}

/** Match the reserved voucher, never guess a number or reset an uncertain attempt. */
export async function verifyMeliReservedVoucher(
  client: Client,
  savedRequest: unknown
) {
  const parsed = z
    .object({ wsfeRequest: requestSchema })
    .safeParse(savedRequest);
  if (!parsed.success) {
    throw new ArcaValidationError(
      "El intento no tiene una reserva fiscal verificable. Requiere conciliación manual; no se reenviará."
    );
  }
  const request = parsed.data.wsfeRequest;
  if (request.CbteDesde !== request.CbteHasta) {
    throw new ArcaValidationError(
      "La reserva no corresponde a un comprobante individual."
    );
  }
  const raw = await client.ElectronicBilling.getVoucherInfo(
    request.CbteDesde,
    request.PtoVta,
    request.CbteTipo
  );
  const info = infoSchema.safeParse(raw);
  if (!info.success) {
    throw new ArcaValidationError(
      "ARCA todavía no devolvió una autorización verificable para la reserva. El intento permanece pendiente."
    );
  }
  const authorized = info.data;
  const keys = [
    "Concepto",
    "DocTipo",
    "DocNro",
    "CondicionIVAReceptorId",
    "CbteFch",
    "PtoVta",
    "CbteTipo",
    "CbteDesde",
    "CbteHasta",
    "ImpTotal",
    "ImpNeto",
    "ImpIVA",
    "ImpTrib",
    "ImpOpEx",
    "ImpTotConc",
    "MonId",
    "MonCotiz",
  ] as const;
  const canonical = (values: unknown[]) =>
    JSON.stringify(values.map((value) => JSON.stringify(value)).sort());
  const expectedVat = (request.Iva ?? []).map(({ Id, BaseImp, Importe }) => [
    Id,
    BaseImp,
    Importe,
  ]);
  const actualVat = [authorized.Iva?.AlicIva ?? []]
    .flat()
    .map(({ Id, BaseImp, Importe }) => [Id, BaseImp, Importe]);
  const expectedTributes = (request.Tributos ?? []).map(
    ({ Id, Alic, BaseImp, Importe }) => [Id, Alic, BaseImp, Importe]
  );
  const actualTributes = [authorized.Tributos?.Tributo ?? []]
    .flat()
    .map(({ Id, Alic, BaseImp, Importe }) => [Id, Alic, BaseImp, Importe]);
  const expectedSources = (request.CbtesAsoc ?? []).map(
    ({ Tipo, PtoVta, Nro, CbteFch }) => [Tipo, PtoVta, Nro, CbteFch]
  );
  const actualSources = [authorized.CbtesAsoc?.CbteAsoc ?? []]
    .flat()
    .map(({ Tipo, PtoVta, Nro, CbteFch }) => [Tipo, PtoVta, Nro, CbteFch]);
  if (
    keys.some((key) => request[key] !== authorized[key]) ||
    (request.CanMisMonExt ?? "N") !== (authorized.CanMisMonExt ?? "N") ||
    canonical(expectedVat) !== canonical(actualVat) ||
    canonical(expectedTributes) !== canonical(actualTributes) ||
    canonical(expectedSources) !== canonical(actualSources)
  ) {
    throw new ArcaValidationError(
      "El comprobante consultado no coincide con la solicitud guardada. Se conserva pendiente para revisión."
    );
  }
  return {
    request,
    authorization: {
      CAE: authorized.CodAutorizacion,
      CAEFchVto: authorized.FchVto,
    },
    voucherNumber: request.CbteDesde,
    responseJson: z.json().parse({ voucherInfo: raw }),
  };
}
