import "server-only";

import type Afip from "@afipsdk/afip.js";
import {
  ArcaConnectionError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import type {
  ArcaErrorDiagnostic,
  ArcaOperatorProfileRow,
  AutomaticSalesPointProfile,
  DelegatedArcaOnboardingInput,
  DelegatedArcaOnboardingResult,
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
  getOrganizationArcaSettingsByOrganizationId,
  updateOrganizationArcaSettings,
} from "./repository";
import { decryptSecret } from "./secrets";
import { persistOrganizationArcaSettings } from "./settings.service";

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
  blockedAt?: string | null;
  used?: boolean;
};

type ResolvedSalesPoint = {
  status: "existing" | "created";
  record: ListedSalesPoint;
};

const WSFE_SERVICE_ID = "wsfe";
const MONOTRIBUTO_WSFE_SYSTEM_CODE = "MAW";

function createDiagnostic(params: {
  code: ArcaErrorDiagnostic["code"];
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

    if (Object.keys(candidate).length === 0) {
      return [];
    }

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
        hint: "La automatización respondió, pero el payload no tenía una lista de puntos de venta en un formato reconocido.",
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
  const trimmedName = name.trim();

  if (trimmedName) {
    return trimmedName.slice(0, 60);
  }

  return `Punto de venta ${pointOfSale}`;
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

function getAutomationStepLabel(
  step:
    | "delegate_web_service"
    | "accept_web_service_delegation"
    | "authorize_operator_wsfe"
    | "list_sales_points"
    | "create_sales_point"
): string {
  switch (step) {
    case "delegate_web_service":
      return "delegate-web-service";
    case "accept_web_service_delegation":
      return "accept-web-service-delegation";
    case "authorize_operator_wsfe":
      return "authorize-operator-wsfe";
    case "list_sales_points":
      return "list-sales-points";
    case "create_sales_point":
      return "create-sales-point";
    default:
      return "automation";
  }
}

function toMappedAutomationError(params: {
  step:
    | "delegate_web_service"
    | "accept_web_service_delegation"
    | "authorize_operator_wsfe"
    | "list_sales_points"
    | "create_sales_point";
  error: unknown;
}): ArcaValidationError | ArcaConnectionError {
  const sanitized = sanitizeArcaErrorMessage(params.error);
  const normalized = sanitized.toLowerCase();
  const stepLabel = getAutomationStepLabel(params.step);

  if (isAutomationTimeoutError(normalized)) {
    return new ArcaConnectionError(
      "La automatización de ARCA tardó demasiado. Reintentá ingresando nuevamente las credenciales.",
      createDiagnostic({
        code: "automation_timeout",
        step: stepLabel,
        hint:
          params.step === "list_sales_points"
            ? "El timeout ocurrió al consultar los puntos de venta, antes de validar o crear el punto solicitado."
            : "ARCA o Afip SDK no completaron la automatización dentro del tiempo esperado.",
      })
    );
  }

  if (looksLikeInvalidCredentialsError(normalized)) {
    return new ArcaValidationError(
      "Las credenciales de ARCA no son válidas. Verificá el CUIT o usuario de acceso y la contraseña.",
      createDiagnostic({
        code: "invalid_credentials",
        step: stepLabel,
        hint: "ARCA rechazó el login usado para automatizar. El usuario, CUIT o contraseña no fueron aceptados para ese ambiente.",
      })
    );
  }

  if (params.step === "delegate_web_service") {
    return new ArcaValidationError(
      "No se pudo delegar WSFE al CUIT operador.",
      createDiagnostic({
        code: "delegate_web_service_failed",
        step: stepLabel,
        hint: "ARCA no completó la delegación del servicio WSFE desde el cliente hacia el operador de Rhino.",
      })
    );
  }

  if (params.step === "accept_web_service_delegation") {
    return new ArcaValidationError(
      "El operador no pudo aceptar la delegación WSFE.",
      createDiagnostic({
        code: "accept_web_service_delegation_failed",
        step: stepLabel,
        hint: "La delegación pudo haberse creado del lado del cliente, pero el operador no logró aceptarla en ARCA.",
      })
    );
  }

  if (params.step === "authorize_operator_wsfe") {
    return new ArcaValidationError(
      "No se pudo autorizar WSFE para el certificado del operador.",
      createDiagnostic({
        code: "authorize_operator_wsfe_failed",
        step: stepLabel,
        hint: "La delegación pudo existir, pero ARCA no dejó vinculado WSFE al certificado del operador.",
      })
    );
  }

  if (params.step === "create_sales_point") {
    return new ArcaValidationError(
      "No se pudo crear el punto de venta solicitado en ARCA.",
      createDiagnostic({
        code: "create_sales_point_failed",
        step: stepLabel,
        hint: "ARCA respondió con error al intentar crear el punto de venta automático para el perfil seleccionado.",
      })
    );
  }

  return new ArcaValidationError(
    "No se pudo consultar el estado del punto de venta en ARCA. El fallo ocurrió al listar los puntos de venta antes de validar o crear el solicitado.",
    createDiagnostic({
      code: "list_sales_points_failed",
      step: stepLabel,
      hint: "La delegación pudo haberse completado. El error vino después, cuando ARCA/Afip SDK intentaron listar los puntos de venta del CUIT.",
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
    throw toMappedAutomationError({
      step: "delegate_web_service",
      error,
    });
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
    throw toMappedAutomationError({
      step: "accept_web_service_delegation",
      error,
    });
  }
}

async function authorizeOperatorWsfe(params: {
  client: Afip;
  operatorProfile: ArcaOperatorProfileRow;
  environment: "dev" | "prod";
}) {
  try {
    const automationName =
      params.environment === "prod"
        ? "auth-web-service-prod"
        : "auth-web-service-dev";

    await runAutomation(params.client, automationName, {
      cuit: params.operatorProfile.operator_cuit,
      username: decryptRequiredOperatorSecret(
        params.operatorProfile.login_encrypted,
        "usuario"
      ),
      password: decryptRequiredOperatorSecret(
        params.operatorProfile.password_encrypted,
        "contraseña"
      ),
      alias: params.operatorProfile.cert_alias,
      service: WSFE_SERVICE_ID,
    });
  } catch (error) {
    throw toMappedAutomationError({
      step: "authorize_operator_wsfe",
      error,
    });
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
    throw toMappedAutomationError({
      step: "list_sales_points",
      error,
    });
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
    throw toMappedAutomationError({
      step: "create_sales_point",
      error,
    });
  }
}

function validateExistingSalesPoint(params: {
  point: ListedSalesPoint;
  pointOfSale: number;
  salesPointProfile: AutomaticSalesPointProfile;
}): ListedSalesPoint {
  if (params.point.deactivated) {
    throw new ArcaValidationError(
      `El punto de venta ${params.pointOfSale} existe en ARCA pero está dado de baja.`,
      createDiagnostic({
        code: "sales_point_deactivated",
        step: "validate-sales-point",
        hint: "ARCA informó el punto de venta, pero figura dado de baja y no sirve para emitir.",
      })
    );
  }

  if (params.point.blocked) {
    throw new ArcaValidationError(
      `El punto de venta ${params.pointOfSale} existe en ARCA pero está bloqueado o no habilitado.`,
      createDiagnostic({
        code: "sales_point_blocked",
        step: "validate-sales-point",
        hint: "El punto existe, pero ARCA lo reporta bloqueado o sin habilitación efectiva.",
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
        hint: "El número existe en ARCA, pero el sistema asignado no coincide con Monotributo WSFE.",
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
        hint: "El número existe en ARCA, pero no está asociado a un sistema compatible con WSFE.",
      })
    );
  }

  return params.point;
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
    return {
      status: "existing",
      record: validateExistingSalesPoint({
        point: existingPoint,
        pointOfSale: params.pointOfSale,
        salesPointProfile: params.salesPointProfile,
      }),
    };
  }

  if (params.salesPointProfile !== "monotributo_wsfe") {
    throw new ArcaValidationError(
      `El punto de venta ${params.pointOfSale} no existe o no está habilitado en ARCA.`,
      createDiagnostic({
        code: "sales_point_not_found",
        step: "validate-sales-point",
        hint: "Para el perfil seleccionado no intentamos crearlo. ARCA no devolvió ese número como punto de venta habilitado.",
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
        hint: "La creación no dejó al punto visible en la consulta posterior de ARCA. Puede haber demorado en propagarse o haber fallado aguas arriba.",
      })
    );
  }

  return {
    status: "created",
    record: validateExistingSalesPoint({
      point: createdPoint,
      pointOfSale: params.pointOfSale,
      salesPointProfile: params.salesPointProfile,
    }),
  };
}

function normalizeOnboardingError(error: unknown): Error {
  if (
    error instanceof ArcaValidationError ||
    error instanceof ArcaConnectionError
  ) {
    return error;
  }

  const sanitized = sanitizeArcaErrorMessage(error);
  return new ArcaValidationError(
    sanitized || "No se pudo completar el onboarding delegado de ARCA.",
    createDiagnostic({
      code: "unexpected_error",
      hint: "El flujo falló con un error no clasificado. Revisá el mensaje sanitizado y reintentá.",
    })
  );
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
        hint: "Completá el perfil operador en /admin/arca antes de delegar WSFE para una organización.",
      })
    );
  }

  return decryptSecret(value);
}

async function persistDelegatedOnboardingError(params: {
  organizationId: string;
  error: Error;
}) {
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
  const existingSettings = await getOrganizationArcaSettingsByOrganizationId(
    organization.id
  );
  let representedCuit: string;
  let organizationCuit: string;

  try {
    representedCuit = validateOrganizationCuit(parsedInput.representedCuit);
  } catch (error) {
    if (error instanceof ArcaValidationError) {
      throw new ArcaValidationError(error.message, {
        code: "invalid_organization_cuit",
        step: "validate-cuit",
        hint: "El CUIT representado no pasó la validación local antes de llamar a ARCA.",
      });
    }

    throw error;
  }

  try {
    organizationCuit = validateOrganizationCuit(organization.cuit);
  } catch (error) {
    if (error instanceof ArcaValidationError) {
      throw new ArcaValidationError(error.message, {
        code: organization.cuit?.trim()
          ? "invalid_organization_cuit"
          : "missing_organization_cuit",
        step: "validate-cuit",
        hint: "La organización debe tener un CUIT válido porque la emisión posterior lo reutiliza como fuente de verdad.",
      });
    }

    throw error;
  }

  if (representedCuit !== organizationCuit) {
    throw new ArcaValidationError(
      "El CUIT representado debe coincidir con el CUIT configurado en la organización.",
      createDiagnostic({
        code: "represented_cuit_mismatch",
        step: "validate-cuit",
        hint: "El flujo de emisión posterior usa el CUIT guardado en la organización, por eso el onboarding bloquea CUITs distintos.",
      })
    );
  }

  const operatorProfile = await getRequiredArcaOperatorProfile(
    parsedInput.environment
  );
  const automationClient = createArcaAutomationClient();
  const customerCredentials: AutomationCredentials = {
    cuit: representedCuit,
    username: parsedInput.login.trim(),
    password: parsedInput.password,
  };

  await delegateWsfe({
    client: automationClient,
    credentials: customerCredentials,
    delegateTo: operatorProfile.operator_cuit,
  });

  await acceptDelegation({
    client: automationClient,
    operatorProfile,
    delegatedCuit: representedCuit,
  });

  await authorizeOperatorWsfe({
    client: automationClient,
    operatorProfile,
    environment: parsedInput.environment,
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

  const now = new Date().toISOString();
  const { row: persistedSettings, summary: persistedSummary } =
    await persistOrganizationArcaSettings({
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
      delegatedToCuit: operatorProfile.operator_cuit,
      delegationRequestedAt: now,
      delegationAcceptedAt: now,
    });

  try {
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
      summary: persistedSummary,
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
      error: normalizedError,
    });
    throw normalizedError;
  }
}
