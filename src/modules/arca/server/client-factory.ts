import "server-only";

import Afip from "@afipsdk/afip.js";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  ArcaConfigurationError,
  ArcaNotConfiguredError,
  ArcaValidationError,
} from "../errors";
import type { ArcaClientActor } from "../types";
import { validateOrganizationCuit } from "../validation";
import { getOrganizationArcaSettingsByOrganizationId } from "./repository";
import { decryptSecret } from "./secrets";

function getAfipSdkAccessToken(): string {
  const accessToken = process.env.AFIP_SDK_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new ArcaConfigurationError(
      "Falta configurar AFIP_SDK_ACCESS_TOKEN en el servidor."
    );
  }

  return accessToken;
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

  const cuit = validateOrganizationCuit(organization.cuit);
  const settings = await getOrganizationArcaSettingsByOrganizationId(
    organization.id,
    actor
  );

  if (!(settings?.cert_encrypted && settings?.key_encrypted)) {
    throw new ArcaNotConfiguredError(
      "La organización no tiene certificado y clave ARCA guardados."
    );
  }

  const cert = decryptSecret(settings.cert_encrypted);
  const key = decryptSecret(settings.key_encrypted);

  return new Afip({
    CUIT: cuit,
    access_token: getAfipSdkAccessToken(),
    cert,
    key,
    production: settings.environment === "prod",
  });
}
