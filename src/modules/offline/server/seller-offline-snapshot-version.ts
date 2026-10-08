import { createHash } from "node:crypto";
import type { SellerOfflineSnapshotV1 } from "../contracts/seller-offline-snapshot";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

export function getSellerOfflineSnapshotEtag(
  snapshot: SellerOfflineSnapshotV1
): string {
  const {
    expiresAt: _,
    generatedAt: __,
    snapshotId: ___,
    ...content
  } = snapshot;
  const digest = createHash("sha256")
    .update(JSON.stringify(canonicalize(content)))
    .digest("base64url");
  return `"${digest}"`;
}

export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) {
    return false;
  }
  return header
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value === etag);
}
