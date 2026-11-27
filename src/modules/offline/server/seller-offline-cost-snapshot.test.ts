import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptOfflineCostSnapshot,
  encryptOfflineCostSnapshot,
} from "./seller-offline-cost-snapshot";

const context = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  ownerUserId: "00000000-0000-4000-8000-000000000002",
  productId: "00000000-0000-4000-8000-000000000003",
  snapshotId: "00000000-0000-4000-8000-000000000004",
};

describe("offline cost snapshot encryption", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("encrypts and decrypts the exact cost for the matching context", () => {
    vi.stubEnv(
      "OFFLINE_COST_ENCRYPTION_KEY",
      Buffer.alloc(32, 7).toString("base64")
    );
    vi.stubEnv("OFFLINE_COST_ENCRYPTION_KEY_ID", "key-2026-01");
    const encrypted = encryptOfflineCostSnapshot(1234.56, context);

    expect(encrypted).toContain(".key-2026-01.");
    expect(decryptOfflineCostSnapshot(encrypted, context)).toBe(1234.56);
  });

  it("returns null when ciphertext, context, or key id does not match", () => {
    vi.stubEnv(
      "OFFLINE_COST_ENCRYPTION_KEY",
      Buffer.alloc(32, 7).toString("base64")
    );
    vi.stubEnv("OFFLINE_COST_ENCRYPTION_KEY_ID", "key-2026-01");
    const encrypted = encryptOfflineCostSnapshot(1234.56, context);
    if (!encrypted) {
      throw new Error("Expected encrypted cost");
    }

    expect(
      decryptOfflineCostSnapshot(encrypted, {
        ...context,
        productId: "00000000-0000-4000-8000-000000000005",
      })
    ).toBeNull();
    vi.stubEnv("OFFLINE_COST_ENCRYPTION_KEY_ID", "key-rotated");
    expect(decryptOfflineCostSnapshot(encrypted, context)).toBeNull();
  });

  it("does not capture cost when the encryption key is absent or invalid", () => {
    vi.stubEnv("OFFLINE_COST_ENCRYPTION_KEY", "invalid");
    expect(encryptOfflineCostSnapshot(10, context)).toBeNull();
    expect(encryptOfflineCostSnapshot(null, context)).toBeNull();
  });
});
