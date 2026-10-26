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

  it("redirige preguntas ajenas al alcance comercial sin consultar al modelo", async () => {
    const requestModel = vi.fn();
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
    expect(requestModel).not.toHaveBeenCalled();
    expect(callTool).not.toHaveBeenCalled();
  });
});
