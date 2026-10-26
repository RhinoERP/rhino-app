import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  type CommercialToolName,
  commercialToolNames,
  executeCommercialTool,
} from "@/modules/whatsapp/server/commercial-tools";

export const runtime = "nodejs";

const requestSchema = z.object({
  context: z.object({
    organizationId: z.string().uuid(),
    integrationId: z.string().uuid(),
    conversationId: z.string().uuid(),
  }),
  arguments: z.unknown(),
});

function hasValidServiceToken(request: Request): boolean {
  const expected = process.env.WHATSAPP_AGENT_SERVICE_TOKEN;
  const received = request.headers.get("x-whatsapp-agent-token");
  if (!(expected && received)) {
    return false;
  }

  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tool: string }> }
) {
  if (!hasValidServiceToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tool } = await params;
  if (!commercialToolNames.includes(tool as CommercialToolName)) {
    return NextResponse.json({ error: "Unknown tool" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const result = await executeCommercialTool(
      parsed.data.context,
      tool as CommercialToolName,
      parsed.data.arguments
    );
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar la herramienta comercial",
      },
      { status: 422 }
    );
  }
}
