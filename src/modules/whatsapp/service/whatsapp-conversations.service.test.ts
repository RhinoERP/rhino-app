import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWhatsAppInboxByOrgSlug } from "./whatsapp-conversations.service";

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  access: vi.fn(),
  enabled: vi.fn(),
  select: vi.fn(),
}));
vi.mock("../server/conversation-control", () => ({
  getWhatsAppUserAccess: db.access,
}));
vi.mock("../server/access", () => ({ assertWhatsAppEnabled: db.enabled }));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({ from: (table: string) => new Query(table) }),
}));

class Query implements PromiseLike<unknown> {
  private rows: Record<string, unknown>[];
  private readonly table: string;
  constructor(table: string) {
    this.table = table;
    this.rows = [...(db.tables[table] ?? [])];
  }
  select(columns: string) {
    db.select(this.table, columns);
    return this;
  }
  eq(key: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[key] === value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.rows = this.rows.filter((row) => values.includes(row[key]));
    return this;
  }
  like(key: string, value: string) {
    this.rows = this.rows.filter((row) =>
      String(row[key]).startsWith(value.slice(0, -1))
    );
    return this;
  }
  order(key: string, options: { ascending: boolean }) {
    this.rows.sort(
      (a, b) =>
        String(a[key]).localeCompare(String(b[key])) *
        (options.ascending ? 1 : -1)
    );
    return this;
  }
  limit(count: number) {
    this.rows = this.rows.slice(0, count);
    return this;
  }
  // biome-ignore lint/suspicious/noThenProperty: Supabase builders implement PromiseLike.
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(
      onfulfilled,
      onrejected
    );
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  db.access.mockResolvedValue({
    organization: { id: "org", whatsapp_sandbox_enabled: true },
  });
  db.tables = {
    whatsapp_conversations: [
      {
        id: "chat",
        organization_id: "org",
        integration_id: "integration",
        customer_phone: "54911",
        customer_id: "customer",
        status: "HANDOFF",
        assigned_user_id: "operator",
        human_claimed_at: "2026-11-06T20:00:00Z",
        control_version: 3,
        handoff_reason: "Necesita atención",
        current_pre_sale_id: null,
        last_message_at: "2026-11-06T20:00:00Z",
        pending_order_action: { secret: "private" },
      },
    ],
    customers: [
      { id: "customer", organization_id: "org", fantasy_name: "Cliente" },
    ],
    whatsapp_messages: [
      {
        conversation_id: "chat",
        organization_id: "org",
        direction: "INBOUND",
        content: "Hola",
        created_at: "2026-11-06T20:00:00Z",
        payload: { secret: "private" },
      },
    ],
    whatsapp_outbox: [
      {
        conversation_id: "chat",
        organization_id: "org",
        status: "SENDING",
        text: "private draft",
      },
    ],
  };
});

describe("human control inbox DTO", () => {
  it("requires a read-authorized organization and exposes control without raw state", async () => {
    const [chat] = await getWhatsAppInboxByOrgSlug("rhino");
    expect(db.access).toHaveBeenCalledWith("rhino", "whatsapp.read");
    expect(db.enabled).toHaveBeenCalledWith("org");
    expect(chat).toMatchObject({
      id: "chat",
      controlVersion: 3,
      humanClaimedAt: "2026-11-06T20:00:00Z",
      assignedUserId: "operator",
      deliveryBlock: "SENDING",
      customerName: "Cliente",
      lastMessage: { content: "Hola" },
    });
    expect(JSON.stringify(chat)).not.toContain("private");
    expect(db.select).toHaveBeenCalledWith(
      "whatsapp_outbox",
      "conversation_id, status"
    );
  });
  it.each([
    true,
    false,
  ])("UNKNOWN takes precedence regardless of row order (%s)", async (reverse) => {
    db.tables.whatsapp_outbox.push({
      conversation_id: "chat",
      organization_id: "org",
      status: "UNKNOWN",
    });
    if (reverse) {
      db.tables.whatsapp_outbox.reverse();
    }
    expect((await getWhatsAppInboxByOrgSlug("rhino"))[0].deliveryBlock).toBe(
      "UNKNOWN"
    );
  });
  it("ignores resolved commands and other organizations, including commands with the same chat ID", async () => {
    db.tables.whatsapp_outbox = [
      {
        conversation_id: "chat",
        organization_id: "foreign-org",
        status: "UNKNOWN",
      },
      { conversation_id: "chat", organization_id: "org", status: "SENT" },
      {
        conversation_id: "different-chat",
        organization_id: "org",
        status: "UNKNOWN",
      },
    ];
    db.tables.whatsapp_conversations.push({
      ...db.tables.whatsapp_conversations[0],
      id: "private-chat",
      organization_id: "foreign-org",
    });
    const chats = await getWhatsAppInboxByOrgSlug("rhino");
    expect(chats).toHaveLength(1);
    expect(chats[0].deliveryBlock).toBeNull();
  });
  it("refuses privileged reads after permission or module access fails", async () => {
    db.access.mockRejectedValueOnce(new Error("Sin acceso"));
    await expect(getWhatsAppInboxByOrgSlug("rhino")).rejects.toThrow(
      "Sin acceso"
    );
    expect(db.select).not.toHaveBeenCalled();
    db.enabled.mockRejectedValueOnce(new Error("Módulo deshabilitado"));
    await expect(getWhatsAppInboxByOrgSlug("rhino")).rejects.toThrow(
      "Módulo deshabilitado"
    );
    expect(db.select).not.toHaveBeenCalled();
  });
});
