import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./supabase-admin", () => ({ createWhatsAppAdminClient: () => db }));

import {
  assertWhatsAppOrderSchema,
  throwIfWhatsAppSchemaError,
  whatsappSchemaUpdateMessage,
} from "./order-schema";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {
    // Expected provider diagnostics are asserted below, not printed during tests.
  });
});
afterEach(() => vi.restoreAllMocks());

describe("WhatsApp rollout schema preflight", () => {
  it("only checks column availability and reads no customer data", async () => {
    const limit = vi.fn().mockResolvedValue({ error: null });
    const select = vi.fn().mockReturnValue({ limit });
    db.from.mockReturnValue({ select });
    await assertWhatsAppOrderSchema();
    expect(db.from.mock.calls.map(([table]) => table)).toEqual([
      "whatsapp_conversations",
      "conversation_carts",
      "sales_orders",
    ]);
    expect(limit.mock.calls).toEqual([[0], [0], [0]]);
  });
  it.each([
    "42703",
    "42P01",
    "PGRST204",
    "PGRST205",
    "PGRST202",
  ])("reports an incomplete rollout for %s without exposing provider diagnostics", async (code) => {
    db.from.mockReturnValue({
      select: () => ({
        limit: () =>
          Promise.resolve({
            error: {
              code,
              message: "column pending_order_action does not exist",
            },
          }),
      }),
    });
    await expect(assertWhatsAppOrderSchema()).rejects.toThrow(
      whatsappSchemaUpdateMessage
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("20261027000000"),
      expect.objectContaining({ code })
    );
  });
  it("does not describe authentication or connectivity failures as missing migrations", async () => {
    db.from.mockReturnValue({
      select: () => ({
        limit: () =>
          Promise.resolve({
            error: { code: "PGRST301", message: "Authentication failed" },
          }),
      }),
    });
    await expect(assertWhatsAppOrderSchema()).rejects.toThrow(
      "No se pudo comprobar"
    );
    expect(console.error).not.toHaveBeenCalled();
  });
  it("preserves normal conversation validation when its queries succeed", () => {
    expect(() => throwIfWhatsAppSchemaError(null)).not.toThrow();
  });
});
