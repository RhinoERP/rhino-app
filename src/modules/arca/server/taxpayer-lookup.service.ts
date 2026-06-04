import "server-only";

import type { CustomerTaxCondition } from "@/modules/customers/tax-conditions";
import {
  ArcaConnectionError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import { validateCuit } from "../validation";
import { getArcaClientForOrganization } from "./client-factory";

export type CustomerTaxpayerLookupResult = {
  cuit: string;
  found: boolean;
  businessName: string | null;
  fiscalAddress: string | null;
  city: string | null;
  province: string | null;
  taxCondition: CustomerTaxCondition | null;
};

type RawTaxpayerPayload = Record<string, unknown>;

const IVA_EXENTO_REGEX = /IVA\s+EXENTO/i;
const IVA_NO_ALCANZADO_REGEX = /IVA\s+NO\s+ALCANZADO/i;
const IVA_REGEX = /IVA/i;
const PADRON_AUTHORIZATION_ERROR_REGEX =
  /notAuthorized|Debe autorizar|autorizar el uso|ws_sr_constancia_inscripcion/i;

function asRecord(value: unknown): RawTaxpayerPayload | null {
  return value && typeof value === "object"
    ? (value as RawTaxpayerPayload)
    : null;
}

function getString(
  record: RawTaxpayerPayload | null,
  key: string
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNestedRecord(
  record: RawTaxpayerPayload | null,
  key: string
): RawTaxpayerPayload | null {
  return asRecord(record?.[key]);
}

function resolveBusinessName(datosGenerales: RawTaxpayerPayload | null) {
  const razonSocial = getString(datosGenerales, "razonSocial");
  if (razonSocial) {
    return razonSocial;
  }

  const parts = [
    getString(datosGenerales, "apellido"),
    getString(datosGenerales, "nombre"),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : null;
}

function includesText(value: unknown, pattern: RegExp): boolean {
  if (typeof value === "string") {
    return pattern.test(value);
  }

  if (Array.isArray(value)) {
    return value.some((entry) => includesText(entry, pattern));
  }

  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return Object.values(record).some((entry) => includesText(entry, pattern));
}

function resolveTaxCondition(
  taxpayer: RawTaxpayerPayload
): CustomerTaxCondition | null {
  if (taxpayer.datosMonotributo) {
    return "MONOTRIBUTO";
  }

  const regimenGeneral = taxpayer.datosRegimenGeneral;

  if (includesText(regimenGeneral, IVA_EXENTO_REGEX)) {
    return "EXENTO";
  }

  if (includesText(regimenGeneral, IVA_NO_ALCANZADO_REGEX)) {
    return "IVA_NO_ALCANZADO";
  }

  if (includesText(regimenGeneral, IVA_REGEX)) {
    return "RESPONSABLE_INSCRIPTO";
  }

  return null;
}

function normalizeTaxpayerDetails(
  cuit: string,
  taxpayer: RawTaxpayerPayload | null
): CustomerTaxpayerLookupResult {
  if (!taxpayer) {
    return {
      cuit,
      found: false,
      businessName: null,
      fiscalAddress: null,
      city: null,
      province: null,
      taxCondition: null,
    };
  }

  const datosGenerales = getNestedRecord(taxpayer, "datosGenerales");
  const domicilioFiscal = getNestedRecord(datosGenerales, "domicilioFiscal");
  const city =
    getString(domicilioFiscal, "localidad") ??
    getString(domicilioFiscal, "descripcionLocalidad");

  return {
    cuit,
    found: true,
    businessName: resolveBusinessName(datosGenerales),
    fiscalAddress: getString(domicilioFiscal, "direccion"),
    city,
    province: getString(domicilioFiscal, "descripcionProvincia"),
    taxCondition: resolveTaxCondition(taxpayer),
  };
}

function isPadronAuthorizationError(error: unknown): boolean {
  return PADRON_AUTHORIZATION_ERROR_REGEX.test(sanitizeArcaErrorMessage(error));
}

export async function lookupCustomerTaxpayerByCuit(
  orgSlug: string,
  cuit: string
): Promise<CustomerTaxpayerLookupResult> {
  const normalizedCuit = validateCuit(cuit, "CUIT del cliente");

  try {
    const arcaClient = await getArcaClientForOrganization(orgSlug);
    const details =
      (await arcaClient.RegisterInscriptionProof.getTaxpayerDetails(
        Number(normalizedCuit)
      )) as RawTaxpayerPayload | null;

    return normalizeTaxpayerDetails(normalizedCuit, details);
  } catch (error) {
    if (error instanceof ArcaValidationError) {
      throw error;
    }

    if (isPadronAuthorizationError(error)) {
      throw new ArcaConnectionError(
        "CUIT válido. No se pudo autocompletar porque la organización no tiene autorizado el servicio de padrón ARCA."
      );
    }

    throw new ArcaConnectionError(
      `No se pudo consultar el padrón ARCA para el CUIT informado: ${sanitizeArcaErrorMessage(error)}`
    );
  }
}
