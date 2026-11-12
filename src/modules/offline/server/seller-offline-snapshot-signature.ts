import { createHmac, timingSafeEqual } from "node:crypto";
import type { SellerOfflineSnapshotV1 } from "../contracts/seller-offline-snapshot";
import { getSellerOfflineSnapshotContentHash } from "./seller-offline-snapshot-version";

const SIGNATURE_VERSION = "v1";

type SignatureClaims = {
  contentHash: string;
  expiresAt: string;
  generatedAt: string;
  keyId: string;
  organizationId: string;
  ownerUserId: string;
  schemaVersion: number;
  snapshotId: string;
};

function readSigningKey() {
  const secret = process.env.OFFLINE_SNAPSHOT_SIGNING_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    return null;
  }
  return {
    keyId: process.env.OFFLINE_SNAPSHOT_SIGNING_KEY_ID || "primary",
    secret,
  };
}

function encodeClaims(claims: SignatureClaims) {
  return Buffer.from(JSON.stringify(claims)).toString("base64url");
}

function createMac(encodedClaims: string, secret: string) {
  return createHmac("sha256", secret).update(encodedClaims).digest();
}

export function signSellerOfflineSnapshot(
  snapshot: SellerOfflineSnapshotV1,
  snapshotId = snapshot.snapshotId
): string | null {
  const key = readSigningKey();
  if (!key) {
    return null;
  }

  const claims: SignatureClaims = {
    contentHash: getSellerOfflineSnapshotContentHash(snapshot),
    expiresAt: snapshot.expiresAt,
    generatedAt: snapshot.generatedAt,
    keyId: key.keyId,
    organizationId: snapshot.organizationId,
    ownerUserId: snapshot.ownerUserId,
    schemaVersion: snapshot.schemaVersion,
    snapshotId,
  };
  const encodedClaims = encodeClaims(claims);
  const mac = createMac(encodedClaims, key.secret).toString("base64url");
  return `${SIGNATURE_VERSION}.${encodedClaims}.${mac}`;
}

export function verifySellerOfflineSnapshotSignature(
  snapshot: SellerOfflineSnapshotV1,
  signature: string
): boolean {
  const [version, encodedClaims, encodedMac, extra] = signature.split(".");
  if (
    version !== SIGNATURE_VERSION ||
    !encodedClaims ||
    !encodedMac ||
    extra !== undefined
  ) {
    return false;
  }

  const key = readSigningKey();
  if (!key) {
    return false;
  }

  let claims: SignatureClaims;
  let receivedMac: Buffer;
  try {
    claims = JSON.parse(
      Buffer.from(encodedClaims, "base64url").toString("utf8")
    ) as SignatureClaims;
    receivedMac = Buffer.from(encodedMac, "base64url");
  } catch {
    return false;
  }

  const expectedMac = createMac(encodedClaims, key.secret);
  if (
    receivedMac.length !== expectedMac.length ||
    !timingSafeEqual(receivedMac, expectedMac)
  ) {
    return false;
  }

  return (
    claims.keyId === key.keyId &&
    claims.contentHash === getSellerOfflineSnapshotContentHash(snapshot) &&
    claims.expiresAt === snapshot.expiresAt &&
    claims.generatedAt === snapshot.generatedAt &&
    claims.organizationId === snapshot.organizationId &&
    claims.ownerUserId === snapshot.ownerUserId &&
    claims.schemaVersion === snapshot.schemaVersion &&
    claims.snapshotId === snapshot.snapshotId
  );
}
