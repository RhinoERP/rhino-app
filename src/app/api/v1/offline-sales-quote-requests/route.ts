import { type NextRequest, NextResponse } from "next/server";
import {
  createOfflineSalesQuoteRequest,
  OfflineQuoteRequestError,
  offlineSalesQuoteRequestCommandSchema,
} from "@/modules/sales-quote-requests/service/offline-sales-quote-request.service";

const NO_STORE = "private, no-store, max-age=0";

function errorCode(status: number) {
  if (status === 401) {
    return "AUTH_REQUIRED";
  }
  if (status === 403) {
    return "FORBIDDEN";
  }
  if (status === 409) {
    return "STALE_REFERENCE";
  }
  if (status === 400) {
    return "VALIDATION_ERROR";
  }
  return "RETRYABLE";
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", message: "El JSON no es válido" },
      { status: 400, headers: { "Cache-Control": NO_STORE } }
    );
  }

  const parsed = offlineSalesQuoteRequestCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "El comando de cotización no es válido",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400, headers: { "Cache-Control": NO_STORE } }
    );
  }

  try {
    const result = await createOfflineSalesQuoteRequest(parsed.data);
    return NextResponse.json(result, {
      status: result.duplicate ? 200 : 201,
      headers: { "Cache-Control": NO_STORE },
    });
  } catch (error) {
    if (error instanceof OfflineQuoteRequestError) {
      return NextResponse.json(
        {
          ok: false,
          code: errorCode(error.status),
          message: error.message,
          retryable: error.status >= 500,
        },
        { status: error.status, headers: { "Cache-Control": NO_STORE } }
      );
    }
    console.error("Error sincronizando cotización offline", { error });
    return NextResponse.json(
      {
        ok: false,
        code: "RETRYABLE",
        message: "No se pudo sincronizar la cotización",
        retryable: true,
      },
      { status: 503, headers: { "Cache-Control": NO_STORE } }
    );
  }
}
