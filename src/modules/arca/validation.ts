import {
  createPrivateKey,
  createPublicKey,
  X509Certificate,
} from "node:crypto";
import { z } from "zod";
import { ArcaValidationError } from "./errors";
import type { SaveArcaSettingsInput } from "./types";

const CERTIFICATE_PEM_REGEX =
  /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/;
const PRIVATE_KEY_PEM_REGEX =
  /-----BEGIN (?:(?:RSA|EC) )?PRIVATE KEY-----[\s\S]+?-----END (?:(?:RSA|EC) )?PRIVATE KEY-----/;
const CUIT_REGEX = /^\d{11}$/;
const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export const saveArcaSettingsSchema = z.object({
  orgSlug: z.string().min(1, "La organización es obligatoria."),
  environment: z.enum(["dev", "prod"]),
  pointOfSale: z
    .number()
    .int("El punto de venta debe ser un entero.")
    .positive("El punto de venta debe ser mayor a 0."),
  cert: z.string().optional(),
  key: z.string().optional(),
});

export function parseSaveArcaSettingsInput(
  input: SaveArcaSettingsInput
): SaveArcaSettingsInput {
  return saveArcaSettingsSchema.parse(input);
}

export function normalizePemInput(value?: string | null): string | undefined {
  const normalized = value?.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return;
  }

  return `${normalized}\n`;
}

function extractFirstCertificatePem(certPem: string): string {
  const match = certPem.match(CERTIFICATE_PEM_REGEX);

  if (!match?.[0]) {
    throw new ArcaValidationError(
      "El certificado debe estar en formato PEM válido."
    );
  }

  return match[0];
}

function exportPublicKeyDer(key: ReturnType<typeof createPublicKey>) {
  return key.export({
    format: "der",
    type: "spki",
  });
}

export function validatePemPair(
  certPem?: string,
  keyPem?: string
): {
  cert: string;
  key: string;
  certExpiresAt: string | null;
} {
  const normalizedCert = normalizePemInput(certPem);
  const normalizedKey = normalizePemInput(keyPem);

  if (!(normalizedCert || normalizedKey)) {
    throw new ArcaValidationError(
      "Debés cargar un certificado y una clave privada."
    );
  }

  if (!(normalizedCert && normalizedKey)) {
    throw new ArcaValidationError(
      "Debés cargar certificado y clave privada juntos."
    );
  }

  if (!CERTIFICATE_PEM_REGEX.test(normalizedCert)) {
    throw new ArcaValidationError(
      "El certificado debe estar en formato PEM válido."
    );
  }

  if (!PRIVATE_KEY_PEM_REGEX.test(normalizedKey)) {
    throw new ArcaValidationError(
      "La clave privada debe estar en formato PEM válido."
    );
  }

  try {
    const certObject = new X509Certificate(
      extractFirstCertificatePem(normalizedCert)
    );
    const privateKey = createPrivateKey(normalizedKey);
    const certPublicKey = certObject.publicKey;
    const privateKeyPublicKey = createPublicKey(privateKey);
    const certPublicKeyDer = exportPublicKeyDer(certPublicKey);
    const privateKeyPublicKeyDer = exportPublicKeyDer(privateKeyPublicKey);

    if (Buffer.compare(certPublicKeyDer, privateKeyPublicKeyDer) !== 0) {
      throw new ArcaValidationError(
        "El certificado y la clave privada no corresponden entre sí."
      );
    }

    const expiresAt = new Date(certObject.validTo);

    return {
      cert: normalizedCert,
      key: normalizedKey,
      certExpiresAt: Number.isNaN(expiresAt.getTime())
        ? null
        : expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof ArcaValidationError) {
      throw error;
    }

    throw new ArcaValidationError(
      "No se pudo validar el certificado y la clave privada en formato PEM."
    );
  }
}

export function normalizeCuit(cuit: string): string {
  return cuit.replace(/\D/g, "");
}

export function validateOrganizationCuit(
  cuit: string | null | undefined
): string {
  if (!cuit?.trim()) {
    throw new ArcaValidationError("La organización no tiene CUIT configurado.");
  }

  const normalized = normalizeCuit(cuit);

  if (!CUIT_REGEX.test(normalized)) {
    throw new ArcaValidationError(
      "El CUIT de la organización no tiene un formato válido."
    );
  }

  const digits = normalized.split("").map(Number);
  const verificationDigit = digits[10];
  const total = CUIT_WEIGHTS.reduce(
    (acc, weight, index) => acc + digits[index] * weight,
    0
  );
  const remainder = total % 11;
  let expectedDigit = 11 - remainder;

  if (remainder === 0) {
    expectedDigit = 0;
  } else if (remainder === 1) {
    expectedDigit = 9;
  }

  if (verificationDigit !== expectedDigit) {
    throw new ArcaValidationError(
      "El CUIT de la organización no tiene un formato válido."
    );
  }

  return normalized;
}
