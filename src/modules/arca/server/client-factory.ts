import "server-only";

import Afip from "@afipsdk/afip.js";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  ArcaConfigurationError,
  ArcaNotConfiguredError,
  ArcaValidationError,
} from "../errors";
import type {
  ArcaClientActor,
  ArcaEnvironment,
  ArcaOperatorProfileRow,
  OrganizationArcaDelegationRow,
  OrganizationArcaSettingsRow,
  ResolvedArcaOrganizationCredentials,
} from "../types";
import { validateOrganizationCuit } from "../validation";
import {
  getArcaOperatorProfileByEnvironment,
  getArcaOperatorProfileById,
  getOrganizationArcaDelegationByOrganizationIdAndEnvironment,
  getOrganizationArcaSettingsByOrganizationId,
} from "./repository";
import { decryptSecret } from "./secrets";
import { toArcaEnvironment, toArcaMode } from "./settings.service";

export function getAfipSdkAccessToken(): string {
  const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new ArcaConfigurationError(
      "Falta configurar AFIP_SDK_ACCESS_TOKEN en el servidor."
    );
  }

  return accessToken;
}

export function createArcaAutomationClient(environment: ArcaEnvironment): Afip {
  return new Afip({
    access_token: getAfipSdkAccessToken(),
    production: environment === "prod",
  });
}

export function createArcaClientFromCredentials(params: {
  cuit: string;
  cert: string;
  key: string;
  environment: ArcaEnvironment;
}): Afip {
  return new Afip({
    CUIT: params.cuit,
    access_token: getAfipSdkAccessToken(),
    cert: params.cert,
    key: params.key,
    production: params.environment === "prod",
  });
}

export function isArcaCertificateExpired(
  certExpiresAt: string | null
): boolean {
  if (!certExpiresAt) {
    return false;
  }

  const expiresAt = new Date(certExpiresAt);

  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() <= Date.now();
}

function assertManualCredentials(
  settings: OrganizationArcaSettingsRow
): Pick<ResolvedArcaOrganizationCredentials, "cert" | "key" | "certExpiresAt"> {
  if (!(settings.cert_encrypted && settings.key_encrypted)) {
    throw new ArcaNotConfiguredError(
      "La organización no tiene certificado y clave ARCA guardados."
    );
  }

  return {
    cert: decryptSecret(settings.cert_encrypted),
    key: decryptSecret(settings.key_encrypted),
    certExpiresAt: settings.cert_expires_at ?? null,
  };
}

function assertDelegatedCredentials(
  operatorProfile: ArcaOperatorProfileRow | null
): {
  cert: string;
  key: string;
  certExpiresAt: string | null;
  operatorProfile: ArcaOperatorProfileRow;
} {
  if (!operatorProfile) {
    throw new ArcaNotConfiguredError(
      "No existe un perfil operador ARCA asociado para esta organización."
    );
  }

  if (!(operatorProfile.cert_encrypted && operatorProfile.key_encrypted)) {
    throw new ArcaNotConfiguredError(
      "El perfil operador ARCA no tiene certificado y clave configurados."
    );
  }

  return {
    cert: decryptSecret(operatorProfile.cert_encrypted),
    key: decryptSecret(operatorProfile.key_encrypted),
    certExpiresAt: operatorProfile.cert_expires_at ?? null,
    operatorProfile,
  };
}

function assertCentralPadronCredentials(
  operatorProfile: ArcaOperatorProfileRow | null
): {
  cuit: string;
  cert: string;
  key: string;
} {
  if (!operatorProfile) {
    throw new ArcaNotConfiguredError(
      "El padrón ARCA central de Rhino no está configurado.",
      {
        code: "operator_profile_missing",
        step: "load-central-padron-profile",
        hint: "Configurá el perfil operador ARCA de producción desde /admin/arca antes de consultar padrón.",
      }
    );
  }

  if (
    !(
      operatorProfile.operator_cuit &&
      operatorProfile.cert_encrypted &&
      operatorProfile.key_encrypted
    )
  ) {
    throw new ArcaNotConfiguredError(
      "El padrón ARCA central de Rhino no está configurado.",
      {
        code: "operator_profile_invalid",
        step: "load-central-padron-profile",
        hint: "El perfil operador ARCA de producción necesita CUIT, certificado y clave privada.",
      }
    );
  }

  return {
    cuit: operatorProfile.operator_cuit,
    cert: decryptSecret(operatorProfile.cert_encrypted),
    key: decryptSecret(operatorProfile.key_encrypted),
  };
}

function assertConnectedDelegation(params: {
  delegation: OrganizationArcaDelegationRow | null;
  organizationCuit: string;
  operatorProfile: ArcaOperatorProfileRow;
  environment: ArcaEnvironment;
}): OrganizationArcaDelegationRow {
  const { delegation } = params;

  if (!delegation) {
    throw new ArcaNotConfiguredError(
      "La organización no tiene una delegación ARCA guardada para este ambiente."
    );
  }

  if (delegation.status !== "connected") {
    throw new ArcaNotConfiguredError(
      "La delegación ARCA todavía no quedó conectada para esta organización."
    );
  }

  if (delegation.represented_cuit !== params.organizationCuit) {
    throw new ArcaValidationError(
      "El CUIT actual de la organización no coincide con el CUIT delegado en ARCA."
    );
  }

  if (delegation.operator_profile_id !== params.operatorProfile.id) {
    throw new ArcaValidationError(
      "La delegación ARCA apunta a un operador distinto del perfil activo."
    );
  }

  if (!params.operatorProfile.wsfe_authorized_at) {
    throw new ArcaNotConfiguredError(
      "El operador ARCA no tiene WSFE autorizado para este ambiente."
    );
  }

  if (
    delegation.connected_at &&
    new Date(params.operatorProfile.updated_at).getTime() >
      new Date(delegation.connected_at).getTime()
  ) {
    throw new ArcaValidationError(
      "El operador ARCA cambió después de la última conexión del tenant. Repetí el onboarding delegado."
    );
  }

  if (delegation.environment !== params.environment) {
    throw new ArcaValidationError(
      "La delegación ARCA no coincide con el ambiente configurado."
    );
  }

  return delegation;
}

export async function resolveArcaOrganizationCredentials(params: {
  organizationId: string;
  organizationCuit: string | null;
  actor?: ArcaClientActor;
}): Promise<ResolvedArcaOrganizationCredentials> {
  const actor = params.actor ?? "current-user";
  const organizationCuit = validateOrganizationCuit(params.organizationCuit);
  const settings = await getOrganizationArcaSettingsByOrganizationId(
    params.organizationId,
    actor
  );

  if (!settings) {
    throw new ArcaNotConfiguredError(
      "La organización no tiene configuración ARCA guardada."
    );
  }

  const environment = toArcaEnvironment(settings.environment);

  if (!environment) {
    throw new ArcaValidationError(
      "La configuración ARCA no tiene un ambiente válido."
    );
  }

  if (!settings.point_of_sale || settings.point_of_sale <= 0) {
    throw new ArcaValidationError(
      "La organización no tiene un punto de venta ARCA válido."
    );
  }

  const mode = toArcaMode(settings.mode, true) ?? "manual";

  if (mode === "delegated") {
    const operatorProfile = settings.operator_profile_id
      ? await getArcaOperatorProfileById(settings.operator_profile_id)
      : null;
    const delegated = assertDelegatedCredentials(operatorProfile);
    const delegation =
      await getOrganizationArcaDelegationByOrganizationIdAndEnvironment(
        params.organizationId,
        environment,
        actor
      );
    const connectedDelegation = assertConnectedDelegation({
      delegation,
      organizationCuit,
      operatorProfile: delegated.operatorProfile,
      environment,
    });

    return {
      mode,
      organizationCuit,
      environment,
      pointOfSale: settings.point_of_sale,
      cert: delegated.cert,
      key: delegated.key,
      certExpiresAt: delegated.certExpiresAt,
      settings,
      operatorProfile: delegated.operatorProfile,
      delegation: connectedDelegation,
    };
  }

  const manual = assertManualCredentials(settings);

  return {
    mode,
    organizationCuit,
    environment,
    pointOfSale: settings.point_of_sale,
    cert: manual.cert,
    key: manual.key,
    certExpiresAt: manual.certExpiresAt,
    settings,
    operatorProfile: null,
    delegation: null,
  };
}

export async function getArcaClientForOrganization(
  orgSlug: string,
  options?: {
    actor?: ArcaClientActor;
  }
): Promise<Afip> {
  const actor = options?.actor ?? "current-user";
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization?.id) {
    throw new ArcaValidationError("Organización no encontrada.");
  }

  const resolved = await resolveArcaOrganizationCredentials({
    organizationId: organization.id,
    organizationCuit: organization.cuit,
    actor,
  });

  return createArcaClientFromCredentials({
    cuit: resolved.organizationCuit,
    cert: resolved.cert,
    key: resolved.key,
    environment: resolved.environment,
  });
}

export async function getCentralArcaPadronClient(): Promise<Afip> {
  const operatorProfile = await getArcaOperatorProfileByEnvironment("prod");
  const credentials = assertCentralPadronCredentials(operatorProfile);

  return createArcaClientFromCredentials({
    ...credentials,
    environment: "prod",
  });
}
