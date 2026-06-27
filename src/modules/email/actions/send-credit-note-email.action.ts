"use server";

import { revalidatePath } from "next/cache";
import { sendCreditNoteEmail } from "../service/send-credit-note-email";

type SendCreditNoteEmailActionResult =
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

export async function sendCreditNoteEmailAction(input: {
  orgSlug: string;
  creditNoteId: string;
  recipients?: string[];
  fromName?: string;
  subject?: string;
  bodyText?: string;
  attachPdf?: boolean;
}): Promise<SendCreditNoteEmailActionResult> {
  try {
    const result = await sendCreditNoteEmail(input);

    revalidatePath(`/org/${input.orgSlug}/notas-de-credito`);
    revalidatePath(
      `/org/${input.orgSlug}/notas-de-credito/${input.creditNoteId}`
    );

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
    console.error("Error sending credit note email:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo enviar la nota de crédito por email.",
    };
  }
}
