import "server-only";

import { ArcaValidationError, sanitizeArcaErrorMessage } from "../errors";
import type {
  ArcaClientActor,
  ArcaConnectionMode,
  ArcaConnectionStatus,
  ArcaEnvironment,
  ArcaOperatorProfileRow,
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
  getArcaOperatorProfileById,
  getOrganizationArcaSettingsByOrganizationId,
  upsertOrganizationArcaSettings,
} from "./repository";
import { encryptSecret } from "./secrets";

export function toArcaEnvironment(
  value: string | null | undefined
): ArcaEnvironment | null {
  if (value === "dev" || value === "prod") {
    return value;
  }

  return null;
}

export function toArcaStatus(
  value: string | null | undefined
): ArcaConnectionStatus | null {
  if (value === "pending" || value === "connected" || value === "error") {
    return value;
  }

  return null;
}

export function toArcaMode(
  value: string | null | undefined,
  hasSettings: boolean
): ArcaConnectionMode | null {
  if (value === "manual" || value === "delegated") {
    return value;
  }

  return hasSettings ? "manual" : null;
}

export function mapArcaSummary(params: {
  organizationCuit: string | null;
  settings: OrganizationArcaSettingsRow | null;
  operatorProfile?: ArcaOperatorProfileRow | null;
}): ArcaSettingsSummary {
  const mode = toArcaMode(params.settings?.mode, Boolean(params.settings));
  const usesDelegatedCredentials = mode === "delegated";
  const manualCredentialsAvailable = Boolean(
    params.settings?.cert_encrypted && params.settings?.key_encrypted
  );
  const delegatedCredentialsAvailable = Boolean(
    params.operatorProfile?.cert_encrypted &&
      params.operatorProfile?.key_encrypted
  );

  return {
    environment: toArcaEnvironment(params.settings?.environment),
    mode,
    pointOfSale: params.settings?.point_of_sale ?? null,
    status: toArcaStatus(params.settings?.status),
    lastTestedAt: params.settings?.last_tested_at ?? null,
    lastError: params.settings?.last_error ?? null,
    certExpiresAt:
      (usesDelegatedCredentials
        ? params.operatorProfile?.cert_expires_at
        : params.settings?.cert_expires_at) ?? null,
    issuerLogoDataUrl: params.settings?.issuer_logo_data_url ?? null,
    hasCredentials: usesDelegatedCredentials
      ? delegatedCredentialsAvailable
      : manualCredentialsAvailable,
    isConfigured: Boolean(params.settings),
    organizationCuit: params.organizationCuit,
    operatorCuit: params.operatorProfile?.operator_cuit ?? null,
    usesDelegatedCredentials,
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
  let certEncrypted = params.existingSettings?.cert_encrypted ?? null;
  let keyEncrypted = params.existingSettings?.key_encrypted ?? null;
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
  certEncrypted: string | null;
  keyEncrypted: string | null;
  certExpiresAt: string | null;
  existingSettings: OrganizationArcaSettingsRow | null;
  issuerLogoDataUrl?: string | null;
  status?: ArcaConnectionStatus;
  lastTestedAt?: string | null;
  lastError?: string | null;
  mode: ArcaConnectionMode;
  operatorProfileId?: string | null;
  delegatedToCuit?: string | null;
  delegationRequestedAt?: string | null;
  delegationAcceptedAt?: string | null;
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
        mode: params.mode,
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
        operator_profile_id: params.operatorProfileId ?? null,
        delegated_to_cuit: params.delegatedToCuit ?? null,
        delegation_requested_at: params.delegationRequestedAt ?? null,
        delegation_accepted_at: params.delegationAcceptedAt ?? null,
        updated_at: updatedAt,
      },
      params.actor
    );

    const operatorProfile =
      row.mode === "delegated" && row.operator_profile_id
        ? await getArcaOperatorProfileById(row.operator_profile_id)
        : null;

    return {
      row,
      summary: mapArcaSummary({
        organizationCuit: params.organizationCuit,
        settings: row,
        operatorProfile,
      }),
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
  const operatorProfile =
    settings?.mode === "delegated" && settings.operator_profile_id
      ? await getArcaOperatorProfileById(settings.operator_profile_id)
      : null;

  return mapArcaSummary({
    organizationCuit: organization.cuit,
    settings,
    operatorProfile,
  });
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
    mode: "manual",
    pointOfSale: parsedInput.pointOfSale,
    certEncrypted,
    keyEncrypted,
    certExpiresAt,
    existingSettings,
    issuerLogoDataUrl: parsedInput.issuerLogoDataUrl,
    status: "pending",
    lastTestedAt: null,
    lastError: null,
    operatorProfileId: null,
    delegatedToCuit: null,
    delegationRequestedAt: null,
    delegationAcceptedAt: null,
  });

  return summary;
}
