import { type NextRequest, NextResponse } from "next/server";
import { offlineCommandV1Schema } from "@/modules/offline/contracts/offline-command";
import {
  executeOfflineCommand,
  OfflineCommandError,
} from "@/modules/offline/service/offline-command.service";

const PRIVATE_NO_STORE = "private, no-store, max-age=0";

const validationResponse = (
  message: string,
  fieldErrors?: Record<string, string[]>
) =>
  NextResponse.json(
    {
      ok: false,
      code: "VALIDATION_ERROR",
      message,
      retryable: false,
      ...(fieldErrors ? { fieldErrors } : {}),
    },
    { status: 400, headers: { "Cache-Control": PRIVATE_NO_STORE } }
  );

export async function POST(request: NextRequest) {
  const startedAt = performance.now();
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return validationResponse("El cuerpo JSON no es valido");
  }

  const parsed = offlineCommandV1Schema.safeParse(value);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".") || "command";
      fieldErrors[path] = [...(fieldErrors[path] ?? []), issue.message];
    }
    return validationResponse("El comando no es valido", fieldErrors);
  }

  try {
    const result = await executeOfflineCommand(parsed.data);
    const status = result.ok && result.duplicate ? 200 : 201;
    return NextResponse.json(result, {
      status,
      headers: {
        "Cache-Control": PRIVATE_NO_STORE,
        "Server-Timing": `offline-command;dur=${Math.round(performance.now() - startedAt)}`,
      },
    });
  } catch (error) {
    if (error instanceof OfflineCommandError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          ...(error.changes ? { changes: error.changes } : {}),
        },
        {
          status: error.status,
          headers: { "Cache-Control": PRIVATE_NO_STORE },
        }
      );
    }

    console.error("Error ejecutando comando offline", {
      commandId: parsed.data.commandId,
      type: parsed.data.type,
      error,
    });
    return NextResponse.json(
      {
        ok: false,
        code: "RETRYABLE",
        message: "No se pudo sincronizar la operacion",
        retryable: true,
      },
      { status: 500, headers: { "Cache-Control": PRIVATE_NO_STORE } }
    );
  }
}
