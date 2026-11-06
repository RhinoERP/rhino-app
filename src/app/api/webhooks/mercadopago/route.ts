import { NextResponse } from "next/server";
import {
  settleCreditPayment,
  validWebhookSignature,
} from "@/modules/commercial-ai/service/credit-purchases.service";

/**
 * Avisos de Mercado Pago por compras de créditos de IA Comercial. Solo trae el
 * id del pago: el estado y el monto se consultan siempre a la API.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as {
    type?: string;
    topic?: string;
    data?: { id?: string | number };
  };
  const type =
    url.searchParams.get("type") ??
    body.type ??
    url.searchParams.get("topic") ??
    body.topic;
  const dataId = String(
    url.searchParams.get("data.id") ??
      body.data?.id ??
      url.searchParams.get("id") ??
      ""
  );
  if (type !== "payment" || !dataId) {
    // Otros avisos (órdenes, contracargos) no nos interesan: se confirman igual.
    return NextResponse.json({ ok: true });
  }
  if (
    !validWebhookSignature({
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
    })
  ) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }
  try {
    await settleCreditPayment(dataId);
  } catch (error) {
    console.error("Mercado Pago: no se pudo procesar el pago", error);
    // 500: Mercado Pago reintenta más tarde.
    return NextResponse.json({ error: "reintentar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
