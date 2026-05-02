import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ArcaConfigurationError, ArcaValidationError } from "../errors";

type EncryptedSecretPayloadV1 = {
  v: 1;
  alg: "aes-256-gcm";
  kid: "local";
  iv: string;
  tag: string;
  ciphertext: string;
};

export type ArcaSecretProvider = {
  encrypt(plainText: string): string;
  decrypt(payload: string): string;
};

let cachedProvider: ArcaSecretProvider | null = null;

export function assertArcaSecretsKey(): Buffer {
  const encodedMasterKey = process.env.ARCA_SECRETS_MASTER_KEY?.trim();

  if (!encodedMasterKey) {
    throw new ArcaConfigurationError(
      "Falta configurar ARCA_SECRETS_MASTER_KEY en el servidor."
    );
  }

  let key: Buffer;

  try {
    key = Buffer.from(encodedMasterKey, "base64");
  } catch {
    throw new ArcaConfigurationError(
      "ARCA_SECRETS_MASTER_KEY no tiene un formato base64 válido."
    );
  }

  if (key.length !== 32) {
    throw new ArcaConfigurationError(
      "ARCA_SECRETS_MASTER_KEY debe decodificar a 32 bytes exactos."
    );
  }

  return key;
}

class LocalAesGcmSecretProvider implements ArcaSecretProvider {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    this.key = key;
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const payload: EncryptedSecretPayloadV1 = {
      v: 1,
      alg: "aes-256-gcm",
      kid: "local",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };

    return JSON.stringify(payload);
  }

  decrypt(payload: string): string {
    let parsedPayload: EncryptedSecretPayloadV1;

    try {
      parsedPayload = JSON.parse(payload) as EncryptedSecretPayloadV1;
    } catch {
      throw new ArcaValidationError(
        "No se pudo descifrar el secreto ARCA almacenado."
      );
    }

    if (
      parsedPayload.v !== 1 ||
      parsedPayload.alg !== "aes-256-gcm" ||
      parsedPayload.kid !== "local"
    ) {
      throw new ArcaValidationError(
        "El formato del secreto ARCA almacenado no es compatible."
      );
    }

    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(parsedPayload.iv, "base64")
      );
      decipher.setAuthTag(Buffer.from(parsedPayload.tag, "base64"));
      const plainText = Buffer.concat([
        decipher.update(Buffer.from(parsedPayload.ciphertext, "base64")),
        decipher.final(),
      ]);

      return plainText.toString("utf8");
    } catch {
      throw new ArcaValidationError(
        "No se pudo descifrar el secreto ARCA almacenado."
      );
    }
  }
}

function getArcaSecretProvider(): ArcaSecretProvider {
  if (!cachedProvider) {
    cachedProvider = new LocalAesGcmSecretProvider(assertArcaSecretsKey());
  }

  return cachedProvider;
}

export function encryptSecret(secret: string): string {
  return getArcaSecretProvider().encrypt(secret);
}

export function decryptSecret(payload: string): string {
  return getArcaSecretProvider().decrypt(payload);
}
