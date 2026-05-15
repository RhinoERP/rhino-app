"use server";

import { revalidatePath } from "next/cache";
import {
  sendSaleInvoiceEmail,
  updateSaleInvoiceEmailRecipients,
} from "../service/send-sale-invoice-email";

type SendSaleInvoiceEmailActionResult =
  | {
      success: true;
      recipient: string;
      recipients: string[];
      resendId: string | null;
    }
  | {
      success: false;
      error: string;
    };

export async function sendSaleInvoiceEmailAction(input: {
  orgSlug: string;
  saleId: string;
  recipients?: string[];
  fromName?: string;
  subject?: string;
  bodyText?: string;
  attachPdf?: boolean;
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
      recipients: result.recipients,
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

type UpdateSaleInvoiceEmailRecipientsActionResult =
  | {
      success: true;
      recipient: string;
      recipients: string[];
    }
  | {
      success: false;
      error: string;
    };

export async function updateSaleInvoiceEmailRecipientsAction(input: {
  orgSlug: string;
  saleId: string;
  recipients: string[];
}): Promise<UpdateSaleInvoiceEmailRecipientsActionResult> {
  try {
    const result = await updateSaleInvoiceEmailRecipients(input);

    revalidatePath(`/org/${input.orgSlug}/ventas`);
    revalidatePath(`/org/${input.orgSlug}/ventas/${input.saleId}`);
    revalidatePath(`/org/${input.orgSlug}/arca/facturas`);

    return {
      success: true,
      recipient: result.recipient,
      recipients: result.recipients,
    };
  } catch (error) {
    console.error("Error updating sale invoice email recipients:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron actualizar los destinatarios de factura.",
    };
  }
}
