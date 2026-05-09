import "server-only";

import { ArcaValidationError, sanitizeArcaErrorMessage } from "../errors";
import type {
  ArcaClientActor,
  ArcaConnectionMode,
  ArcaConnectionStatus,
  ArcaDelegationStep,
  ArcaDelegationSummary,
  ArcaEnvironment,
  ArcaInvoiceAAuthorizationType,
  ArcaOperatorProfileRow,
  ArcaSettingsSummary,
  OrganizationArcaDelegationRow,
  OrganizationArcaSettingsRow,
  SaveArcaSettingsInput,
} from "../types";
import {
  normalizeIssuerLegalAddress,
  parseSaveArcaSettingsInput,
  validateIssuerLogoDataUrl,
  validatePemPair,
} from "../validation";
import { assertCanManageOrganizationArca } from "./access";
import {
  getArcaOperatorProfileByEnvironment,
  getArcaOperatorProfileById,
  getOrganizationArcaDelegationByOrganizationIdAndEnvironment,
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

export function toArcaInvoiceAAuthorizationType(
  value: string | null | undefined
): ArcaInvoiceAAuthorizationType {
  if (value === "operation_subject_to_withholding") {
    return value;
  }

  return "standard";
}

function toAutomaticSalesPointProfile(
  value: string | null | undefined
): "monotributo_wsfe" | "existing_wsfe_point" | null {
  if (value === "monotributo_wsfe" || value === "existing_wsfe_point") {
    return value;
  }

  return null;
}

function toDelegationStatus(
  value: string | null | undefined
): ArcaDelegationSummary["status"] | null {
  if (
    value === "pending" ||
    value === "delegated" ||
    value === "accepted" ||
    value === "operator_ready" ||
    value === "connected" ||
    value === "error"
  ) {
    return value;
  }

  return null;
}

function toDelegationStep(value: unknown): ArcaDelegationStep | null {
  if (
    value === "operator_profile_ready" ||
    value === "delegate_web_service" ||
    value === "accept_web_service_delegation" ||
    value === "validate_sales_point" ||
    value === "test_wsfe" ||
    value === "connected"
  ) {
    return value;
  }

  return null;
}

export function mapArcaDelegationSummary(
  delegation: OrganizationArcaDelegationRow | null
): ArcaDelegationSummary | null {
  if (!delegation) {
    return null;
  }

  const trace =
    delegation.automation_trace &&
    typeof delegation.automation_trace === "object"
      ? delegation.automation_trace
      : null;
  const lastSuccessfulStep = toDelegationStep(
    trace && "lastSuccessfulStep" in trace
      ? (trace as Record<string, unknown>).lastSuccessfulStep
      : null
  );

  return {
    environment: delegation.environment === "prod" ? "prod" : "dev",
    status: toDelegationStatus(delegation.status) ?? "pending",
    representedCuit: delegation.represented_cuit,
    operatorCuit: delegation.operator_cuit_snapshot,
    pointOfSale: delegation.point_of_sale,
    salesPointProfile: toAutomaticSalesPointProfile(
      delegation.sales_point_profile
    ),
    service: delegation.service,
    requestedAt: delegation.delegation_requested_at,
    acceptedAt: delegation.delegation_accepted_at,
    connectedAt: delegation.connected_at,
    lastTestedAt: delegation.last_tested_at,
    lastError: delegation.last_error,
    lastSuccessfulStep,
    automationTrace: delegation.automation_trace,
  };
}

function isOperatorProfileReady(
  profile?: ArcaOperatorProfileRow | null
): boolean {
  return Boolean(
    profile?.cert_encrypted &&
      profile?.key_encrypted &&
      profile?.wsfe_authorized_at
  );
}

export function mapArcaSummary(params: {
  organizationCuit: string | null;
  settings: OrganizationArcaSettingsRow | null;
  operatorProfile?: ArcaOperatorProfileRow | null;
  operatorProfilesByEnvironment?: Partial<
    Record<ArcaEnvironment, ArcaOperatorProfileRow | null>
  >;
  delegation?: OrganizationArcaDelegationRow | null;
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
  const operatorReadyByEnvironment = {
    dev: isOperatorProfileReady(params.operatorProfilesByEnvironment?.dev),
    prod: isOperatorProfileReady(params.operatorProfilesByEnvironment?.prod),
  } satisfies Record<ArcaEnvironment, boolean>;

  return {
    environment: toArcaEnvironment(params.settings?.environment),
    mode,
    pointOfSale: params.settings?.point_of_sale ?? null,
    invoiceAAuthorizationType: toArcaInvoiceAAuthorizationType(
      params.settings?.invoice_a_authorization_type
    ),
    status: toArcaStatus(params.settings?.status),
    lastTestedAt: params.settings?.last_tested_at ?? null,
    lastError: params.settings?.last_error ?? null,
    certExpiresAt:
      (usesDelegatedCredentials
        ? params.operatorProfile?.cert_expires_at
        : params.settings?.cert_expires_at) ?? null,
    issuerLogoDataUrl: params.settings?.issuer_logo_data_url ?? null,
    issuerLegalAddress: params.settings?.issuer_legal_address ?? null,
    hasCredentials: usesDelegatedCredentials
      ? delegatedCredentialsAvailable
      : manualCredentialsAvailable,
    isConfigured: Boolean(params.settings),
    organizationCuit: params.organizationCuit,
    operatorCuit: params.operatorProfile?.operator_cuit ?? null,
    usesDelegatedCredentials,
    operatorReady: isOperatorProfileReady(params.operatorProfile),
    operatorReadyByEnvironment,
    operatorWsfeAuthorizedAt:
      params.operatorProfile?.wsfe_authorized_at ?? null,
    operatorWsfeLastCheckedAt:
      params.operatorProfile?.wsfe_last_checked_at ?? null,
    operatorWsfeLastError: params.operatorProfile?.wsfe_last_error ?? null,
    delegation: mapArcaDelegationSummary(params.delegation ?? null),
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: persists manual and delegated settings snapshots in one place.
export async function persistOrganizationArcaSettings(params: {
  organizationId: string;
  organizationCuit: string | null;
  environment: ArcaEnvironment;
  pointOfSale: number;
  invoiceAAuthorizationType: ArcaInvoiceAAuthorizationType;
  certEncrypted: string | null;
  keyEncrypted: string | null;
  certExpiresAt: string | null;
  existingSettings: OrganizationArcaSettingsRow | null;
  issuerLogoDataUrl?: string | null;
  issuerLegalAddress?: string | null;
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
  const issuerLegalAddress = normalizeIssuerLegalAddress(
    params.issuerLegalAddress
  );
  const updatedAt = params.updatedAt ?? new Date().toISOString();

  try {
    const row = await upsertOrganizationArcaSettings(
      {
        organization_id: params.organizationId,
        environment: params.environment,
        mode: params.mode,
        point_of_sale: params.pointOfSale,
        invoice_a_authorization_type: params.invoiceAAuthorizationType,
        issuer_logo_data_url:
          issuerLogoDataUrl !== undefined
            ? issuerLogoDataUrl
            : (params.existingSettings?.issuer_logo_data_url ?? null),
        issuer_legal_address:
          issuerLegalAddress !== undefined
            ? issuerLegalAddress
            : (params.existingSettings?.issuer_legal_address ?? null),
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
    const [devOperatorProfile, prodOperatorProfile] = await Promise.all([
      getArcaOperatorProfileByEnvironment("dev"),
      getArcaOperatorProfileByEnvironment("prod"),
    ]);
    const delegation =
      row.mode === "delegated"
        ? await getOrganizationArcaDelegationByOrganizationIdAndEnvironment(
            row.organization_id,
            row.environment === "prod" ? "prod" : "dev",
            params.actor
          )
        : null;

    return {
      row,
      summary: mapArcaSummary({
        organizationCuit: params.organizationCuit,
        settings: row,
        operatorProfile,
        operatorProfilesByEnvironment: {
          dev: devOperatorProfile,
          prod: prodOperatorProfile,
        },
        delegation,
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
  const [devOperatorProfile, prodOperatorProfile] = await Promise.all([
    getArcaOperatorProfileByEnvironment("dev"),
    getArcaOperatorProfileByEnvironment("prod"),
  ]);
  const delegation =
    settings?.mode === "delegated" && settings.environment
      ? await getOrganizationArcaDelegationByOrganizationIdAndEnvironment(
          organization.id,
          settings.environment === "prod" ? "prod" : "dev"
        )
      : null;

  return mapArcaSummary({
    organizationCuit: organization.cuit,
    settings,
    operatorProfile,
    operatorProfilesByEnvironment: {
      dev: devOperatorProfile,
      prod: prodOperatorProfile,
    },
    delegation,
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
    invoiceAAuthorizationType: parsedInput.invoiceAAuthorizationType,
    certEncrypted,
    keyEncrypted,
    certExpiresAt,
    existingSettings,
    issuerLogoDataUrl: parsedInput.issuerLogoDataUrl,
    issuerLegalAddress: parsedInput.issuerLegalAddress,
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
