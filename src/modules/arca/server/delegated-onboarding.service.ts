import "server-only";

import type Afip from "@afipsdk/afip.js";
import {
  ArcaConnectionError,
  ArcaNotConfiguredError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import type {
  ArcaDiagnosticCode,
  ArcaEnvironment,
  ArcaErrorDiagnostic,
  ArcaOperatorProfileRow,
  AutomaticSalesPointProfile,
  DelegatedArcaOnboardingInput,
  DelegatedArcaOnboardingResult,
  OrganizationArcaDelegationRow,
} from "../types";
import {
  parseDelegatedArcaOnboardingInput,
  validateOrganizationCuit,
} from "../validation";
import { assertCanManageOrganizationArca } from "./access";
import { createArcaAutomationClient } from "./client-factory";
import { testArcaConnectionWithCredentials } from "./onboarding.service";
import { getRequiredArcaOperatorProfile } from "./operator-profiles.service";
import {
  getOrganizationArcaDelegationByOrganizationIdAndEnvironment,
  getOrganizationArcaSettingsByOrganizationId,
  updateOrganizationArcaDelegation,
  updateOrganizationArcaSettings,
  upsertOrganizationArcaDelegation,
} from "./repository";
import { decryptSecret } from "./secrets";
import {
  getArcaSettingsSummary,
  persistOrganizationArcaSettings,
} from "./settings.service";

type AutomationResponse<TData = unknown> = {
  id: string;
  status: string;
  data?: TData;
};

type AutomationCredentials = {
  cuit: string;
  username: string;
  password: string;
};

type ListedSalesPoint = {
  number?: string | number;
  displayName?: string;
  system?: string;
  deactivated?: boolean;
  blocked?: boolean;
};

type ResolvedSalesPoint = {
  status: "existing" | "created";
};

type DelegationStep =
  | "operator_profile_ready"
  | "delegate_web_service"
  | "accept_web_service_delegation"
  | "validate_sales_point"
  | "test_wsfe"
  | "connected";

const WSFE_SERVICE_ID = "wsfe";
const MONOTRIBUTO_WSFE_SYSTEM_CODE = "MAW";

function createDiagnostic(params: {
  code: ArcaDiagnosticCode;
  step?: string;
  hint?: string;
}): ArcaErrorDiagnostic {
  return {
    code: params.code,
    step: params.step ?? null,
    hint: params.hint ?? null,
  };
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : null;
  }

  if (typeof value === "string" && value.trim()) {
    const normalized = Number.parseInt(value, 10);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
  }

  return null;
}

function normalizeListedSalesPoints(payload: unknown): ListedSalesPoint[] {
  let entries: unknown = payload;

  if (entries == null) {
    return [];
  }

  if (!Array.isArray(entries) && entries && typeof entries === "object") {
    const candidate = entries as {
      sales_points?: unknown;
      salesPoints?: unknown;
      result?: unknown;
      data?: unknown;
    };

    entries =
      candidate.sales_points ??
      candidate.salesPoints ??
      candidate.result ??
      candidate.data;
  }

  if (!Array.isArray(entries)) {
    throw new ArcaValidationError(
      "ARCA devolvió un formato inesperado al consultar los puntos de venta.",
      createDiagnostic({
        code: "unexpected_sales_points_response",
        step: "list-sales-points",
        hint: "La automatización respondió, pero el payload no tenía una lista reconocible de puntos de venta.",
      })
    );
  }

  return entries.filter((entry): entry is ListedSalesPoint =>
    Boolean(entry && typeof entry === "object")
  );
}

function getListedSalesPointNumber(point: ListedSalesPoint): number | null {
  return toPositiveInteger(point.number);
}

function isAutomationTimeoutError(message: string): boolean {
  return (
    message.includes("waiting for too long") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

function looksLikeInvalidCredentialsError(message: string): boolean {
  return (
    message.includes("credencial") ||
    message.includes("usuario") ||
    message.includes("contrasena") ||
    message.includes("contraseña") ||
    message.includes("clave fiscal") ||
    message.includes("login") ||
    message.includes("invalid password") ||
    message.includes("invalid credential")
  );
}

function looksLikeAlreadyDelegatedError(message: string): boolean {
  return (
    message.includes("ya existe una autorizacion") ||
    message.includes("ya existe una autorización") ||
    message.includes("autorizacion vigente") ||
    message.includes("autorización vigente") ||
    message.includes("already delegated") ||
    message.includes("already exists") ||
    message.includes("ya fue delegado")
  );
}

function looksLikeAlreadyAcceptedError(message: string): boolean {
  return (
    message.includes("aceptada=true") ||
    message.includes("ya fue aceptada") ||
    message.includes("autorizacion aceptada") ||
    message.includes("autorización aceptada") ||
    message.includes("already accepted")
  );
}

function isWsfeCompatibleSystem(system: string | null | undefined): boolean {
  const normalized = normalizeComparableText(system);
  return (
    normalized.includes("WEB SERVICE") || normalized.includes("WEBSERVICE")
  );
}

function isMonotributoWsfeSystem(system: string | null | undefined): boolean {
  const normalized = normalizeComparableText(system);
  return (
    normalized.includes("MONOTRIBUTO") &&
    (normalized.includes("WEB SERVICE") || normalized.includes("WEBSERVICE"))
  );
}

function buildSalesPointDisplayName(name: string, pointOfSale: number): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 60) : `Punto de venta ${pointOfSale}`;
}

function mapAutomationError(params: {
  step:
    | "delegate_web_service"
    | "accept_web_service_delegation"
    | "list_sales_points"
    | "create_sales_point";
  error: unknown;
}): never {
  const sanitized = sanitizeArcaErrorMessage(params.error);
  const normalized = sanitized.toLowerCase();

  if (isAutomationTimeoutError(normalized)) {
    throw new ArcaConnectionError(
      "La automatización de ARCA tardó demasiado. Reintentá ingresando nuevamente las credenciales.",
      createDiagnostic({
        code: "automation_timeout",
        step: params.step,
      })
    );
  }

  if (looksLikeInvalidCredentialsError(normalized)) {
    throw new ArcaValidationError(
      "Las credenciales de ARCA no son válidas. Verificá el usuario/CUIT de acceso y la contraseña.",
      createDiagnostic({
        code: "invalid_credentials",
        step: params.step,
      })
    );
  }

  if (params.step === "delegate_web_service") {
    throw new ArcaValidationError(
      "No se pudo delegar WSFE al CUIT operador.",
      createDiagnostic({
        code: "delegate_web_service_failed",
        step: params.step,
        hint: "ARCA no completó la delegación del servicio WSFE desde el cliente hacia el operador global de Rhino.",
      })
    );
  }

  if (params.step === "accept_web_service_delegation") {
    throw new ArcaValidationError(
      "El operador no pudo aceptar la delegación WSFE.",
      createDiagnostic({
        code: "accept_web_service_delegation_failed",
        step: params.step,
      })
    );
  }

  if (params.step === "create_sales_point") {
    throw new ArcaValidationError(
      "No se pudo crear el punto de venta solicitado en ARCA.",
      createDiagnostic({
        code: "create_sales_point_failed",
        step: params.step,
      })
    );
  }

  throw new ArcaValidationError(
    "No se pudo consultar el estado del punto de venta en ARCA.",
    createDiagnostic({
      code: "list_sales_points_failed",
      step: params.step,
    })
  );
}

async function runAutomation<TData>(
  client: Afip,
  automation: string,
  params: Record<string, unknown>
): Promise<AutomationResponse<TData>> {
  return (await client.CreateAutomation(
    automation,
    params,
    true
  )) as AutomationResponse<TData>;
}

function decryptRequiredOperatorSecret(
  value: string | null,
  label: "usuario" | "contraseña" | "certificado" | "clave"
): string {
  if (!value) {
    throw new ArcaValidationError(
      `El perfil operador no tiene ${label} configurado.`,
      createDiagnostic({
        code: "operator_profile_invalid",
        step: "load-operator-profile",
      })
    );
  }

  return decryptSecret(value);
}

function ensureOperatorReady(profile: ArcaOperatorProfileRow) {
  if (!profile.wsfe_authorized_at) {
    throw new ArcaNotConfiguredError(
      "El operador ARCA todavía no tiene WSFE autorizado en este ambiente.",
      createDiagnostic({
        code: "authorize_operator_wsfe_failed",
        step: "operator_profile_ready",
        hint: "Desde /admin/arca hay que autorizar WSFE para el certificado del operador antes de onboardear clientes.",
      })
    );
  }
}

function buildAutomationTrace(params: {
  previous: OrganizationArcaDelegationRow | null;
  lastSuccessfulStep: DelegationStep;
  extra?: Record<string, unknown>;
}) {
  const previousTrace =
    params.previous?.automation_trace &&
    typeof params.previous.automation_trace === "object"
      ? (params.previous.automation_trace as Record<string, unknown>)
      : {};

  return {
    ...previousTrace,
    lastSuccessfulStep: params.lastSuccessfulStep,
    updatedAt: new Date().toISOString(),
    ...params.extra,
  };
}

function persistDelegationState(params: {
  organizationId: string;
  environment: ArcaEnvironment;
  previous: OrganizationArcaDelegationRow | null;
  status:
    | "pending"
    | "delegated"
    | "accepted"
    | "operator_ready"
    | "connected"
    | "error";
  operatorProfile: ArcaOperatorProfileRow;
  representedCuit: string;
  pointOfSale: number;
  salesPointProfile: AutomaticSalesPointProfile;
  lastSuccessfulStep: DelegationStep;
  patch?: Partial<OrganizationArcaDelegationRow>;
  lastError?: string | null;
  actor?: "current-user" | "system";
}) {
  const now = new Date().toISOString();
  const payload = {
    organization_id: params.organizationId,
    environment: params.environment,
    operator_profile_id: params.operatorProfile.id,
    represented_cuit: params.representedCuit,
    operator_cuit_snapshot: params.operatorProfile.operator_cuit,
    service: WSFE_SERVICE_ID,
    sales_point_profile: params.salesPointProfile,
    point_of_sale: params.pointOfSale,
    status: params.status,
    last_error: params.lastError ?? null,
    automation_trace: buildAutomationTrace({
      previous: params.previous,
      lastSuccessfulStep: params.lastSuccessfulStep,
      extra:
        params.patch?.automation_trace &&
        typeof params.patch.automation_trace === "object"
          ? (params.patch.automation_trace as Record<string, unknown>)
          : undefined,
    }),
    created_at: params.previous?.created_at ?? now,
    updated_at: now,
    delegation_requested_at:
      params.patch?.delegation_requested_at ??
      params.previous?.delegation_requested_at ??
      null,
    delegation_accepted_at:
      params.patch?.delegation_accepted_at ??
      params.previous?.delegation_accepted_at ??
      null,
    connected_at:
      params.patch?.connected_at ?? params.previous?.connected_at ?? null,
    last_tested_at:
      params.patch?.last_tested_at ?? params.previous?.last_tested_at ?? null,
  };

  return upsertOrganizationArcaDelegation(
    payload,
    params.actor ?? "current-user"
  );
}

async function delegateWsfe(params: {
  client: Afip;
  credentials: AutomationCredentials;
  delegateTo: string;
}) {
  try {
    await runAutomation(params.client, "delegate-web-service", {
      cuit: params.credentials.cuit,
      username: params.credentials.username,
      password: params.credentials.password,
      service: WSFE_SERVICE_ID,
      delegate_to: params.delegateTo,
    });
  } catch (error) {
    const sanitized = sanitizeArcaErrorMessage(error).toLowerCase();
    if (!looksLikeAlreadyDelegatedError(sanitized)) {
      mapAutomationError({
        step: "delegate_web_service",
        error,
      });
    }
  }
}

async function acceptDelegation(params: {
  client: Afip;
  operatorProfile: ArcaOperatorProfileRow;
  delegatedCuit: string;
}) {
  try {
    await runAutomation(params.client, "accept-web-service-delegation", {
      cuit: params.operatorProfile.operator_cuit,
      username: decryptRequiredOperatorSecret(
        params.operatorProfile.login_encrypted,
        "usuario"
      ),
      password: decryptRequiredOperatorSecret(
        params.operatorProfile.password_encrypted,
        "contraseña"
      ),
      service: WSFE_SERVICE_ID,
      delegated_cuit: params.delegatedCuit,
    });
  } catch (error) {
    const sanitized = sanitizeArcaErrorMessage(error).toLowerCase();
    if (!looksLikeAlreadyAcceptedError(sanitized)) {
      mapAutomationError({
        step: "accept_web_service_delegation",
        error,
      });
    }
  }
}

async function listSalesPoints(params: {
  client: Afip;
  credentials: AutomationCredentials;
}): Promise<ListedSalesPoint[]> {
  try {
    const response = await runAutomation<ListedSalesPoint[]>(
      params.client,
      "list-sales-points",
      {
        cuit: params.credentials.cuit,
        username: params.credentials.username,
        password: params.credentials.password,
      }
    );

    return normalizeListedSalesPoints(response.data);
  } catch (error) {
    mapAutomationError({
      step: "list_sales_points",
      error,
    });
  }
}

function validateExistingSalesPoint(params: {
  point: ListedSalesPoint;
  pointOfSale: number;
  salesPointProfile: AutomaticSalesPointProfile;
}) {
  if (params.point.deactivated) {
    throw new ArcaValidationError(
      `El punto de venta ${params.pointOfSale} existe en ARCA pero está dado de baja.`,
      createDiagnostic({
        code: "sales_point_deactivated",
        step: "validate-sales-point",
      })
    );
  }

  if (params.point.blocked) {
    throw new ArcaValidationError(
      `El punto de venta ${params.pointOfSale} existe en ARCA pero está bloqueado o no habilitado.`,
      createDiagnostic({
        code: "sales_point_blocked",
        step: "validate-sales-point",
      })
    );
  }

  if (
    params.salesPointProfile === "monotributo_wsfe" &&
    !isMonotributoWsfeSystem(params.point.system)
  ) {
    throw new ArcaValidationError(
      `El punto de venta ${params.pointOfSale} existe, pero no está configurado como Factura Electrónica Monotributo Web Services.`,
      createDiagnostic({
        code: "sales_point_incompatible",
        step: "validate-sales-point",
      })
    );
  }

  if (
    params.salesPointProfile === "existing_wsfe_point" &&
    !isWsfeCompatibleSystem(params.point.system)
  ) {
    throw new ArcaValidationError(
      `El punto de venta ${params.pointOfSale} existe, pero no es compatible con WSFE.`,
      createDiagnostic({
        code: "sales_point_incompatible",
        step: "validate-sales-point",
      })
    );
  }
}

async function createSalesPoint(params: {
  client: Afip;
  credentials: AutomationCredentials;
  pointOfSale: number;
  displayName: string;
}) {
  try {
    await runAutomation(params.client, "create-sales-point", {
      cuit: params.credentials.cuit,
      username: params.credentials.username,
      password: params.credentials.password,
      numero: params.pointOfSale,
      sistema: MONOTRIBUTO_WSFE_SYSTEM_CODE,
      nombreFantasia: params.displayName,
    });
  } catch (error) {
    mapAutomationError({
      step: "create_sales_point",
      error,
    });
  }
}

async function resolveSalesPoint(params: {
  client: Afip;
  credentials: AutomationCredentials;
  organizationName: string;
  pointOfSale: number;
  salesPointProfile: AutomaticSalesPointProfile;
}): Promise<ResolvedSalesPoint> {
  const salesPoints = await listSalesPoints({
    client: params.client,
    credentials: params.credentials,
  });
  const existingPoint = salesPoints.find(
    (point) => getListedSalesPointNumber(point) === params.pointOfSale
  );

  if (existingPoint) {
    validateExistingSalesPoint({
      point: existingPoint,
      pointOfSale: params.pointOfSale,
      salesPointProfile: params.salesPointProfile,
    });

    return { status: "existing" };
  }

  if (params.salesPointProfile !== "monotributo_wsfe") {
    throw new ArcaValidationError(
      `El punto de venta ${params.pointOfSale} no existe o no está habilitado en ARCA.`,
      createDiagnostic({
        code: "sales_point_not_found",
        step: "validate-sales-point",
      })
    );
  }

  await createSalesPoint({
    client: params.client,
    credentials: params.credentials,
    pointOfSale: params.pointOfSale,
    displayName: buildSalesPointDisplayName(
      params.organizationName,
      params.pointOfSale
    ),
  });

  const refreshedSalesPoints = await listSalesPoints({
    client: params.client,
    credentials: params.credentials,
  });
  const createdPoint = refreshedSalesPoints.find(
    (point) => getListedSalesPointNumber(point) === params.pointOfSale
  );

  if (!createdPoint) {
    throw new ArcaValidationError(
      `El punto de venta ${params.pointOfSale} no quedó disponible después de la automatización.`,
      createDiagnostic({
        code: "sales_point_not_found",
        step: "create-sales-point",
      })
    );
  }

  validateExistingSalesPoint({
    point: createdPoint,
    pointOfSale: params.pointOfSale,
    salesPointProfile: params.salesPointProfile,
  });

  return { status: "created" };
}

function normalizeOnboardingError(error: unknown): Error {
  if (
    error instanceof ArcaValidationError ||
    error instanceof ArcaConnectionError ||
    error instanceof ArcaNotConfiguredError
  ) {
    return error;
  }

  return new ArcaValidationError(
    sanitizeArcaErrorMessage(error) ||
      "No se pudo completar el onboarding delegado de ARCA.",
    createDiagnostic({
      code: "unexpected_error",
    })
  );
}

async function persistDelegatedOnboardingError(params: {
  organizationId: string;
  environment: ArcaEnvironment;
  error: Error;
}) {
  await updateOrganizationArcaDelegation(
    params.organizationId,
    params.environment,
    {
      status: "error",
      last_error: params.error.message,
      updated_at: new Date().toISOString(),
    },
    "current-user"
  );
  await updateOrganizationArcaSettings(params.organizationId, {
    status: "error",
    last_error: params.error.message,
    updated_at: new Date().toISOString(),
  });
}

export async function completeDelegatedArcaOnboarding(
  input: DelegatedArcaOnboardingInput
): Promise<DelegatedArcaOnboardingResult> {
  const parsedInput = parseDelegatedArcaOnboardingInput(input);
  const organization = await assertCanManageOrganizationArca(
    parsedInput.orgSlug
  );
  const organizationCuit = validateOrganizationCuit(organization.cuit);
  const representedCuit = validateOrganizationCuit(parsedInput.representedCuit);
  const existingSettings = await getOrganizationArcaSettingsByOrganizationId(
    organization.id
  );
  const operatorProfile = await getRequiredArcaOperatorProfile(
    parsedInput.environment
  );
  if (representedCuit !== organizationCuit) {
    throw new ArcaValidationError(
      "El CUIT representado debe coincidir con el CUIT configurado en la organización.",
      createDiagnostic({
        code: "represented_cuit_mismatch",
        step: "validate-cuit",
      })
    );
  }
  ensureOperatorReady(operatorProfile);

  const existingDelegation =
    await getOrganizationArcaDelegationByOrganizationIdAndEnvironment(
      organization.id,
      parsedInput.environment
    );
  const automationClient = createArcaAutomationClient();
  const customerCredentials: AutomationCredentials = {
    cuit: organizationCuit,
    username: parsedInput.login.trim(),
    password: parsedInput.password,
  };

  let delegation = await persistDelegationState({
    organizationId: organization.id,
    environment: parsedInput.environment,
    previous: existingDelegation,
    status: "operator_ready",
    operatorProfile,
    representedCuit: organizationCuit,
    pointOfSale: parsedInput.pointOfSale,
    salesPointProfile: parsedInput.salesPointProfile,
    lastSuccessfulStep: "operator_profile_ready",
    patch: {
      delegation_requested_at:
        existingDelegation?.delegation_requested_at ?? new Date().toISOString(),
    },
  });

  try {
    await delegateWsfe({
      client: automationClient,
      credentials: customerCredentials,
      delegateTo: operatorProfile.operator_cuit,
    });

    delegation = await persistDelegationState({
      organizationId: organization.id,
      environment: parsedInput.environment,
      previous: delegation,
      status: "delegated",
      operatorProfile,
      representedCuit: organizationCuit,
      pointOfSale: parsedInput.pointOfSale,
      salesPointProfile: parsedInput.salesPointProfile,
      lastSuccessfulStep: "delegate_web_service",
      patch: {
        delegation_requested_at:
          delegation.delegation_requested_at ?? new Date().toISOString(),
      },
    });

    await acceptDelegation({
      client: automationClient,
      operatorProfile,
      delegatedCuit: organizationCuit,
    });

    delegation = await persistDelegationState({
      organizationId: organization.id,
      environment: parsedInput.environment,
      previous: delegation,
      status: "accepted",
      operatorProfile,
      representedCuit: organizationCuit,
      pointOfSale: parsedInput.pointOfSale,
      salesPointProfile: parsedInput.salesPointProfile,
      lastSuccessfulStep: "accept_web_service_delegation",
      patch: {
        delegation_accepted_at:
          delegation.delegation_accepted_at ?? new Date().toISOString(),
      },
    });

    const salesPointStatus = (
      await resolveSalesPoint({
        client: automationClient,
        credentials: customerCredentials,
        organizationName: organization.name,
        pointOfSale: parsedInput.pointOfSale,
        salesPointProfile: parsedInput.salesPointProfile,
      })
    ).status;

    delegation = await persistDelegationState({
      organizationId: organization.id,
      environment: parsedInput.environment,
      previous: delegation,
      status: "accepted",
      operatorProfile,
      representedCuit: organizationCuit,
      pointOfSale: parsedInput.pointOfSale,
      salesPointProfile: parsedInput.salesPointProfile,
      lastSuccessfulStep: "validate_sales_point",
      patch: {
        automation_trace: {
          salesPointStatus,
        },
      } as Partial<OrganizationArcaDelegationRow>,
    });

    const { row: persistedSettings } = await persistOrganizationArcaSettings({
      organizationId: organization.id,
      organizationCuit: organization.cuit,
      environment: parsedInput.environment,
      mode: "delegated",
      pointOfSale: parsedInput.pointOfSale,
      certEncrypted: existingSettings?.cert_encrypted ?? null,
      keyEncrypted: existingSettings?.key_encrypted ?? null,
      certExpiresAt: existingSettings?.cert_expires_at ?? null,
      existingSettings,
      issuerLogoDataUrl: parsedInput.issuerLogoDataUrl,
      status: "pending",
      lastError: null,
      lastTestedAt: null,
      operatorProfileId: operatorProfile.id,
      delegatedToCuit: null,
      delegationRequestedAt: delegation.delegation_requested_at,
      delegationAcceptedAt: delegation.delegation_accepted_at,
    });

    delegation = await persistDelegationState({
      organizationId: organization.id,
      environment: parsedInput.environment,
      previous: delegation,
      status: "accepted",
      operatorProfile,
      representedCuit: organizationCuit,
      pointOfSale: parsedInput.pointOfSale,
      salesPointProfile: parsedInput.salesPointProfile,
      lastSuccessfulStep: "test_wsfe",
      patch: {
        last_tested_at: new Date().toISOString(),
      } as Partial<OrganizationArcaDelegationRow>,
    });

    const summaryBeforeTest = await getArcaSettingsSummary(parsedInput.orgSlug);
    const connectionTest = await testArcaConnectionWithCredentials({
      organizationCuit,
      settings: persistedSettings,
      cert: decryptRequiredOperatorSecret(
        operatorProfile.cert_encrypted,
        "certificado"
      ),
      key: decryptRequiredOperatorSecret(
        operatorProfile.key_encrypted,
        "clave"
      ),
      actor: "current-user",
      summary: summaryBeforeTest,
    });

    await persistDelegationState({
      organizationId: organization.id,
      environment: parsedInput.environment,
      previous: delegation,
      status: "connected",
      operatorProfile,
      representedCuit: organizationCuit,
      pointOfSale: parsedInput.pointOfSale,
      salesPointProfile: parsedInput.salesPointProfile,
      lastSuccessfulStep: "connected",
      patch: {
        connected_at: new Date().toISOString(),
        last_tested_at: connectionTest.testedAt,
      } as Partial<OrganizationArcaDelegationRow>,
    });

    return {
      status: "connected",
      message:
        salesPointStatus === "created"
          ? `ARCA quedó conectado. Se delegó WSFE al operador, se aceptó la delegación y se creó el punto de venta ${parsedInput.pointOfSale}.`
          : `ARCA quedó conectado. Se delegó WSFE al operador, se aceptó la delegación y se validó el punto de venta ${parsedInput.pointOfSale}.`,
      salesPointStatus,
      summary: connectionTest.summary,
      connectionTest,
    };
  } catch (error) {
    const normalizedError = normalizeOnboardingError(error);
    await persistDelegatedOnboardingError({
      organizationId: organization.id,
      environment: parsedInput.environment,
      error: normalizedError,
    });
    throw normalizedError;
  }
}
