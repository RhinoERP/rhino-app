"use server";

import { revalidatePath } from "next/cache";
import { sendSaleInvoiceEmail } from "../service/send-sale-invoice-email";

type SendSaleInvoiceEmailActionResult =
  | {
      success: true;
      recipient: string;
      resendId: string | null;
    }
  | {
      success: false;
      error: string;
    };

export async function sendSaleInvoiceEmailAction(input: {
  orgSlug: string;
  saleId: string;
}): Promise<SendSaleInvoiceEmailActionResult> {
  try {
    const result = await sendSaleInvoiceEmail(input);

    revalidatePath(`/org/${input.orgSlug}/ventas`);
    revalidatePath(`/org/${input.orgSlug}/ventas/${input.saleId}`);
    revalidatePath(`/org/${input.orgSlug}/arca/facturas`);

    if (!result.sent) {
      return {
        success: false,
        error: result.message,
      };
    }

    return {
      success: true,
      recipient: result.recipient,
      resendId: result.resendId,
    };
  } catch (error) {
    console.error("Error sending sale invoice email:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo enviar la factura por email.",
    };
  }
}
