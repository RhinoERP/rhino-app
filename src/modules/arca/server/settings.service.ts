import "server-only";

import { ArcaValidationError, sanitizeArcaErrorMessage } from "../errors";
import type {
  ArcaClientActor,
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

export function mapArcaSummary(
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

export function resolveArcaPersistedSecrets(params: {
  existingSettings: OrganizationArcaSettingsRow | null;
  cert?: string;
  key?: string;
}): {
  certEncrypted: string;
  keyEncrypted: string;
  certExpiresAt: string | null;
} {
  let certEncrypted = params.existingSettings?.cert_encrypted;
  let keyEncrypted = params.existingSettings?.key_encrypted;
  let certExpiresAt = params.existingSettings?.cert_expires_at ?? null;

  const hasNewCert = Boolean(params.cert?.trim());
  const hasNewKey = Boolean(params.key?.trim());

  if (hasNewCert || hasNewKey) {
    const validatedSecrets = validatePemPair(params.cert, params.key);
    certEncrypted = encryptSecret(validatedSecrets.cert);
    keyEncrypted = encryptSecret(validatedSecrets.key);
    certExpiresAt = validatedSecrets.certExpiresAt;
  }

  if (!(certEncrypted && keyEncrypted)) {
    throw new ArcaValidationError(
      "Debés cargar un certificado y una clave privada para guardar la configuración."
    );
  }

  return {
    certEncrypted,
    keyEncrypted,
    certExpiresAt,
  };
}

export async function persistOrganizationArcaSettings(params: {
  organizationId: string;
  organizationCuit: string | null;
  environment: ArcaEnvironment;
  pointOfSale: number;
  certEncrypted: string;
  keyEncrypted: string;
  certExpiresAt: string | null;
  existingSettings: OrganizationArcaSettingsRow | null;
  issuerLogoDataUrl?: string | null;
  status?: ArcaConnectionStatus;
  lastTestedAt?: string | null;
  lastError?: string | null;
  actor?: ArcaClientActor;
  updatedAt?: string;
}): Promise<{
  row: OrganizationArcaSettingsRow;
  summary: ArcaSettingsSummary;
}> {
  const issuerLogoDataUrl = validateIssuerLogoDataUrl(params.issuerLogoDataUrl);
  const updatedAt = params.updatedAt ?? new Date().toISOString();

  try {
    const row = await upsertOrganizationArcaSettings(
      {
        organization_id: params.organizationId,
        environment: params.environment,
        point_of_sale: params.pointOfSale,
        issuer_logo_data_url:
          issuerLogoDataUrl !== undefined
            ? issuerLogoDataUrl
            : (params.existingSettings?.issuer_logo_data_url ?? null),
        cert_encrypted: params.certEncrypted,
        key_encrypted: params.keyEncrypted,
        status: params.status ?? "pending",
        last_tested_at: params.lastTestedAt ?? null,
        last_error: params.lastError ?? null,
        cert_expires_at: params.certExpiresAt,
        updated_at: updatedAt,
      },
      params.actor
    );

    return {
      row,
      summary: mapArcaSummary(params.organizationCuit, row),
    };
  } catch (error) {
    throw new ArcaValidationError(sanitizeArcaErrorMessage(error));
  }
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
  const { certEncrypted, keyEncrypted, certExpiresAt } =
    resolveArcaPersistedSecrets({
      existingSettings,
      cert: parsedInput.cert,
      key: parsedInput.key,
    });

  const { summary } = await persistOrganizationArcaSettings({
    organizationId: organization.id,
    organizationCuit: organization.cuit,
    environment: parsedInput.environment,
    pointOfSale: parsedInput.pointOfSale,
    certEncrypted,
    keyEncrypted,
    certExpiresAt,
    existingSettings,
    issuerLogoDataUrl: parsedInput.issuerLogoDataUrl,
    status: "pending",
    lastTestedAt: null,
    lastError: null,
  });

  return summary;
}
