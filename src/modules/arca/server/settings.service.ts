import "server-only";

import { ArcaValidationError, sanitizeArcaErrorMessage } from "../errors";
import type {
  ArcaConnectionStatus,
  ArcaEnvironment,
  ArcaSettingsSummary,
  OrganizationArcaSettingsRow,
  SaveArcaSettingsInput,
} from "../types";
import {
  parseSaveArcaSettingsInput,
  validateIssuerLogoDataUrl,
  validatePemPair,
} from "../validation";
import { assertCanManageOrganizationArca } from "./access";
import {
  getOrganizationArcaSettingsByOrganizationId,
  upsertOrganizationArcaSettings,
} from "./repository";
import { encryptSecret } from "./secrets";

function toArcaEnvironment(
  value: string | null | undefined
): ArcaEnvironment | null {
  if (value === "dev" || value === "prod") {
    return value;
  }

  return null;
}

function toArcaStatus(
  value: string | null | undefined
): ArcaConnectionStatus | null {
  if (value === "pending" || value === "connected" || value === "error") {
    return value;
  }

  return null;
}

function mapArcaSummary(
  organizationCuit: string | null,
  settings: OrganizationArcaSettingsRow | null
): ArcaSettingsSummary {
  return {
    environment: toArcaEnvironment(settings?.environment),
    pointOfSale: settings?.point_of_sale ?? null,
    status: toArcaStatus(settings?.status),
    lastTestedAt: settings?.last_tested_at ?? null,
    lastError: settings?.last_error ?? null,
    certExpiresAt: settings?.cert_expires_at ?? null,
    issuerLogoDataUrl: settings?.issuer_logo_data_url ?? null,
    hasCredentials: Boolean(
      settings?.cert_encrypted && settings?.key_encrypted
    ),
    isConfigured: Boolean(settings),
    organizationCuit,
  };
}

export async function getArcaSettingsSummary(
  orgSlug: string
): Promise<ArcaSettingsSummary> {
  const organization = await assertCanManageOrganizationArca(orgSlug);
  const settings = await getOrganizationArcaSettingsByOrganizationId(
    organization.id
  );

  return mapArcaSummary(organization.cuit, settings);
}

export async function saveArcaSettings(
  input: SaveArcaSettingsInput
): Promise<ArcaSettingsSummary> {
  const parsedInput = parseSaveArcaSettingsInput(input);
  const organization = await assertCanManageOrganizationArca(
    parsedInput.orgSlug
  );
  const existingSettings = await getOrganizationArcaSettingsByOrganizationId(
    organization.id
  );
  const now = new Date().toISOString();

  let certEncrypted = existingSettings?.cert_encrypted;
  let keyEncrypted = existingSettings?.key_encrypted;
  let certExpiresAt = existingSettings?.cert_expires_at ?? null;

  const hasNewCert = Boolean(parsedInput.cert?.trim());
  const hasNewKey = Boolean(parsedInput.key?.trim());
  const issuerLogoDataUrl = validateIssuerLogoDataUrl(
    parsedInput.issuerLogoDataUrl
  );

  if (hasNewCert || hasNewKey) {
    const validatedSecrets = validatePemPair(parsedInput.cert, parsedInput.key);
    certEncrypted = encryptSecret(validatedSecrets.cert);
    keyEncrypted = encryptSecret(validatedSecrets.key);
    certExpiresAt = validatedSecrets.certExpiresAt;
  }

  if (!(certEncrypted && keyEncrypted)) {
    throw new ArcaValidationError(
      "Debés cargar un certificado y una clave privada para guardar la configuración."
    );
  }

  try {
    await upsertOrganizationArcaSettings({
      organization_id: organization.id,
      environment: parsedInput.environment,
      point_of_sale: parsedInput.pointOfSale,
      issuer_logo_data_url:
        issuerLogoDataUrl !== undefined
          ? issuerLogoDataUrl
          : (existingSettings?.issuer_logo_data_url ?? null),
      cert_encrypted: certEncrypted,
      key_encrypted: keyEncrypted,
      status: "pending",
      last_tested_at: null,
      last_error: null,
      cert_expires_at: certExpiresAt,
      updated_at: now,
    });
  } catch (error) {
    throw new ArcaValidationError(sanitizeArcaErrorMessage(error));
  }

  return getArcaSettingsSummary(parsedInput.orgSlug);
}
