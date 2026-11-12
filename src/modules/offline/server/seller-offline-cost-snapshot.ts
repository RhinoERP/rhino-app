import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

type CostSnapshotContext = {
  organizationId: string;
  ownerUserId: string;
  productId: string;
  snapshotId: string;
};

function readKey() {
  const encodedKey = process.env.OFFLINE_COST_ENCRYPTION_KEY;
  if (!encodedKey) {
    return null;
  }
  try {
    const key = Buffer.from(encodedKey, "base64");
    return key.length === 32
      ? { key, keyId: process.env.OFFLINE_COST_ENCRYPTION_KEY_ID || "primary" }
      : null;
  } catch {
    return null;
  }
}

function associatedData(context: CostSnapshotContext) {
  return Buffer.from(
    [
      context.organizationId,
      context.ownerUserId,
      context.snapshotId,
      context.productId,
    ].join(":"),
    "utf8"
  );
}

export function encryptOfflineCostSnapshot(
  cost: number | null | undefined,
  context: CostSnapshotContext
): string | null {
  const keyConfig = readKey();
  if (cost == null || !Number.isFinite(cost) || cost < 0 || !keyConfig) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyConfig.key, iv);
  cipher.setAAD(associatedData(context));
  const encrypted = Buffer.concat([
    cipher.update(String(cost), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    keyConfig.keyId,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptOfflineCostSnapshot(
  token: string | null | undefined,
  context: CostSnapshotContext
): number | null {
  const keyConfig = readKey();
  if (!(token && keyConfig)) {
    return null;
  }
  const [version, keyId, encodedIv, encodedTag, encodedValue, extra] =
    token.split(".");
  if (
    version !== VERSION ||
    keyId !== keyConfig.keyId ||
    !encodedIv ||
    !encodedTag ||
    !encodedValue ||
    extra !== undefined
  ) {
    return null;
  }
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      keyConfig.key,
      Buffer.from(encodedIv, "base64url")
    );
    decipher.setAAD(associatedData(context));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encodedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const cost = Number(decrypted);
    return Number.isFinite(cost) && cost >= 0 ? cost : null;
  } catch {
    return null;
  }
}
