import { beforeEach, describe, expect, it, vi } from "vitest";

const testDb = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  rpc: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("./supabase-admin", () => ({
  createWhatsAppAdminClient: () => ({
    from: (table: string) => new Query(testDb.tables[table] ?? []),
    rpc: testDb.rpc,
  }),
}));
vi.mock("@/modules/sales/service/sales.service", () => ({
  prepareWhatsAppPreSaleOrder: testDb.prepare,
}));

// Query semantics rather than call-order fixtures: tests fail on a missing tenant,
// integration, conversation, ordering, pagination or pending-cart filter.
class Query implements PromiseLike<unknown> {
  private rows: Record<string, unknown>[];
  constructor(rows: Record<string, unknown>[]) {
    this.rows = [...rows];
  }
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[key] === value);
    return this;
  }
  neq(key: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[key] !== value);
    return this;
  }
  lte(key: string, value: string) {
    this.rows = this.rows.filter((row) => String(row[key]) <= value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.rows = this.rows.filter((row) => values.includes(row[key]));
    return this;
  }
  order(key: string, options?: { ascending?: boolean }) {
    // Stable sorts applied in reverse priority are unnecessary for distinct timestamps here.
    this.rows.sort(
      (left, right) =>
        String(left[key]).localeCompare(String(right[key])) *
        (options?.ascending === false ? -1 : 1)
    );
    return this;
  }
  limit(count: number) {
    this.rows = this.rows.slice(0, count);
    return this;
  }
  range(start: number, end: number) {
    this.rows = this.rows.slice(start, end + 1);
    return this;
  }
  maybeSingle() {
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
  }
  single() {
    return this.maybeSingle();
  }
  // biome-ignore lint/suspicious/noThenProperty: Supabase builders intentionally implement PromiseLike.
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

import { executeCommercialTool } from "./commercial-tools";
import { getSimulationMessages } from "./simulation";

const org = "11111111-1111-4111-8111-111111111111";
const integration = "22222222-2222-4222-8222-222222222222";
const conversation = "33333333-3333-4333-8333-333333333333";
const source = "44444444-4444-4444-8444-444444444444";
const cartId = "55555555-5555-4555-8555-555555555555";
const product = "66666666-6666-4666-8666-666666666666";
const customer = "77777777-7777-4777-8777-777777777777";
const context = {
  organizationId: org,
  integrationId: integration,
  conversationId: conversation,
  sourceMessageId: source,
};
const version = { cart_id: cartId, version: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  testDb.tables = {
    organizations: [
      {
        id: org,
        is_active: true,
        whatsapp_enabled: true,
        whatsapp_sandbox_enabled: true,
      },
    ],
    whatsapp_integrations: [
      {
        id: integration,
        organization_id: org,
        phone_number_id: "123",
        status: "ACTIVE",
        sales_price_list_id: "price-list",
        responsible_user_id: "seller",
        business_hours: { timezone: "America/Argentina/Buenos_Aires" },
      },
    ],
    whatsapp_conversations: [
      {
        id: conversation,
        organization_id: org,
        integration_id: integration,
        status: "ACTIVE",
        customer_phone: "5491100000000",
        customer_id: customer,
        current_pre_sale_id: null,
        pending_order_action: null,
      },
    ],
    whatsapp_messages: [
      {
        id: source,
        organization_id: org,
        integration_id: integration,
        conversation_id: conversation,
        direction: "INBOUND",
        content: "Quiero comprar un queso",
        created_at: "2026-10-27T12:00:00Z",
      },
    ],
    conversation_carts: [],
    conversation_cart_items: [],
    sales_orders: [],
    products_with_price: [
      {
        id: product,
        organization_id: org,
        is_active: true,
        name: "Queso",
        calculated_sale_price: 20,
        currency: "ARS",
      },
    ],
    sales_price_lists: [
      {
        id: "price-list",
        organization_id: org,
        is_active: true,
        type: "PERCENTAGE",
        value: 0,
        valid_from: "2020-01-01",
      },
    ],
    view_stock_detail: [
      {
        organization_id: org,
        product_id: product,
        total_stock: 50,
        unit_of_measure: "UN",
      },
    ],
    customers: [{ id: customer, organization_id: org, is_active: true }],
  };
  testDb.prepare.mockResolvedValue({
    order: { total_amount: 24.2 },
    items: [],
    itemTaxes: [],
    taxes: [],
  });
  testDb.rpc.mockImplementation((_name, args) => {
    if (args.p_operation === "QUOTE") {
      testDb.tables.conversation_carts[0].version = 3;
      testDb.tables.conversation_carts[0].quote_snapshot =
        args.p_payload.snapshot;
      testDb.tables.whatsapp_conversations[0].pending_order_action = {
        kind: "CONFIRM_PRE_SALE",
        cartId,
        version: 3,
        sourceMessageId: source,
      };
    }
    return { data: {}, error: null };
  });
});
function pendingCart() {
  testDb.tables.conversation_carts = [
    {
      id: cartId,
      organization_id: org,
      conversation_id: conversation,
      status: "QUOTED",
      version: 2,
      currency: "ARS",
      quote_snapshot: { fingerprint: "old-price", total: 12.1 },
      updated_at: "2026-10-26T12:00:00Z",
    },
  ];
  testDb.tables.conversation_cart_items = [
    {
      id: "item",
      cart_id: cartId,
      organization_id: org,
      product_id: product,
      product_variant_id: null,
      quantity: 1,
      unit_price: 10,
      price_snapshot: { productName: "Queso" },
    },
  ];
}

describe("recurring commercial tools", () => {
  it("reading the state or catalog does not create a cart", async () => {
    const state = (await executeCommercialTool(
      context,
      "get_commercial_state",
      {}
    )) as { cart: unknown };
    expect(state.cart).toBeNull();
    expect(testDb.rpc).not.toHaveBeenCalled();
  });
  it("a greeting the following day asks about the pending order without changing it", async () => {
    pendingCart();
    testDb.tables.whatsapp_messages[0].content = "Hola";
    testDb.tables.whatsapp_messages.push({
      ...testDb.tables.whatsapp_messages[0],
      id: "previous",
      created_at: "2026-10-26T12:00:00Z",
    });
    const state = (await executeCommercialTool(
      context,
      "get_commercial_state",
      {}
    )) as { clarification: string };
    expect(state.clarification).toContain("pedido pendiente");
    expect(testDb.rpc).not.toHaveBeenCalled();
  });
  it("does not start a second cart from a repeated yes", async () => {
    testDb.tables.whatsapp_messages[0].content = "Sí";
    await expect(
      executeCommercialTool(context, "start_order", {})
    ).rejects.toThrow("sí aislado");
    expect(testDb.rpc).not.toHaveBeenCalled();
  });
  it("rejects an old cart version before touching its items", async () => {
    pendingCart();
    await expect(
      executeCommercialTool(context, "upsert_cart_item", {
        ...version,
        version: 1,
        product_id: product,
        product_variant_id: null,
        quantity: 3,
      })
    ).rejects.toThrow("carrito cambió");
    expect(testDb.rpc).not.toHaveBeenCalled();
  });
  it("a changed price requotes with taxes and never converts on the old yes", async () => {
    pendingCart();
    testDb.tables.whatsapp_messages[0].content = "Sí";
    testDb.tables.whatsapp_conversations[0].pending_order_action = {
      kind: "CONFIRM_PRE_SALE",
      cartId,
      version: 2,
    };
    const result = (await executeCommercialTool(
      context,
      "create_pre_sale",
      version
    )) as { created: boolean };
    expect(result.created).toBe(false);
    expect(testDb.rpc.mock.calls.map((call) => call[1].p_operation)).toEqual([
      "QUOTE",
    ]);
    expect(testDb.rpc.mock.calls[0][1].p_payload.snapshot.total).toBe(24.2);
    const rendered = (await executeCommercialTool(
      context,
      "render_order_response",
      { text: "Listo" }
    )) as { text: string; orderPrompt: boolean };
    expect(rendered.text).toContain("24.2 ARS");
    expect(rendered.text).toContain("¿Confirmás");
    expect(rendered.orderPrompt).toBe(true);
  });
  it("an existing completed sale is returned by cart, not by the whole chat", async () => {
    testDb.tables.sales_orders = [
      {
        id: "sale",
        organization_id: org,
        conversation_id: conversation,
        whatsapp_cart_id: cartId,
      },
    ];
    const result = await executeCommercialTool(
      context,
      "create_pre_sale",
      version
    );
    expect(result).toEqual({ preSaleId: "sale", alreadyCreated: true });
    expect(testDb.prepare).not.toHaveBeenCalled();
  });
  it("does not retrieve an order from another conversation in the same organization", async () => {
    const foreign = "88888888-8888-4888-8888-888888888888";
    testDb.tables.sales_orders = [
      {
        id: foreign,
        organization_id: org,
        conversation_id: "other",
        source: "WHATSAPP",
      },
    ];
    await expect(
      executeCommercialTool(context, "get_pre_sale_status", {
        pre_sale_id: foreign,
      })
    ).rejects.toThrow("esta conversación");
  });
  it("paused conversations cannot execute tools", async () => {
    testDb.tables.whatsapp_conversations[0].status = "HANDOFF";
    await expect(
      executeCommercialTool(context, "start_order", {})
    ).rejects.toThrow("automatización");
    expect(testDb.rpc).not.toHaveBeenCalled();
  });
  it("history pages stay inside the integration, chat and tenant", async () => {
    testDb.tables.whatsapp_messages.push({
      ...testDb.tables.whatsapp_messages[0],
      id: "foreign",
      integration_id: "another",
      content: "must stay private",
    });
    const result = (await executeCommercialTool(
      context,
      "get_conversation_history",
      { offset: 0 }
    )) as { messages: { content: string }[] };
    expect(result.messages).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("must stay private");
  });
  it("sandbox returns the most recent 32 messages in chronological order", async () => {
    testDb.tables.whatsapp_messages = Array.from(
      { length: 50 },
      (_, index) => ({
        id: String(index).padStart(2, "0"),
        organization_id: org,
        integration_id: integration,
        conversation_id: conversation,
        direction: "INBOUND",
        content: String(index),
        created_at: new Date(Date.UTC(2026, 9, 26, 12, index)).toISOString(),
      })
    );
    const messages = await getSimulationMessages({
      ...context,
      customerId: customer,
    });
    expect(messages).toHaveLength(32);
    expect(messages[0].content).toBe("18");
    expect(messages[31].content).toBe("49");
  });
  it("does not silently substitute unavailable products while repeating a purchase", async () => {
    const saleId = "88888888-8888-4888-8888-888888888888";
    testDb.tables.sales_orders = [
      {
        id: saleId,
        organization_id: org,
        conversation_id: conversation,
        source: "WHATSAPP",
      },
    ];
    testDb.tables.sales_order_items = [
      {
        id: "line",
        organization_id: org,
        sales_order_id: saleId,
        product_id: product,
        product_variant_id: null,
        quantity: 100,
        unit_price: 10,
        description: "Queso",
      },
    ];
    testDb.tables.whatsapp_messages[0].content =
      "Quiero lo mismo que la última vez";
    const result = (await executeCommercialTool(context, "repeat_order", {
      pre_sale_id: saleId,
    })) as { requiresClarification: boolean; differences: string[] };
    expect(result.requiresClarification).toBe(true);
    expect(result.differences[0]).toContain("no se agregó ni se sustituyó");
    expect(testDb.rpc).not.toHaveBeenCalled();
  });
  it("price differences on a repeated purchase require review before quoting", async () => {
    const saleId = "88888888-8888-4888-8888-888888888888";
    testDb.tables.sales_orders = [
      {
        id: saleId,
        organization_id: org,
        conversation_id: conversation,
        source: "WHATSAPP",
      },
    ];
    testDb.tables.sales_order_items = [
      {
        id: "line",
        organization_id: org,
        sales_order_id: saleId,
        product_id: product,
        product_variant_id: null,
        quantity: 1,
        unit_price: 10,
        description: "Queso",
      },
    ];
    testDb.tables.whatsapp_messages[0].content =
      "Quiero lo mismo que la última vez";
    testDb.rpc.mockImplementation((_name, args) => {
      if (args.p_operation === "START") {
        testDb.tables.conversation_carts = [
          {
            id: cartId,
            organization_id: org,
            conversation_id: conversation,
            status: "OPEN",
            version: 1,
            currency: "ARS",
          },
        ];
      }
      if (args.p_operation === "UPSERT") {
        testDb.tables.conversation_carts[0].version = 2;
        testDb.tables.conversation_cart_items = [
          {
            id: "new-item",
            cart_id: cartId,
            organization_id: org,
            product_id: product,
            product_variant_id: null,
            quantity: 1,
            unit_price: 20,
            price_snapshot: { productName: "Queso" },
          },
        ];
      }
      if (args.p_operation === "REQUEST_REPEAT_REVIEW") {
        testDb.tables.whatsapp_conversations[0].pending_order_action = {
          kind: "REVIEW_REPEAT",
          cartId,
          version: 2,
          sourceMessageId: source,
          differences: args.p_payload.differences,
        };
      }
      return { data: testDb.tables.conversation_carts[0], error: null };
    });
    await executeCommercialTool(context, "repeat_order", {
      pre_sale_id: saleId,
    });
    expect(testDb.rpc.mock.calls.map((call) => call[1].p_operation)).toEqual([
      "START",
      "UPSERT",
      "REQUEST_REPEAT_REVIEW",
    ]);
    const rendered = (await executeCommercialTool(
      context,
      "render_order_response",
      { text: "Listo" }
    )) as { text: string; orderPrompt: boolean };
    expect(rendered.text).toContain("20 ARS");
    expect(rendered.text).toContain("productos disponibles");
    await expect(
      executeCommercialTool(context, "quote_cart", version)
    ).rejects.toThrow("accept_repeat_changes");
  });
  it("accepts yes only when a new-order question is pending", async () => {
    testDb.tables.whatsapp_messages[0].content = "Sí";
    testDb.tables.whatsapp_conversations[0].pending_order_action = {
      kind: "START_ORDER",
      sourceMessageId: "previous",
      promptMessageId: "question",
    };
    await executeCommercialTool(context, "start_order", {});
    expect(testDb.rpc.mock.calls[0][1]).toMatchObject({
      p_operation: "START",
      p_payload: { confirmStart: true },
    });
  });
  it("an explicit request to buy may start a cart without pretending it confirms a previous quote", async () => {
    testDb.tables.whatsapp_messages[0].content = "Quiero comprar";
    await executeCommercialTool(context, "start_order", {});
    expect(testDb.rpc.mock.calls[0][1]).toMatchObject({
      p_operation: "START",
      p_payload: { confirmStart: false },
    });
  });
  it("sandbox works with only its own module enabled and a DRAFT integration", async () => {
    testDb.tables.organizations[0].whatsapp_enabled = false;
    testDb.tables.whatsapp_integrations[0].status = "DRAFT";
    testDb.tables.whatsapp_integrations[0].phone_number_id =
      "rhinos-local-simulator:test";
    testDb.tables.whatsapp_conversations[0].customer_phone =
      "SIMULACIÓN LOCAL · test";
    const state = (await executeCommercialTool(
      { ...context, mode: "LOCAL_SIMULATOR" },
      "get_commercial_state",
      {}
    )) as { cart: unknown };
    expect(state.cart).toBeNull();
    expect(testDb.rpc).not.toHaveBeenCalled();
  });
  it("a live worker cannot use a sandbox integration", async () => {
    testDb.tables.whatsapp_integrations[0].status = "DRAFT";
    testDb.tables.whatsapp_integrations[0].phone_number_id =
      "rhinos-local-simulator:test";
    testDb.tables.whatsapp_conversations[0].customer_phone =
      "SIMULACIÓN LOCAL · test";
    await expect(
      executeCommercialTool(context, "get_commercial_state", {})
    ).rejects.toThrow("automatización");
  });
  it("a sandbox context cannot use a live integration", async () => {
    await expect(
      executeCommercialTool(
        { ...context, mode: "LOCAL_SIMULATOR" },
        "get_commercial_state",
        {}
      )
    ).rejects.toThrow("automatización");
  });
});
