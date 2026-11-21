import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioError } from "./audio/config";
import {
  consumeNextFollowUp,
  evaluateFollowUp,
  type FollowUpContext,
} from "./follow-ups";

const now = new Date("2026-11-17T15:00:00Z");
const context: FollowUpContext = {
  businessName: "Rhinos",
  businessHours: {
    enabled: false,
    timezone: "America/Argentina/Buenos_Aires",
    weeklySchedule: {},
  },
  instructions: "Ofrecé ayuda para elegir, sin presionar.",
  responseCapitalization: "STANDARD",
  windowEndsAt: "2026-11-18T14:00:00Z",
  commercialState: { pendingAction: null, hasPendingCart: false },
  messages: [
    {
      direction: "INBOUND",
      content: "¿Qué diferencia hay entre el cremoso y el sardo?",
      type: "TEXT",
    },
    {
      direction: "OUTBOUND",
      content: "El cremoso es más suave. ¿Para qué lo vas a usar?",
      type: "TEXT",
    },
  ],
  storedText: null,
};
const sendDecision = {
  action: "SEND",
  text: "¿Te quedó alguna duda sobre los quesos?",
  reason: "Consulta abierta",
};
const response = (decision: unknown = sendDecision) => ({
  id: "response",
  output_text: JSON.stringify(decision),
  usage: { input_tokens: 20, output_tokens: 10 },
});

function database(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    whatsapp_follow_up_protocol_version: 1,
    claim_whatsapp_follow_up: { id: "follow-up", leaseToken: "lease" },
    read_whatsapp_follow_up_context: structuredClone(context),
    prepare_whatsapp_follow_up: {
      id: "command",
      text: "Persistido",
      lease_token: "lease",
    },
    finish_whatsapp_follow_up: true,
    ...overrides,
  };
  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => ({
    data: data[name],
    error: null,
  }));
  return { db: { rpc } as unknown as SupabaseClient, rpc };
}

afterEach(() => vi.restoreAllMocks());

describe("follow-up evaluation", () => {
  it("retakes a product inquiry with no cart or quote and never exposes mutation tools", async () => {
    const request = vi.fn(async (_body: Record<string, unknown>) => response());
    const result = await evaluateFollowUp(context, request);
    expect(result).toMatchObject({
      action: "SEND",
      reason: "Consulta abierta",
      inputTokens: 20,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [],
        store: false,
        input: expect.stringContaining("¿Qué diferencia hay"),
        text: expect.objectContaining({
          format: expect.objectContaining({ strict: true }),
        }),
      })
    );
    expect(request.mock.calls[0][0].instructions).toContain(
      "aunque no exista carrito"
    );
    expect(request.mock.calls[0][0].input).toContain(context.instructions);
  });

  it("supports Responses API output blocks and company capitalization", async () => {
    const result = await evaluateFollowUp(
      { ...context, responseCapitalization: "LOWERCASE" },
      async () => ({
        id: "r",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: JSON.stringify(sendDecision) },
            ],
          },
        ],
      })
    );
    expect(result.text).toBe("te quedó alguna duda sobre los quesos?");
  });

  it.each([
    null,
    {},
    { ...sendDecision, action: "OTHER" },
    { ...sendDecision, text: "" },
    { ...sendDecision, text: "x".repeat(1001) },
    { ...sendDecision, reason: null },
  ])("omits invalid decisions: %j", async (value) => {
    expect(
      await evaluateFollowUp(context, async () => response(value))
    ).toMatchObject({
      action: "SKIP",
      text: null,
      reason: "INVALID_MODEL_OUTPUT",
    });
  });

  it("omits a refusal or truncated response", async () => {
    const result = await evaluateFollowUp(context, async () => ({
      id: "r",
      output_text: "{truncated",
    }));
    expect(result.action).toBe("SKIP");
  });

  it("does not call the model without readable inbound context", async () => {
    const request = vi.fn();
    const result = await evaluateFollowUp(
      {
        ...context,
        messages: [{ direction: "INBOUND", content: null, type: "AUDIO" }],
      },
      request
    );
    expect(result.reason).toBe("INSUFFICIENT_CONTEXT");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("durable follow-up consumer", () => {
  const clock = () => now;
  it("does not consume jobs until its migration protocol is ready", async () => {
    const { db, rpc } = database({ whatsapp_follow_up_protocol_version: 0 });
    expect(await consumeNextFollowUp(db)).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns idle without a due lease", async () => {
    const { db } = database({ claim_whatsapp_follow_up: null });
    expect(await consumeNextFollowUp(db)).toBe(false);
  });

  it("saves the generated text before sending the reserved command", async () => {
    const { db, rpc } = database();
    const requestModel = vi.fn(async (_body: Record<string, unknown>) =>
      response()
    );
    const send = vi.fn(async () => "meta-id");
    expect(
      await consumeNextFollowUp(db, { now: clock, requestModel, send })
    ).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "prepare_whatsapp_follow_up",
      expect.objectContaining({
        p_id: "follow-up",
        p_lease_token: "lease",
        p_text: "Te quedó alguna duda sobre los quesos?",
      })
    );
    expect(send).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ id: "command", text: "Persistido" })
    );
    expect(send.mock.invocationCallOrder[0]).toBeGreaterThan(
      rpc.mock.invocationCallOrder.at(-1) ?? 0
    );
  });

  it.each([
    "despedida",
    "rechazo",
    "solicitud de no contacto",
    "compra finalizada",
    "saludo sin consulta",
  ])("does not send when evaluation excludes %s", async (reason) => {
    const { db, rpc } = database();
    const send = vi.fn();
    await consumeNextFollowUp(db, {
      now: clock,
      send,
      requestModel: async () =>
        response({ action: "SKIP", text: null, reason }),
    });
    expect(rpc).toHaveBeenCalledWith(
      "finish_whatsapp_follow_up",
      expect.objectContaining({
        p_action: "SKIP",
        p_reason: reason,
        p_input_tokens: 20,
      })
    );
    expect(send).not.toHaveBeenCalled();
    expect(
      rpc.mock.calls.some(([name]) => name === "prepare_whatsapp_follow_up")
    ).toBe(false);
  });

  it("does not generate after an inbound or human intervention invalidates its lease", async () => {
    const { db } = database({ read_whatsapp_follow_up_context: null });
    const requestModel = vi.fn();
    await consumeNextFollowUp(db, { now: clock, requestModel });
    expect(requestModel).not.toHaveBeenCalled();
  });

  it("discards output if the customer replies while generation is in progress", async () => {
    const { db } = database({ prepare_whatsapp_follow_up: null });
    const send = vi.fn();
    await consumeNextFollowUp(db, {
      now: clock,
      requestModel: async () => response(),
      send,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("recovers saved text on retry without generating another message", async () => {
    const { db, rpc } = database({
      read_whatsapp_follow_up_context: {
        ...context,
        storedText: "Texto guardado",
      },
    });
    const requestModel = vi.fn();
    await consumeNextFollowUp(db, { now: clock, requestModel, send: vi.fn() });
    expect(requestModel).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "prepare_whatsapp_follow_up",
      expect.objectContaining({ p_text: "Texto guardado" })
    );
  });

  it("defers until opening without spending a model call", async () => {
    const { db, rpc } = database({
      read_whatsapp_follow_up_context: {
        ...context,
        businessHours: {
          enabled: true,
          timezone: "UTC",
          weeklySchedule: {
            tuesday: { enabled: true, start: "16:00", end: "18:00" },
          },
        },
      },
    });
    const requestModel = vi.fn();
    await consumeNextFollowUp(db, { now: clock, requestModel });
    expect(rpc).toHaveBeenCalledWith(
      "finish_whatsapp_follow_up",
      expect.objectContaining({
        p_action: "DEFER",
        p_defer_until: "2026-11-17T16:00:00.000Z",
      })
    );
    expect(requestModel).not.toHaveBeenCalled();
  });

  it.each([
    "2026-11-17T14:59:00Z",
    "2026-11-17T15:00:00Z",
  ])("omits an expired window %s", async (deadline) => {
    const { db, rpc } = database({
      read_whatsapp_follow_up_context: { ...context, windowEndsAt: deadline },
    });
    const requestModel = vi.fn();
    await consumeNextFollowUp(db, { now: clock, requestModel });
    expect(rpc).toHaveBeenCalledWith(
      "finish_whatsapp_follow_up",
      expect.objectContaining({ p_action: "SKIP", p_reason: "WINDOW_EXPIRED" })
    );
    expect(requestModel).not.toHaveBeenCalled();
  });

  it("omits when the next opening would fall outside the customer window", async () => {
    const { db, rpc } = database({
      read_whatsapp_follow_up_context: {
        ...context,
        windowEndsAt: "2026-11-17T15:30:00Z",
        businessHours: {
          enabled: true,
          timezone: "UTC",
          weeklySchedule: {
            tuesday: { enabled: true, start: "16:00", end: "18:00" },
          },
        },
      },
    });
    await consumeNextFollowUp(db, { now: clock });
    expect(rpc).toHaveBeenCalledWith(
      "finish_whatsapp_follow_up",
      expect.objectContaining({ p_action: "SKIP", p_reason: "WINDOW_EXPIRED" })
    );
  });

  it("schedules a bounded retry after transient model failure", async () => {
    const { db, rpc } = database();
    await expect(
      consumeNextFollowUp(db, {
        now: clock,
        requestModel: () => Promise.reject(new Error("temporary")),
      })
    ).rejects.toThrow("temporary");
    expect(rpc).toHaveBeenCalledWith(
      "finish_whatsapp_follow_up",
      expect.objectContaining({ p_action: "RETRY" })
    );
  });

  it("does not retry a preflight rejection", async () => {
    const { db, rpc } = database();
    const send = vi.fn(() =>
      Promise.reject(new AudioError("DELIVERY_NOT_AUTHORIZED", "cancelled"))
    );
    await consumeNextFollowUp(db, {
      now: clock,
      requestModel: async () => response(),
      send,
    });
    expect(
      rpc.mock.calls.some(([name]) => name === "finish_whatsapp_follow_up")
    ).toBe(false);
  });
});
