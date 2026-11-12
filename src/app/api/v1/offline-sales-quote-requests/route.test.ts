import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createQuoteMock } = vi.hoisted(() => ({ createQuoteMock: vi.fn() }));

class QuoteError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

vi.mock(
  "@/modules/sales-quote-requests/service/offline-sales-quote-request.service",
  async () => {
    const { z } = await import("zod");
    return {
      createOfflineSalesQuoteRequest: createQuoteMock,
      OfflineQuoteRequestError: QuoteError,
      offlineSalesQuoteRequestCommandSchema: z.object({
        commandId: z.string(),
      }),
    };
  }
);

const requestFor = (body: unknown) =>
  new NextRequest("http://localhost/api/v1/offline-sales-quote-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("offline sales quote request route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects invalid commands before invoking the service", async () => {
    const { POST } = await import("./route");
    const response = await POST(requestFor({}));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(createQuoteMock).not.toHaveBeenCalled();
  });

  it("returns 201 for a new quote and 200 for an idempotent replay", async () => {
    createQuoteMock
      .mockResolvedValueOnce({ requestId: "request-1", duplicate: false })
      .mockResolvedValueOnce({ requestId: "request-1", duplicate: true });
    const { POST } = await import("./route");

    expect((await POST(requestFor({ commandId: "command-1" }))).status).toBe(
      201
    );
    expect((await POST(requestFor({ commandId: "command-1" }))).status).toBe(
      200
    );
  });

  it("maps authorization errors without exposing a server error", async () => {
    createQuoteMock.mockRejectedValueOnce(new QuoteError("Sin permiso", 403));
    const { POST } = await import("./route");
    const response = await POST(requestFor({ commandId: "command-1" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FORBIDDEN",
      retryable: false,
    });
  });
});
