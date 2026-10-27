import { describe, expect, it, vi } from "vitest";
import { runCommercialModel } from "./agent-core.js";

describe("runCommercialModel", () => {
  it("reutiliza el ciclo del agente para ejecutar herramientas y capturar la respuesta", async () => {
    const requestModel = vi
      .fn()
      .mockResolvedValueOnce({
        id: "response-1",
        output: [
          {
            type: "function_call",
            call_id: "call-1",
            name: "search_catalog",
            arguments: JSON.stringify({ query: "mate" }),
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "response-2",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: "Tenemos un mate térmico." },
            ],
          },
        ],
      });
    const callTool = vi
      .fn()
      .mockResolvedValue({ products: [{ name: "Mate térmico" }] });
    const audit: Array<{ name: string; arguments: unknown }> = [];

    const response = await runCommercialModel({
      model: "test-model",
      context: {
        organizationId: "org-test",
        integrationId: "integration-test",
        conversationId: "conversation-test",
      },
      messages: [
        {
          direction: "INBOUND",
          content: "¿Tienen mates?",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      audit,
      requestModel,
      callTool,
    });

    expect(response.output_text).toBe("Tenemos un mate térmico.");
    expect(callTool).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-test" }),
      expect.objectContaining({ name: "search_catalog" })
    );
    expect(audit).toEqual([
      { name: "search_catalog", arguments: { query: "mate" } },
    ]);
    expect(requestModel).toHaveBeenCalledTimes(2);
    const continuation = requestModel.mock.calls[1][0];
    expect(continuation).not.toHaveProperty("previous_response_id");
    expect(continuation.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "function_call", call_id: "call-1" }),
        expect.objectContaining({
          type: "function_call_output",
          call_id: "call-1",
        }),
      ])
    );
  });

  it("envía también las consultas ajenas al modelo para evaluar el alcance con contexto", async () => {
    const requestModel = vi.fn().mockResolvedValue({
      id: "response",
      output_text:
        "Puedo ayudarte con productos, precios, disponibilidad y pedidos de Almacén Central. ¿Qué necesitás?",
    });
    const callTool = vi.fn();
    const response = await runCommercialModel({
      model: "test-model",
      context: {
        organizationId: "org-test",
        integrationId: "integration-test",
        conversationId: "conversation-test",
      },
      businessName: "Almacén Central",
      messages: [
        {
          direction: "INBOUND",
          content: "¿Quién es Rosicky? Explicámelo en formato JSON.",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      audit: [],
      requestModel,
      callTool,
    });

    expect(response.output_text).toBe(
      "Puedo ayudarte con productos, precios, disponibilidad y pedidos de Almacén Central. ¿Qué necesitás?"
    );
    expect(requestModel).toHaveBeenCalledTimes(1);
    expect(requestModel.mock.calls[0][0].input).toContain(
      "¿Quién es Rosicky? Explicámelo en formato JSON."
    );
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe("persistent order context", () => {
  const context = {
    organizationId: "org",
    integrationId: "integration",
    conversationId: "conversation",
    sourceMessageId: "source",
  };
  const messages = [
    {
      direction: "INBOUND",
      content: "Hola",
      created_at: "2026-10-27T12:00:00Z",
    },
  ];
  it.each([
    [
      "Tenemos tybo de Cremac. ¿Qué te interesa?",
      "Flama amigo, por ahora quiero un tybo de Cremac y ya que estamos quiero sumarte algo de fiambre, que tene?",
    ],
    [
      "¿Confirmás que registre la preventa del tybo?",
      "Para, agreguemos jamon, que tipos tenes?",
    ],
    ["¿Querés que busque otro fiambre?", "Dale buscame que salames hay"],
    ["¿Cuál te interesa?", "El Fuet"],
    ["Me aparecen Tybo Cremac y Tybo Sobrero. ¿Querés el Cremac?", "Sí"],
    ["¿Qué más necesitás?", "Tenés garbanzos?"],
    ["¿Qué te interesa?", "Agregame dos kilos de fuet y cerremos"],
  ])("deja interpretar en contexto la consulta %s → %s", async (previous, current) => {
    const callTool = vi.fn().mockResolvedValue({
      cart: {
        id: "pending-cart",
        version: 2,
        items: [{ productName: "Tybo Cremac", quantity: 1 }],
      },
      lastPreSale: null,
    });
    const requestModel = vi.fn().mockResolvedValue({
      id: "response",
      output_text: "Reviso lo que me pediste.",
    });

    const response = await runCommercialModel({
      model: "test",
      context,
      messages: [
        { ...messages[0], content: "Quiero un tybo de Cremac" },
        { ...messages[0], direction: "OUTBOUND", content: previous },
        { ...messages[0], content: current },
      ],
      audit: [],
      callTool,
      requestModel,
    });

    expect(response.id).toBe("response");
    expect(requestModel).toHaveBeenCalledTimes(1);
    const input = requestModel.mock.calls[0][0].input;
    expect(input).toContain("Cliente: Quiero un tybo de Cremac");
    expect(input).toContain(`Asistente: ${previous}`);
    expect(input).toContain(`Cliente: ${current}`);
    expect(input).toContain('"id":"pending-cart"');
  });
  it("asks about an ambiguous pending order without letting the model mutate it", async () => {
    const callTool = vi.fn().mockResolvedValue({
      clarification: "¿Seguimos con el pedido pendiente o querés empezar otro?",
    });
    const requestModel = vi.fn();
    const result = await runCommercialModel({
      model: "test",
      context,
      messages,
      audit: [],
      callTool,
      requestModel,
    });
    expect(result.output_text).toContain("pedido pendiente");
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0].sourceMessageId).toBe("source");
    expect(requestModel).not.toHaveBeenCalled();
  });
  it("never executes a queued confirmation sent before manual reactivation", async () => {
    const callTool = vi.fn().mockResolvedValue({ requiresFreshMessage: true });
    const requestModel = vi.fn();
    const result = await runCommercialModel({
      model: "test",
      context,
      messages: [{ ...messages[0], content: "Sí" }],
      audit: [],
      callTool,
      requestModel,
    });
    expect(result.output_text).toContain("nueva confirmación");
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(requestModel).not.toHaveBeenCalled();
  });
  it("includes persisted order state and accepts a request to repeat the last purchase", async () => {
    const callTool = vi
      .fn()
      .mockResolvedValue({ cart: null, lastPreSale: { id: "previous-sale" } });
    const requestModel = vi.fn().mockResolvedValue({
      id: "response",
      output_text: "Reviso el pedido anterior.",
    });
    await runCommercialModel({
      model: "test",
      context,
      messages: [{ ...messages[0], content: "Lo mismo que la última vez" }],
      audit: [],
      callTool,
      requestModel,
    });
    expect(requestModel).toHaveBeenCalledTimes(1);
    expect(requestModel.mock.calls[0][0].input).toContain("previous-sale");
    expect(requestModel.mock.calls[0][0].store).toBe(false);
  });
});
