import { NextResponse } from "next/server";
import { createResendClient } from "@/modules/email/client";
import { handleSaleInvoiceEmailWebhook } from "@/modules/email/service/send-sale-invoice-email";

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "RESEND_WEBHOOK_SECRET is not configured" },
      { status: 500 }
    );
  }

  const payload = await request.text();
  const headers = {
    id: request.headers.get("svix-id") ?? "",
    timestamp: request.headers.get("svix-timestamp") ?? "",
    signature: request.headers.get("svix-signature") ?? "",
  };

  if (!(headers.id && headers.timestamp && headers.signature)) {
    return NextResponse.json(
      { error: "Missing Resend webhook signature headers" },
      { status: 400 }
    );
  }

  let event: unknown;

  try {
    event = createResendClient().webhooks.verify({
      payload,
      headers,
      webhookSecret,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid Resend webhook signature" },
      { status: 400 }
    );
  }

  const result = await handleSaleInvoiceEmailWebhook(event);

  return NextResponse.json({
    received: true,
    handled: result.handled,
  });
}
