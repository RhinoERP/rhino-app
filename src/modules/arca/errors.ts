import type { ArcaErrorDiagnostic } from "./types";

type ArcaErrorCode =
  | "arca_authorization_error"
  | "arca_configuration_error"
  | "arca_connection_error"
  | "arca_not_configured_error"
  | "arca_validation_error";

export class ArcaError extends Error {
  code: ArcaErrorCode;
  diagnostic?: ArcaErrorDiagnostic;

  constructor(
    code: ArcaErrorCode,
    message: string,
    diagnostic?: ArcaErrorDiagnostic
  ) {
    super(message);
    this.code = code;
    this.diagnostic = diagnostic;
    this.name = "ArcaError";
  }
}

export class ArcaAuthorizationError extends ArcaError {
  constructor(
    message = "No tenés permisos para administrar ARCA.",
    diagnostic?: ArcaErrorDiagnostic
  ) {
    super("arca_authorization_error", message, diagnostic);
    this.name = "ArcaAuthorizationError";
  }
}

export class ArcaConfigurationError extends ArcaError {
  constructor(message: string, diagnostic?: ArcaErrorDiagnostic) {
    super("arca_configuration_error", message, diagnostic);
    this.name = "ArcaConfigurationError";
  }
}

export class ArcaConnectionError extends ArcaError {
  constructor(message: string, diagnostic?: ArcaErrorDiagnostic) {
    super("arca_connection_error", message, diagnostic);
    this.name = "ArcaConnectionError";
  }
}

export class ArcaNotConfiguredError extends ArcaError {
  constructor(
    message = "La organización no tiene configuración ARCA guardada.",
    diagnostic?: ArcaErrorDiagnostic
  ) {
    super("arca_not_configured_error", message, diagnostic);
    this.name = "ArcaNotConfiguredError";
  }
}

export class ArcaValidationError extends ArcaError {
  constructor(message: string, diagnostic?: ArcaErrorDiagnostic) {
    super("arca_validation_error", message, diagnostic);
    this.name = "ArcaValidationError";
  }
}

const PEM_BLOCK_REGEX = /-----BEGIN [^-]+-----[\s\S]+?-----END [^-]+-----/g;
const BEARER_TOKEN_REGEX = /Bearer\s+[A-Za-z0-9._-]+/gi;
const ACCESS_TOKEN_ASSIGNMENT_REGEX =
  /(access_token\s*["']?\s*[:=]\s*["'])[^"']+(["'])/gi;
const CREDENTIAL_ASSIGNMENT_REGEX =
  /((?:username|password|alias|login|certAlias)\s*["']?\s*[:=]\s*["'])[^"']+(["'])/gi;
const JSON_CREDENTIAL_FIELD_REGEX =
  /("?(?:username|password|alias|login|certAlias)"?\s*:\s*")[^"]+(")/gi;

function toSerializableErrorPayload(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  if ("data" in error) {
    try {
      return JSON.stringify((error as { data?: unknown }).data);
    } catch {
      return null;
    }
  }

  return null;
}

export function sanitizeArcaErrorMessage(error: unknown): string {
  let baseMessage = "Error desconocido";

  if (error instanceof Error) {
    baseMessage = error.message;
  } else if (typeof error === "string") {
    baseMessage = error;
  }

  const serializedPayload = toSerializableErrorPayload(error);

  const sanitized = [baseMessage, serializedPayload]
    .filter(Boolean)
    .join(" - ")
    .replace(PEM_BLOCK_REGEX, "[PEM_REDACTED]")
    .replace(BEARER_TOKEN_REGEX, "Bearer [TOKEN_REDACTED]")
    .replace(ACCESS_TOKEN_ASSIGNMENT_REGEX, "$1[TOKEN_REDACTED]$2")
    .replace(CREDENTIAL_ASSIGNMENT_REGEX, "$1[REDACTED]$2")
    .replace(JSON_CREDENTIAL_FIELD_REGEX, "$1[REDACTED]$2")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized.slice(0, 500);
}

export function toArcaUserMessage(error: unknown): string {
  if (error instanceof ArcaError) {
    return error.message;
  }

  const sanitized = sanitizeArcaErrorMessage(error);
  return sanitized || "No se pudo completar la operación con ARCA.";
}

export function getArcaErrorDiagnostic(
  error: unknown
): ArcaErrorDiagnostic | undefined {
  if (error instanceof ArcaError) {
    return error.diagnostic;
  }

  const sanitized = sanitizeArcaErrorMessage(error);

  if (!sanitized || sanitized === "Error desconocido") {
    return;
  }

  return {
    code: "unexpected_error",
    hint: "El backend recibió un error no clasificado. Revisá el último mensaje sanitizado y reintentá.",
  };
}
