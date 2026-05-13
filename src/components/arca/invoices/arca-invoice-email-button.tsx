"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendSaleInvoiceEmailAction } from "@/modules/email/actions/send-sale-invoice-email.action";

type ArcaInvoiceEmailButtonProps = {
  orgSlug: string;
  saleId: string;
  customerEmail?: string | null;
  invoiceEmailStatus?: string | null;
};

export function ArcaInvoiceEmailButton({
  orgSlug,
  saleId,
  customerEmail,
  invoiceEmailStatus,
}: ArcaInvoiceEmailButtonProps) {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const canSend = Boolean(customerEmail?.trim());
  const label =
    invoiceEmailStatus === "not_sent" || invoiceEmailStatus === "failed"
      ? "Enviar"
      : "Reenviar";

  const handleClick = async () => {
    setIsSending(true);

    try {
      const result = await sendSaleInvoiceEmailAction({ orgSlug, saleId });

      if (!result.success) {
        toast.error(result.error);
        router.refresh();
        return;
      }

      toast.success(`Factura enviada a ${result.recipient}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la factura por email."
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
