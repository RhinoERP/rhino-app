import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  inboxResponse,
  listInbox,
  markInboxChatRead,
  playInboxAudio,
  readInboxHistory,
} from "./inbox";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  download: vi.fn(),
}));

vi.mock("./conversation-control", () => ({
  getWhatsAppUserAccess: mocks.access,
  WhatsAppControlAccessError: class extends Error {},
}));
vi.mock("./supabase-admin", () => ({
  createWhatsAppAdminClient: () => ({
    rpc: mocks.rpc,
    storage: { from: () => ({ download: mocks.download }) },
  }),
}));

const chat = "00000000-0000-4000-8000-000000000001";
const message = "00000000-0000-4000-8000-000000000002";
const at = "2026-11-07T13:21:00.000321+00:00";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    organization: { id: "tenant" },
    userId: "actor",
  });
});

describe("WhatsApp inbox HTTP", () => {
  it("uses session scope, ignores supplied tenant and strips internal fields", async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: {
        attentionCount: 1,
        rows: [
          {
            id: chat,
            at,
            lastMessageAt: at,
            customerName: null,
            customerPhone: "54911",
            status: "ACTIVE",
            assignedUserId: null,
            assignedName: null,
            humanClaimedAt: null,
            unread: 1,
            preview: {
              direction: "INBOUND",
              type: "TEXT",
              content: "Hola",
              payload: "hidden",
            },
            private_state: "hidden",
          },
        ],
      },
    });
    const response = await inboxResponse(() =>
      listInbox("rhino", new URLSearchParams({ organizationId: "foreign" }))
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const result = await response.json();
    expect(result.rows[0].preview.content).toBe("Hola");
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(mocks.access).toHaveBeenCalledWith("rhino", "whatsapp.read");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "list_whatsapp_inbox",
      expect.objectContaining({
        p_org: "tenant",
        p_actor: "actor",
        p_filter: "all",
      })
    );
  });

  it("validates the entire cursor before authorizing a forward page", async () => {
    const response = await inboxResponse(() =>
      readInboxHistory(
        "rhino",
        chat,
        new URLSearchParams({ at, direction: "after" })
      )
    );
    expect(response.status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("does not disclose internal Postgres errors or use a caller's actor for a read", async () => {
    mocks.rpc.mockResolvedValue({
      error: { code: "42501", message: "hidden database state" },
      data: null,
    });
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ messageId: message, actor: "other" }),
    });
    const response = await inboxResponse(() =>
      markInboxChatRead("rhino", chat, request)
    );
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("hidden");
    expect(mocks.rpc).toHaveBeenCalledWith("mark_whatsapp_inbox_read", {
      p_actor: "actor",
      p_org: "tenant",
      p_chat: chat,
      p_message: message,
    });
  });

  it("checks scope before touching storage and proxies only authorized bytes", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: null, data: null });
    expect((await playInboxAudio("rhino", chat, message)).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({
      error: null,
      data: { path: "private/blob", mime: "audio/ogg" },
    });
    mocks.download.mockResolvedValue({
      error: null,
      data: new Blob(["ogg fixture"]),
    });
    const response = await playInboxAudio("rhino", chat, message);
    expect(response.headers.get("content-type")).toBe("audio/ogg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("ogg fixture");
  });
});
