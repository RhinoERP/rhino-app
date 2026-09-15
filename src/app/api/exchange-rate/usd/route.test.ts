import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireAuthResponse: vi.fn().mockResolvedValue(null),
}));

const PREVIOUS_DATE_URL_PATTERN = /\/date\/\d{4}-\d{2}-\d{2}\/usd\/bna$/;

describe("exchange-rate usd route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("MONEDAPI_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("calcula el día calendario previo en Argentina", async () => {
    const { getPreviousArgentinaDate } = await import("./route");

    expect(getPreviousArgentinaDate(new Date("2026-09-15T08:00:00.000Z"))).toBe(
      "2026-09-14"
    );
    expect(getPreviousArgentinaDate(new Date("2026-09-16T02:30:00.000Z"))).toBe(
      "2026-09-14"
    );
    expect(getPreviousArgentinaDate(new Date("2026-03-01T05:00:00.000Z"))).toBe(
      "2026-02-28"
    );
  });

  it("con previous=1 consulta la fecha previa con la API key en el header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          sell: 1450.5,
          quotedAt: "2026-09-14T20:00:00.000Z",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/exchange-rate/usd?previous=1"
    );

    const response = await GET(request);
    expect(response.status).toBe(200);

    const [forwardedUrl, forwardedInit] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];
    expect(String(forwardedUrl)).toMatch(PREVIOUS_DATE_URL_PATTERN);
    expect(
      (forwardedInit?.headers as Record<string, string>).Authorization
    ).toBe("Bearer test-key");

    const body = (await response.json()) as {
      venta: number;
      fechaActualizacion: string;
    };
    expect(body).toEqual({
      venta: 1450.5,
      fechaActualizacion: "2026-09-14T20:00:00.000Z",
    });
  });

  it("devuelve 409 cuando no existe cotización previa", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ sell: null, quotedAt: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/exchange-rate/usd?previous=1"
    );

    const response = await GET(request);
    expect(response.status).toBe(409);

    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("cotización");
  });

  it("sin previous usa la cotización actual sin API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          sell: 1440,
          updatedAt: "2026-09-15T15:00:00.000Z",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost/api/exchange-rate/usd");

    const response = await GET(request);
    expect(response.status).toBe(200);

    const [forwardedUrl] = fetchMock.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];
    expect(String(forwardedUrl)).toBe("https://monedapi.ar/api/v2/usd/bna");
  });

  it("mapea un 401 de MonedAPI a un mensaje claro", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/exchange-rate/usd?previous=1"
    );

    const response = await GET(request);
    expect(response.status).toBe(500);

    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("MonedAPI");
  });

  it("sin MONEDAPI_API_KEY devuelve un error descriptivo", async () => {
    vi.stubEnv("MONEDAPI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost/api/exchange-rate/usd?previous=1"
    );

    const response = await GET(request);
    expect(response.status).toBe(500);

    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("MONEDAPI_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
