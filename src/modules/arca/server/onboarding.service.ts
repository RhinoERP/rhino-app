import "server-only";

import {
  ArcaConnectionError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import type {
  ArcaClientActor,
  ArcaConnectionServerStatus,
  ArcaConnectionTestResult,
  ArcaSettingsSummary,
  OrganizationArcaSettingsRow,
} from "../types";
import { assertCanManageOrganizationArca } from "./access";
import {
  createArcaClientFromCredentials,
  resolveArcaOrganizationCredentials,
} from "./client-factory";
import {
  updateOrganizationArcaDelegation,
  updateOrganizationArcaSettings,
} from "./repository";
import { mapArcaSummary, toArcaEnvironment } from "./settings.service";

function sanitizeServerStatus(
  serverStatus: unknown
): ArcaConnectionServerStatus | undefined {
  if (!serverStatus || typeof serverStatus !== "object") {
    return;
  }

  const value = serverStatus as Record<string, unknown>;

  return {
    AppServer:
      typeof value.AppServer === "string" ? value.AppServer : undefined,
    DbServer: typeof value.DbServer === "string" ? value.DbServer : undefined,
    AuthServer:
      typeof value.AuthServer === "string" ? value.AuthServer : undefined,
  };
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

function normalizeSalesPointsPayload(salesPoints: unknown): unknown[] {
  if (Array.isArray(salesPoints)) {
    return salesPoints;
  }

  if (salesPoints) {
    return [salesPoints];
  }

  return [];
}

function extractSalesPointNumber(entry: unknown): number | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const directKeys = [
    "Nro",
    "PtoVenta",
    "PtoVta",
    "number",
    "ptoVenta",
    "pto_vta",
  ] as const;

  for (const key of directKeys) {
    const value = toPositiveInteger(record[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function hasConfiguredSalesPoint(
  salesPoints: unknown,
  pointOfSale: number
): boolean {
  return normalizeSalesPointsPayload(salesPoints).some(
    (entry) => extractSalesPointNumber(entry) === pointOfSale
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates WSFE and mirrors delegated status updates together.
export async function testArcaConnectionWithCredentials(params: {
  organizationCuit: string;
  settings: Pick<
    OrganizationArcaSettingsRow,
    "organization_id" | "environment" | "point_of_sale"
  >;
  cert: string;
  key: string;
  actor?: ArcaClientActor;
  summary: ArcaSettingsSummary;
}): Promise<ArcaConnectionTestResult> {
  const testedAt = new Date().toISOString();
  const actor = params.actor ?? "current-user";
  const environment = toArcaEnvironment(params.settings.environment);

  if (!environment) {
    throw new ArcaValidationError(
      "La configuración ARCA no tiene un ambiente válido."
    );
  }

  if (!params.settings.point_of_sale || params.settings.point_of_sale <= 0) {
    throw new ArcaValidationError(
      "La organización no tiene un punto de venta ARCA válido."
    );
  }

  try {
    const client = createArcaClientFromCredentials({
      cuit: params.organizationCuit,
      cert: params.cert,
      key: params.key,
      environment,
    });

    const [voucherTypes, wsfeSalesPoints] = await Promise.all([
      client.ElectronicBilling.getVoucherTypes(),
      client.ElectronicBilling.getSalesPoints(),
    ]);

    const pointOfSaleValidated = hasConfiguredSalesPoint(
      wsfeSalesPoints,
      params.settings.point_of_sale
    );

    if (!pointOfSaleValidated) {
      throw new ArcaConnectionError(
        "El punto de venta configurado no aparece habilitado en WSFE."
      );
    }

    let serverStatus: ArcaConnectionServerStatus | undefined;

    try {
      serverStatus = sanitizeServerStatus(
        await client.ElectronicBilling.getServerStatus()
      );
    } catch {
      serverStatus = undefined;
    }

    const updatedSettings = await updateOrganizationArcaSettings(
      params.settings.organization_id,
      {
        status: "connected",
        last_tested_at: testedAt,
        last_error: null,
        updated_at: testedAt,
      },
      actor
    );

    if (params.summary.usesDelegatedCredentials && params.summary.environment) {
      await updateOrganizationArcaDelegation(
        params.settings.organization_id,
        params.summary.environment,
        {
          status: "connected",
          last_tested_at: testedAt,
          last_error: null,
          connected_at: testedAt,
          updated_at: testedAt,
        },
        actor
      );
    }

    const voucherTypesCount = Array.isArray(voucherTypes)
      ? voucherTypes.length
      : undefined;
    const salesPointsCount =
      normalizeSalesPointsPayload(wsfeSalesPoints).length;

    return {
      testedAt,
      status: "connected",
      message:
        voucherTypesCount && voucherTypesCount > 0
          ? `Conexión ARCA validada correctamente. WSFE respondió ${voucherTypesCount} tipos de comprobante y confirmó el punto de venta ${params.settings.point_of_sale}.`
          : `Conexión ARCA validada correctamente. WSFE confirmó el punto de venta ${params.settings.point_of_sale}.`,
      voucherTypesCount,
      salesPointsCount,
      pointOfSaleValidated,
      serverStatus,
      summary: {
        ...params.summary,
        status: "connected",
        lastTestedAt: updatedSettings.last_tested_at ?? testedAt,
        lastError: null,
      },
    };
  } catch (error) {
    const sanitizedError = sanitizeArcaErrorMessage(error);

    await updateOrganizationArcaSettings(
      params.settings.organization_id,
      {
        status: "error",
        last_tested_at: testedAt,
        last_error: sanitizedError,
        updated_at: testedAt,
      },
      actor
    );

    if (params.summary.usesDelegatedCredentials && params.summary.environment) {
      await updateOrganizationArcaDelegation(
        params.settings.organization_id,
        params.summary.environment,
        {
          status: "error",
          last_tested_at: testedAt,
          last_error: sanitizedError,
          updated_at: testedAt,
        },
        actor
      );
    }

    throw new ArcaConnectionError(
      sanitizedError || "No se pudo validar la conexión con ARCA."
    );
  }
}

export async function testArcaConnection(
  orgSlug: string
): Promise<ArcaConnectionTestResult> {
  const organization = await assertCanManageOrganizationArca(orgSlug);
  const resolved = await resolveArcaOrganizationCredentials({
    organizationId: organization.id,
    organizationCuit: organization.cuit,
    actor: "system",
  });
  const operatorProfile = resolved.operatorProfile;

  return testArcaConnectionWithCredentials({
    organizationCuit: resolved.organizationCuit,
    settings: resolved.settings,
    cert: resolved.cert,
    key: resolved.key,
    actor: "current-user",
    summary: mapArcaSummary({
      organizationCuit: organization.cuit,
      settings: resolved.settings,
      operatorProfile,
      delegation: resolved.delegation,
    }),
  });
}
