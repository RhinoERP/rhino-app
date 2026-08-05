import { createHash } from "node:crypto";

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, canonicalize(entry)] as const)
      .sort(([left], [right]) => left.localeCompare(right));

    return Object.fromEntries(entries);
  }

  return value;
};

export const normalizeTreasuryPayload = <T>(payload: T): T =>
  canonicalize(payload) as T;

export const hashTreasuryPayload = (payload: unknown): string => {
  const normalized = normalizeTreasuryPayload(payload);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
};
