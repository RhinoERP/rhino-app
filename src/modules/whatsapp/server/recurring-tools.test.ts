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
  not(key: string, operator: string, value: string) {
    if (operator !== "like" || !value.endsWith("%")) {
      throw new Error("Unsupported negative filter in test");
    }
    this.rows = this.rows.filter(
      (row) => !String(row[key]).startsWith(value.slice(0, -1))
    );
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
    products: [
      {
        id: product,
        organization_id: org,
        is_active: true,
        name: "Queso",
        unit_of_measure: "UN",
        tracks_stock_units: false,
      },
    ],
    product_lots: [],
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
  function weightedProduct(weightPerUnit: number | null = 3.8) {
    Object.assign(testDb.tables.products[0], {
      unit_of_measure: "KG",
      tracks_stock_units: true,
      weight_per_unit: weightPerUnit,
      units_per_box: 4,
    });
    testDb.tables.product_lots = [
      {
        id: "lot",
        organization_id: org,
        product_id: product,
        quantity_available: 38,
        unit_quantity_available: 10,
      },
    ];
    testDb.tables.view_stock_detail[0].unit_of_measure = "KG";
  }

  it.each([
    3.8,
    null,
  ])("provides a reliable approximate weight from product metadata or current lots: %s", async (reference) => {
    weightedProduct(reference);
    const offer = await executeCommercialTool(context, "get_offer", {
      product_id: product,
    });
    expect(offer).toMatchObject({
      approximateQuantityPerPiece: 3.8,
      unitOfMeasure: "KG",
      piecesAvailable: 10,
      unitsPerBox: 4,
      quantityPerPieceSource: reference ? "PRODUCT" : "CURRENT_LOTS",
    });
    expect(testDb.rpc).not.toHaveBeenCalled();
  });

  it("does not infer a weight or piece count from incomplete lot data", async () => {
    weightedProduct(null);
    testDb.tables.product_lots[0].unit_quantity_available = null;
    const offer = await executeCommercialTool(context, "get_offer", {
      product_id: product,
    });
    expect(offer).toMatchObject({
      approximateQuantityPerPiece: null,
      piecesAvailable: null,
    });
  });

  it("can explain a configured presentation even when stock does not track physical pieces", async () => {
    weightedProduct();
    testDb.tables.products[0].tracks_stock_units = false;
    const offer = await executeCommercialTool(context, "get_offer", {
      product_id: product,
    });
    expect(offer).toMatchObject({
      approximateQuantityPerPiece: 3.8,
      piecesAvailable: null,
    });
  });

  it("preserves an order in kilos without inventing a physical piece count", async () => {
    pendingCart();
    weightedProduct();
    testDb.tables.conversation_cart_items[0].quantity = 20;
    await executeCommercialTool(context, "quote_cart", version);
    expect(testDb.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          items: [expect.objectContaining({ quantity: 0, weightQuantity: 20 })],
        }),
      })
    );
  });

  it("converts pieces to estimated kilos on the server without confusing them with stock units", async () => {
    pendingCart();
    weightedProduct();
    await executeCommercialTool(context, "upsert_cart_item", {
      ...version,
      product_id: product,
      quantity: 2,
      quantity_kind: "PIECE",
    });
    expect(testDb.rpc).toHaveBeenCalledWith(
      "mutate_whatsapp_order",
      expect.objectContaining({
        p_operation: "UPSERT",
        p_payload: expect.objectContaining({
          quantity: 7.6,
          price_snapshot: expect.objectContaining({
            requestedPieces: 2,
            quantityEstimated: true,
          }),
        }),
      })
    );
  });

  it("requires kilos when pieces have no reliable reference", async () => {
    pendingCart();
    weightedProduct(null);
    testDb.tables.product_lots = [];
    await expect(
      executeCommercialTool(context, "upsert_cart_item", {
        ...version,
        product_id: product,
        quantity: 2,
        quantity_kind: "PIECE",
      })
    ).rejects.toThrow("Preguntá qué cantidad en kilos");
    expect(testDb.rpc).not.toHaveBeenCalled();
  });

  it("checks both kilos and the number of pieces before updating the cart", async () => {
    pendingCart();
    weightedProduct();
    testDb.tables.view_stock_detail[0].total_stock = 100;
    await expect(
      executeCommercialTool(context, "upsert_cart_item", {
        ...version,
        product_id: product,
        quantity: 11,
        quantity_kind: "PIECE",
      })
    ).rejects.toThrow("suficientes piezas");
    expect(testDb.rpc).not.toHaveBeenCalled();
  });

  it("preserves pieces, estimated kilos and the estimate notice through quoting", async () => {
    pendingCart();
    weightedProduct();
    Object.assign(testDb.tables.conversation_cart_items[0], {
      quantity: 7.6,
      price_snapshot: {
        productName: "Queso",
        unitOfMeasure: "KG",
        requestedPieces: 2,
        quantityEstimated: true,
      },
    });
    await executeCommercialTool(context, "quote_cart", version);
    expect(testDb.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          items: [
            expect.objectContaining({
              quantity: 2,
              weightQuantity: 7.6,
              basePrice: 20,
            }),
          ],
          observations: expect.stringContaining("Pesos e importes estimados"),
        }),
      })
    );
    const payload = testDb.rpc.mock.calls[0][1].p_payload;
    expect(payload.items[0].price_snapshot).toMatchObject({
      requestedPieces: 2,
      quantityEstimated: true,
    });
    const rendered = await executeCommercialTool(
      context,
      "render_order_response",
      { text: "Confirmá" }
    );
    expect(rendered).toMatchObject({
      orderPrompt: true,
      text: expect.stringContaining("2 piezas (aprox. 7.6 KG)"),
    });
    expect((rendered as { text: string }).text).toContain("Total estimado");
  });

  it("invalidates an estimate when the weight reference changes before quoting", async () => {
    pendingCart();
    weightedProduct(4);
    Object.assign(testDb.tables.conversation_cart_items[0], {
      quantity: 7.6,
      price_snapshot: {
        productName: "Queso",
        requestedPieces: 2,
        quantityEstimated: true,
      },
    });
    await expect(
      executeCommercialTool(context, "quote_cart", version)
    ).rejects.toThrow("cambió el peso de referencia");
    expect(testDb.rpc).not.toHaveBeenCalled();
  });

  it("exposes configured policies and the local date without changing an order", async () => {
    testDb.tables.whatsapp_integrations[0].commercial_rules = {
      deliveryPolicy: "Zona centro: lunes a viernes, pedidos hasta las 12.",
      pickupPolicy: "Retiro de 9 a 17 en el depósito.",
      salesGuidance: "Cremac: apto para cocinar.",
    };
    const state = await executeCommercialTool(
      context,
      "get_commercial_state",
      {}
    );
    expect(state).toMatchObject({
      commercialGuidance:
        testDb.tables.whatsapp_integrations[0].commercial_rules,
      timezone: "America/Argentina/Buenos_Aires",
      localDateTime: expect.any(String),
    });
    expect(testDb.rpc).not.toHaveBeenCalled();
  });

  it("uses current organization policies in an existing simulator session", async () => {
    testDb.tables.whatsapp_integrations[0].status = "DRAFT";
    testDb.tables.whatsapp_integrations[0].phone_number_id =
      "rhinos-local-simulator:test";
    testDb.tables.whatsapp_conversations[0].customer_phone =
      "SIMULACIÓN LOCAL · test";
    testDb.tables.whatsapp_integrations.push({
      id: "real-channel",
      organization_id: org,
      phone_number_id: "real-phone",
      commercial_rules: { deliveryPolicy: "Reparto los martes." },
    });
    testDb.tables.whatsapp_integrations.push({
      id: "foreign-channel",
      organization_id: "another-org",
      phone_number_id: "other-phone",
      commercial_rules: { deliveryPolicy: "private-policy" },
    });
    const state = await executeCommercialTool(
      { ...context, mode: "LOCAL_SIMULATOR" },
      "get_commercial_state",
      {}
    );
    expect(state).toMatchObject({
      commercialGuidance: expect.objectContaining({
        deliveryPolicy: "Reparto los martes.",
      }),
    });
    expect(JSON.stringify(state)).not.toContain("private-policy");
  });

  it("confirms commercial follow-up only for a cart converted by this message", async () => {
    pendingCart();
    Object.assign(testDb.tables.conversation_carts[0], {
      status: "CONVERTED",
      last_source_message_id: source,
    });
    testDb.tables.whatsapp_conversations[0].current_pre_sale_id =
      "created-sale";
    const rendered = await executeCommercialTool(
      context,
      "render_order_response",
      { text: "¡Ya tenés entrega hoy!" }
    );
    expect(rendered).toMatchObject({
      text: expect.stringContaining(
        "reconfirmarlo y coordinar el retiro o envío"
      ),
      orderPrompt: false,
    });
    testDb.tables.conversation_carts[0].last_source_message_id =
      "older-message";
    const later = await executeCommercialTool(
      context,
      "render_order_response",
      { text: "Gracias a vos." }
    );
    expect(later).toMatchObject({ text: "Gracias a vos." });
  });

  it("renders human attention without leaking operator instructions", async () => {
    testDb.tables.whatsapp_conversations[0].status = "HANDOFF";
    const rendered = await executeCommercialTool(
      context,
      "render_order_response",
      { text: "Reactivá el bot desde Rhinos" }
    );
    expect(rendered).toMatchObject({
      text: "Una persona del equipo comercial va a continuar la atención por este chat.",
    });
  });

  it("returns tenant-scoped purchase evidence with verified offers and no customer identities", async () => {
    testDb.rpc.mockResolvedValue({
      data: [
        { product_id: product, order_count: "8" },
        { product_id: "foreign-product", order_count: "99" },
      ],
      error: null,
    });
    testDb.tables.products.push({
      id: "foreign-product",
      organization_id: "other",
      is_active: true,
    });
    const result = await executeCommercialTool(
      context,
      "get_recommendations",
      {}
    );
    expect(testDb.rpc).toHaveBeenCalledWith(
      "whatsapp_product_recommendations",
      {
        p_organization_id: org,
        p_query: null,
        p_related_product_id: null,
      }
    );
    expect(result).toMatchObject({
      products: [
        expect.objectContaining({
          productId: product,
          orderCount: 8,
          stockAvailable: 50,
        }),
      ],
      periodDays: 90,
      segment: null,
    });
    expect(JSON.stringify(result)).not.toContain("foreign-product");
    expect(JSON.stringify(result)).not.toContain(customer);
  });

  it("does not recommend bestsellers without stock or claim popularity without evidence", async () => {
    testDb.tables.view_stock_detail[0].total_stock = 0;
    testDb.rpc.mockResolvedValue({
      data: [{ product_id: product, order_count: 8 }],
      error: null,
    });
    expect(
      await executeCommercialTool(context, "get_recommendations", {})
    ).toMatchObject({ products: [] });
    testDb.rpc.mockResolvedValue({ data: [], error: null });
    expect(
      await executeCommercialTool(context, "get_recommendations", {})
    ).toMatchObject({ evidence: "NO_CONFIRMED_SALES" });
  });

  it("validates a complementary product anchor inside the tenant before accessing purchase evidence", async () => {
    await expect(
      executeCommercialTool(context, "get_recommendations", {
        related_product_id: "88888888-8888-4888-8888-888888888888",
      })
    ).rejects.toThrow("no está disponible");
    expect(testDb.rpc).not.toHaveBeenCalled();
  });

  it.each([
    "No",
    "No, gracias",
    "No, no, gracias",
    "NO QUIERO, gracias",
  ])("cancels only the pending action for an explicit refusal: %s", async (answer) => {
    pendingCart();
    const originalCart = structuredClone(testDb.tables.conversation_carts);
    const originalItems = structuredClone(
      testDb.tables.conversation_cart_items
    );
    testDb.tables.whatsapp_messages[0].content = answer;
    testDb.tables.whatsapp_conversations[0].pending_order_action = {
      kind: "ABANDON_CART",
      cartId,
      version: 2,
    };

    await executeCommercialTool(context, "cancel_pending_action", {});

    expect(testDb.rpc).toHaveBeenCalledTimes(1);
    expect(testDb.rpc).toHaveBeenCalledWith(
      "mutate_whatsapp_order",
      expect.objectContaining({ p_operation: "CANCEL_ACTION" })
    );
    expect(testDb.tables.conversation_carts).toEqual(originalCart);
    expect(testDb.tables.conversation_cart_items).toEqual(originalItems);
  });

  it.each([
    "No, mejor cambiá a Cremac",
    "No sé",
    "Sí, confirmo",
  ])("does not cancel a pending action from an ambiguous or modifying answer: %s", async (answer) => {
    testDb.tables.whatsapp_messages[0].content = answer;

    await expect(
      executeCommercialTool(context, "cancel_pending_action", {})
    ).rejects.toThrow("El cliente no rechazó la acción pendiente");
    expect(testDb.rpc).not.toHaveBeenCalled();
  });

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
  it.each([
    false,
    true,
  ])("price or weight differences on a repeated purchase require review before quoting (weighted=%s)", async (weighted) => {
    if (weighted) {
      weightedProduct(4);
    }
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
        quantity: weighted ? 2 : 1,
        unit_quantity: weighted ? 7.6 : null,
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
            quantity: args.p_payload.quantity,
            unit_price: 20,
            price_snapshot: args.p_payload.price_snapshot,
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
    if (weighted) {
      const update = testDb.rpc.mock.calls.find(
        (call) => call[1].p_operation === "UPSERT"
      )?.[1];
      expect(update.p_payload).toMatchObject({
        quantity: 8,
        price_snapshot: { requestedPieces: 2, quantityEstimated: true },
      });
    }
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

describe("commercial worker fencing", () => {
  const leasedContext = {
    ...context,
    jobId: "88888888-8888-4888-8888-888888888888",
    leaseToken: "99999999-9999-4999-8999-999999999999",
  };
  it("passes the lease into the mutation transaction instead of relying on a prior read", async () => {
    testDb.rpc.mockImplementation((name) =>
      Promise.resolve({
        data: name === "assert_whatsapp_job_lease" ? true : {},
        error: null,
      })
    );
    await executeCommercialTool(leasedContext, "start_order", {});
    expect(testDb.rpc).toHaveBeenCalledWith(
      "mutate_whatsapp_order_leased",
      expect.objectContaining({
        p_job_id: leasedContext.jobId,
        p_lease_token: leasedContext.leaseToken,
        p_operation: "START",
      })
    );
    expect(testDb.rpc.mock.calls.map(([name]) => name)).not.toContain(
      "mutate_whatsapp_order"
    );
  });
  it("rejects a stale worker before it can request a commercial mutation", async () => {
    testDb.rpc.mockResolvedValue({ data: false, error: null });
    await expect(
      executeCommercialTool(leasedContext, "start_order", {})
    ).rejects.toThrow("perdió su exclusión");
    expect(testDb.rpc.mock.calls.map(([name]) => name)).toEqual([
      "assert_whatsapp_job_lease",
    ]);
  });
});
