import "server-only";

import {
  ArcaConnectionError,
  ArcaNotConfiguredError,
  sanitizeArcaErrorMessage,
} from "../errors";
import type {
  ArcaConnectionServerStatus,
  ArcaConnectionTestResult,
} from "../types";
import { validateOrganizationCuit } from "../validation";
import { assertCanManageOrganizationArca } from "./access";
import { getArcaClientForOrganization } from "./client-factory";
import {
  getOrganizationArcaSettingsByOrganizationId,
  updateOrganizationArcaSettings,
} from "./repository";
import { getArcaSettingsSummary } from "./settings.service";

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

export async function testArcaConnection(
  orgSlug: string
): Promise<ArcaConnectionTestResult> {
  const organization = await assertCanManageOrganizationArca(orgSlug);
  const existingSettings = await getOrganizationArcaSettingsByOrganizationId(
    organization.id
  );

  if (!existingSettings) {
    throw new ArcaNotConfiguredError();
  }

  const testedAt = new Date().toISOString();

  try {
    validateOrganizationCuit(organization.cuit);

    const client = await getArcaClientForOrganization(orgSlug, {
      actor: "current-user",
    });
    const voucherTypes = await client.ElectronicBilling.getVoucherTypes();

    let serverStatus: ArcaConnectionServerStatus | undefined;

    try {
      serverStatus = sanitizeServerStatus(
        await client.ElectronicBilling.getServerStatus()
      );
    } catch {
      serverStatus = undefined;
    }

    await updateOrganizationArcaSettings(organization.id, {
      status: "connected",
      last_tested_at: testedAt,
      last_error: null,
      updated_at: testedAt,
    });

    const summary = await getArcaSettingsSummary(orgSlug);
    const voucherTypesCount = Array.isArray(voucherTypes)
      ? voucherTypes.length
      : undefined;

    return {
      testedAt,
      status: "connected",
      message:
        voucherTypesCount && voucherTypesCount > 0
          ? `Conexión ARCA validada correctamente. WSFE respondió ${voucherTypesCount} tipos de comprobante.`
          : "Conexión ARCA validada correctamente.",
      voucherTypesCount,
      serverStatus,
      summary,
    };
  } catch (error) {
    const sanitizedError = sanitizeArcaErrorMessage(error);

    await updateOrganizationArcaSettings(organization.id, {
      status: "error",
      last_tested_at: testedAt,
      last_error: sanitizedError,
      updated_at: testedAt,
    });

    throw new ArcaConnectionError(
      sanitizedError || "No se pudo validar la conexión con ARCA."
    );
  }
}
