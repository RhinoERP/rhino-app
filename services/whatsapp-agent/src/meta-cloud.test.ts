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
    rpc: vi.fn(
      async (
        _name: string,
        _args: Record<string, unknown>
      ): Promise<{ data?: unknown; error: null }> => ({ error: null })
    ),
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

  it("retries an Argentine test recipient without 9 after explicit allowlist rejection", async () => {
    const db = database(true);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 131_030 } }), {
        status: 400,
      })
    );
    await expect(
      sendWhatsAppText(db as unknown as SupabaseClient, input)
    ).resolves.toBe("wamid.test");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.map(([, options]) => JSON.parse(String(options?.body)).to)
    ).toEqual(["5491100000000", "541100000000"]);
    expect(db.from).toHaveBeenCalledWith("whatsapp_conversations");
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 131_030, "541100000000"],
    [400, 131_030, "15550000000"],
    [400, 131_047, input.recipient],
    [401, 190, input.recipient],
  ])("does not retry unrelated rejections (%i, %i, %s)", async (status, code, recipient) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code } }), { status })
    );
    await expect(
      sendWhatsAppText(database(true) as unknown as SupabaseClient, {
        ...input,
        recipient,
      })
    ).rejects.toThrow(`código ${code}`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops after one canonical retry and reports the Meta code", async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { code: 131_030 } }), {
          status: 400,
        })
    );
    await expect(
      sendWhatsAppText(database(true) as unknown as SupabaseClient, input)
    ).rejects.toThrow("código 131030");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("persists uncertainty if the canonical retry loses its connection", async () => {
    const db = database(true);
    db.rpc.mockImplementation((name) =>
      Promise.resolve({
        data:
          name === "prepare_whatsapp_outbox"
            ? { status: "SENDING", text: "Saved response" }
            : true,
        error: null,
      })
    );
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 131_030 } }), {
          status: 400,
        })
      )
      .mockRejectedValueOnce(new Error("Connection lost"));
    await expect(
      sendWhatsAppText(db as unknown as SupabaseClient, {
        ...input,
        sourceMessageId: "source",
        jobId: "job",
        leaseToken: "lease",
      })
    ).rejects.toMatchObject({ code: "DELIVERY_UNKNOWN" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(db.rpc).toHaveBeenCalledWith(
      "complete_whatsapp_outbox",
      expect.objectContaining({ p_status: "UNKNOWN" })
    );
    expect(db.rpc).not.toHaveBeenCalledWith(
      "complete_whatsapp_outbox",
      expect.objectContaining({ p_status: "CANCELLED" })
    );
  });

  it("persists an uncertain result and never resends it automatically", async () => {
    const db = database(true);
    const durableInput = {
      ...input,
      sourceMessageId: "source",
      jobId: "job",
      leaseToken: "lease",
    };
    let status = "SENDING";
    db.rpc.mockImplementation((name, args) => {
      if (name === "prepare_whatsapp_outbox") {
        return Promise.resolve({
          data: { status, text: "Persisted response" },
          error: null,
        });
      }
      status = String(args.p_status);
      return Promise.resolve({ data: true, error: null });
    });
    vi.mocked(fetch).mockRejectedValue(new Error("Connection lost after send"));
    await expect(
      sendWhatsAppText(db as unknown as SupabaseClient, durableInput)
    ).rejects.toMatchObject({ code: "DELIVERY_UNKNOWN" });
    expect(status).toBe("UNKNOWN");
    await expect(
      sendWhatsAppText(db as unknown as SupabaseClient, durableInput)
    ).rejects.toMatchObject({ code: "DELIVERY_REVIEW" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends the stored response on a retry rather than replacing it", async () => {
    const db = database(true);
    db.rpc.mockImplementation((name) =>
      Promise.resolve({
        data:
          name === "prepare_whatsapp_outbox"
            ? { status: "SENDING", text: "Saved quote" }
            : true,
        error: null,
      })
    );
    await sendWhatsAppText(db as unknown as SupabaseClient, {
      ...input,
      text: "Regenerated quote",
      sourceMessageId: "source",
      jobId: "job",
      leaseToken: "lease",
    });
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).text.body
    ).toBe("Saved quote");
    expect(db.rpc).toHaveBeenCalledWith(
      "complete_whatsapp_outbox",
      expect.objectContaining({
        p_status: "SENT",
        p_external_message_id: "wamid.test",
      })
    );
  });
});
