import "server-only";

import {
  ArcaConnectionError,
  ArcaNotConfiguredError,
  ArcaValidationError,
  sanitizeArcaErrorMessage,
} from "../errors";
import type {
  ArcaConnectionServerStatus,
  ArcaConnectionStatus,
  ArcaEnvironment,
  ArcaOperatorProfileRow,
  ArcaOperatorProfileSummary,
  ArcaOperatorProfilesByEnvironment,
  ArcaOperatorProfileTestResult,
  SaveArcaOperatorProfileInput,
} from "../types";
import {
  parseSaveArcaOperatorProfileInput,
  validateOrganizationCuit,
  validatePemPair,
} from "../validation";
import { assertCanManageArcaOperatorProfiles } from "./access";
import { createArcaClientFromCredentials } from "./client-factory";
import {
  getArcaOperatorProfileByEnvironment,
  updateArcaOperatorProfile,
  upsertArcaOperatorProfile,
} from "./repository";
import { decryptSecret, encryptSecret } from "./secrets";
import { toArcaStatus } from "./settings.service";

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

export function mapArcaOperatorProfileSummary(
  environment: ArcaEnvironment,
  profile: ArcaOperatorProfileRow | null
): ArcaOperatorProfileSummary {
  return {
    id: profile?.id ?? null,
    environment,
    operatorCuit: profile?.operator_cuit ?? null,
    certAlias: profile?.cert_alias ?? null,
    status: toArcaStatus(profile?.status),
    lastTestedAt: profile?.last_tested_at ?? null,
    lastError: profile?.last_error ?? null,
    certExpiresAt: profile?.cert_expires_at ?? null,
    hasCertificate: Boolean(profile?.cert_encrypted && profile?.key_encrypted),
    hasAutomationCredentials: Boolean(
      profile?.login_encrypted && profile?.password_encrypted
    ),
    isConfigured: Boolean(profile),
  };
}

function resolveOperatorCredentials(params: {
  existingProfile: ArcaOperatorProfileRow | null;
  login?: string;
  password?: string;
}) {
  let loginEncrypted = params.existingProfile?.login_encrypted ?? null;
  let passwordEncrypted = params.existingProfile?.password_encrypted ?? null;

  const hasNewLogin = Boolean(params.login?.trim());
  const hasNewPassword = Boolean(params.password?.trim());

  if (hasNewLogin || hasNewPassword) {
    if (!(hasNewLogin && hasNewPassword)) {
      throw new ArcaValidationError(
        "Si cambiás las credenciales del operador, debés informar usuario y contraseña juntos."
      );
    }

    const login = params.login?.trim();
    const password = params.password?.trim();

    if (!(login && password)) {
      throw new ArcaValidationError(
        "Si cambiás las credenciales del operador, debés informar usuario y contraseña juntos."
      );
    }

    loginEncrypted = encryptSecret(login);
    passwordEncrypted = encryptSecret(password);
  }

  if (!(loginEncrypted && passwordEncrypted)) {
    throw new ArcaValidationError(
      "El perfil operador necesita usuario y contraseña ARCA."
    );
  }

  return {
    loginEncrypted,
    passwordEncrypted,
  };
}

function resolveOperatorCertificate(params: {
  existingProfile: ArcaOperatorProfileRow | null;
  cert?: string;
  key?: string;
}) {
  let certEncrypted = params.existingProfile?.cert_encrypted ?? null;
  let keyEncrypted = params.existingProfile?.key_encrypted ?? null;
  let certExpiresAt = params.existingProfile?.cert_expires_at ?? null;

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
      "El perfil operador necesita certificado y clave privada."
    );
  }

  return {
    certEncrypted,
    keyEncrypted,
    certExpiresAt,
  };
}

export async function getArcaOperatorProfilesSummary(): Promise<ArcaOperatorProfilesByEnvironment> {
  await assertCanManageArcaOperatorProfiles();

  const [devProfile, prodProfile] = await Promise.all([
    getArcaOperatorProfileByEnvironment("dev"),
    getArcaOperatorProfileByEnvironment("prod"),
  ]);

  return {
    dev: mapArcaOperatorProfileSummary("dev", devProfile),
    prod: mapArcaOperatorProfileSummary("prod", prodProfile),
  };
}

export async function saveArcaOperatorProfile(
  input: SaveArcaOperatorProfileInput
): Promise<ArcaOperatorProfileSummary> {
  await assertCanManageArcaOperatorProfiles();

  const parsedInput = parseSaveArcaOperatorProfileInput(input);
  const existingProfile = await getArcaOperatorProfileByEnvironment(
    parsedInput.environment
  );
  const operatorCuit = validateOrganizationCuit(parsedInput.operatorCuit);
  const { loginEncrypted, passwordEncrypted } = resolveOperatorCredentials({
    existingProfile,
    login: parsedInput.login,
    password: parsedInput.password,
  });
  const { certEncrypted, keyEncrypted, certExpiresAt } =
    resolveOperatorCertificate({
      existingProfile,
      cert: parsedInput.cert,
      key: parsedInput.key,
    });
  const now = new Date().toISOString();

  try {
    const profile = await upsertArcaOperatorProfile({
      environment: parsedInput.environment,
      operator_cuit: operatorCuit,
      login_encrypted: loginEncrypted,
      password_encrypted: passwordEncrypted,
      cert_alias: parsedInput.certAlias.trim(),
      cert_encrypted: certEncrypted,
      key_encrypted: keyEncrypted,
      cert_expires_at: certExpiresAt,
      status: existingProfile?.status ?? "pending",
      last_error: existingProfile?.last_error ?? null,
      last_tested_at: existingProfile?.last_tested_at ?? null,
      created_at: existingProfile?.created_at ?? now,
      updated_at: now,
    });

    return mapArcaOperatorProfileSummary(parsedInput.environment, profile);
  } catch (error) {
    throw new ArcaValidationError(sanitizeArcaErrorMessage(error));
  }
}

export async function getRequiredArcaOperatorProfile(
  environment: ArcaEnvironment
): Promise<ArcaOperatorProfileRow> {
  const profile = await getArcaOperatorProfileByEnvironment(environment);

  if (!profile) {
    throw new ArcaNotConfiguredError(
      `No existe un perfil operador ARCA configurado para ${environment === "prod" ? "producción" : "desarrollo"}.`,
      {
        code: "operator_profile_missing",
        step: "load-operator-profile",
        hint: "Creá el perfil operador desde /admin/arca antes de intentar delegar WSFE para una organización.",
      }
    );
  }

  if (
    !(
      profile.operator_cuit &&
      profile.login_encrypted &&
      profile.password_encrypted &&
      profile.cert_alias &&
      profile.cert_encrypted &&
      profile.key_encrypted
    )
  ) {
    throw new ArcaNotConfiguredError(
      "El perfil operador ARCA está incompleto.",
      {
        code: "operator_profile_invalid",
        step: "load-operator-profile",
        hint: "El operador necesita CUIT, credenciales ARCA, alias de certificado y el par PEM cargado.",
      }
    );
  }

  return profile;
}

function decryptRequiredProfileSecret(
  value: string | null,
  field: "certificado" | "clave"
): string {
  if (!value) {
    throw new ArcaValidationError(
      `El perfil operador no tiene ${field} configurado.`
    );
  }

  return decryptSecret(value);
}

export function markArcaOperatorProfileTestStatus(params: {
  profile: ArcaOperatorProfileRow;
  status: ArcaConnectionStatus;
  testedAt: string;
  lastError: string | null;
}) {
  return updateArcaOperatorProfile(params.profile.id, {
    status: params.status,
    last_tested_at: params.testedAt,
    last_error: params.lastError,
    updated_at: params.testedAt,
  });
}

export async function testArcaOperatorProfile(
  environment: ArcaEnvironment
): Promise<ArcaOperatorProfileTestResult> {
  await assertCanManageArcaOperatorProfiles();

  const profile = await getRequiredArcaOperatorProfile(environment);
  const testedAt = new Date().toISOString();

  try {
    const client = createArcaClientFromCredentials({
      cuit: profile.operator_cuit,
      cert: decryptRequiredProfileSecret(profile.cert_encrypted, "certificado"),
      key: decryptRequiredProfileSecret(profile.key_encrypted, "clave"),
      environment,
    });
    const voucherTypes = await client.ElectronicBilling.getVoucherTypes();
    let rawServerStatus: unknown;

    try {
      rawServerStatus = await client.ElectronicBilling.getServerStatus();
    } catch {
      rawServerStatus = undefined;
    }
    const updatedProfile = await markArcaOperatorProfileTestStatus({
      profile,
      status: "connected",
      testedAt,
      lastError: null,
    });

    return {
      testedAt,
      status: "connected",
      message:
        Array.isArray(voucherTypes) && voucherTypes.length > 0
          ? `El perfil operador respondió correctamente y WSFE devolvió ${voucherTypes.length} tipos de comprobante.`
          : "El perfil operador respondió correctamente ante WSFE.",
      voucherTypesCount: Array.isArray(voucherTypes)
        ? voucherTypes.length
        : undefined,
      serverStatus: sanitizeServerStatus(rawServerStatus),
      summary: mapArcaOperatorProfileSummary(environment, updatedProfile),
    };
  } catch (error) {
    const sanitizedError = sanitizeArcaErrorMessage(error);
    await markArcaOperatorProfileTestStatus({
      profile,
      status: "error",
      testedAt,
      lastError: sanitizedError,
    });

    throw new ArcaConnectionError(
      sanitizedError || "No se pudo validar el perfil operador ARCA.",
      {
        code: "operator_profile_invalid",
        step: "test-operator-profile",
        hint: "Revisá CUIT, PEM, alias y que el certificado del operador tenga WSFE autorizado.",
      }
    );
  }
}
