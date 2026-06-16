"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendCreditNoteEmailAction } from "@/modules/email/actions/send-credit-note-email.action";

type CreditNoteEmailButtonProps = {
  orgSlug: string;
  creditNoteId: string;
  customerEmail?: string | null;
  invoiceEmailRecipient?: string | null;
  invoiceEmailStatus?: string | null;
  isAuthorized: boolean;
};

export function CreditNoteEmailButton({
  orgSlug,
  creditNoteId,
  customerEmail,
  invoiceEmailRecipient,
  invoiceEmailStatus,
  isAuthorized,
}: CreditNoteEmailButtonProps) {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const canSend = Boolean(
    isAuthorized && (invoiceEmailRecipient?.trim() || customerEmail?.trim())
  );
  const label =
    invoiceEmailStatus === "not_sent" || invoiceEmailStatus === "failed"
      ? "Enviar email"
      : "Reenviar email";

  const handleClick = async () => {
    setIsSending(true);

    try {
      const result = await sendCreditNoteEmailAction({
        orgSlug,
        creditNoteId,
      });

      if (!result.success) {
        toast.error(result.error);
        router.refresh();
        return;
      }

      toast.success(`Nota de crédito enviada a ${result.recipient}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la nota de crédito por email."
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Button
      disabled={isSending || !canSend}
      onClick={handleClick}
      size="sm"
      type="button"
      variant="outline"
    >
      <Mail className="mr-2 size-4" />
      {isSending ? "Enviando..." : label}
    </Button>
  );
}
