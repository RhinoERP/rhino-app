import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeCommandMock = vi.fn();

class CommandError extends Error {
  readonly changes?: unknown[];
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(params: {
    changes?: unknown[];
    code: string;
    message: string;
    retryable: boolean;
    status: number;
  }) {
    super(params.message);
    this.changes = params.changes;
    this.code = params.code;
    this.retryable = params.retryable;
    this.status = params.status;
  }
}

vi.mock("@/modules/offline/service/offline-command.service", () => ({
  executeOfflineCommand: executeCommandMock,
  OfflineCommandError: CommandError,
}));

const validCommand = {
  commandId: "00000000-0000-4000-8000-000000000001",
  schemaVersion: 1,
  type: "preSale.create",
  ownerUserId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000003",
  orgSlugAtCreation: "luchobet",
  snapshotId: "00000000-0000-4000-8000-000000000004",
  createdAt: "2026-09-17T13:00:00.000Z",
  payload: {
    customerId: "00000000-0000-4000-8000-000000000005",
    sellerId: "00000000-0000-4000-8000-000000000002",
    saleDate: "2026-09-17",
    paymentMethod: "efectivo",
    invoiceType: "NOTA_DE_VENTA",
    observations: "",
    items: [
      {
        lineId: "00000000-0000-4000-8000-000000000006",
        productId: "00000000-0000-4000-8000-000000000007",
        quantity: 2,
        unitPrice: 100,
        taxes: [],
      },
    ],
  },
};

const requestFor = (body: unknown) =>
  new NextRequest("http://localhost/api/v1/offline-commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("offline commands route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("devuelve 201 para un comando nuevo", async () => {
    executeCommandMock.mockResolvedValue({
      ok: true,
      commandId: validCommand.commandId,
      resourceId: "00000000-0000-4000-8000-000000000009",
      duplicate: false,
    });
    const { POST } = await import("./route");
    const response = await POST(requestFor(validCommand));

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(executeCommandMock).toHaveBeenCalledOnce();
  });

  it("devuelve 200 para un replay idempotente", async () => {
    executeCommandMock.mockResolvedValue({
      ok: true,
      commandId: validCommand.commandId,
      resourceId: "00000000-0000-4000-8000-000000000009",
      duplicate: true,
    });
    const { POST } = await import("./route");
    const response = await POST(requestFor(validCommand));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ duplicate: true });
  });

  it("rechaza comandos invalidos con errores por campo", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      requestFor({ ...validCommand, commandId: "invalido" })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      fieldErrors: { commandId: expect.any(Array) },
    });
    expect(executeCommandMock).not.toHaveBeenCalled();
  });

  it("expone conflictos comerciales sin convertirlos en 500", async () => {
    executeCommandMock.mockRejectedValue(
      new CommandError({
        code: "REVIEW_REQUIRED",
        message: "El precio cambio",
        retryable: false,
        status: 409,
        changes: [
          {
            path: "payload.items.0.unitPrice",
            message: "El precio cambio",
            capturedValue: 100,
            currentValue: 120,
          },
        ],
      })
    );
    const { POST } = await import("./route");
    const response = await POST(requestFor(validCommand));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "REVIEW_REQUIRED",
      changes: expect.any(Array),
    });
  });
});
