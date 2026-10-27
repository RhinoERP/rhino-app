import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendWhatsAppText } from "./meta-cloud";

const input = {
  integrationId: "integration",
  conversationId: "conversation",
  phoneNumberId: "12345",
  recipient: "5491100000000",
  text: "Hola",
};

function database(organizationEnabled: boolean, conversationAvailable = true) {
  const rows: Record<string, unknown> = {
    whatsapp_integrations: { organization_id: "org", phone_number_id: "12345" },
    organizations: organizationEnabled ? { id: "org" } : null,
    whatsapp_conversations: conversationAvailable
      ? { id: "conversation" }
      : null,
  };
  return {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: rows[table], error: null })),
      };
      return query;
    }),
    rpc: vi.fn(async () => ({ error: null })),
  };
}

describe("WhatsApp outbound authorization", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_META_ACCESS_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
            status: 200,
          })
      )
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    [false, true],
    [true, false],
  ])("blocks Meta if the tenant is disabled or a human pauses during model execution", async (enabled, available) => {
    const db = database(enabled, available);
    await expect(
      sendWhatsAppText(db as unknown as SupabaseClient, input)
    ).rejects.toThrow("deshabilitado");
    expect(fetch).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("never sends a sandbox integration to Meta", async () => {
    await expect(
      sendWhatsAppText(database(true) as unknown as SupabaseClient, {
        ...input,
        phoneNumberId: "rhinos-local-simulator:test",
      })
    ).rejects.toThrow("integración");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends and records an authorized live response", async () => {
    const db = database(true);
    await expect(
      sendWhatsAppText(db as unknown as SupabaseClient, input)
    ).resolves.toBe("wamid.test");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith(
      "record_whatsapp_outbound_message",
      expect.objectContaining({ p_external_message_id: "wamid.test" })
    );
  });
});
