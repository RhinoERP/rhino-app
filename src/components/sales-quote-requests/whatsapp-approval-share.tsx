"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildApprovalWhatsAppMessage,
  buildApprovalWhatsAppUrl,
} from "@/modules/sales-quote-requests/whatsapp-approval-share";

export function WhatsAppApprovalShare({
  customerName,
  requestId,
  orgSlug,
}: {
  customerName: string;
  requestId: string;
  orgSlug: string;
}) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    setMessage(
      buildApprovalWhatsAppMessage({
        customerName,
        requestId,
        orgSlug,
        origin: window.location.origin,
      })
    );
  }, [customerName, requestId, orgSlug]);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Aviso copiado; elegí el contacto y pegalo en WhatsApp");
    } catch {
      toast.error("No se pudo copiar el aviso. Intentá abrir WhatsApp.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {message ? (
        <Button asChild size="sm" variant="outline">
          <a
            href={buildApprovalWhatsAppUrl(message)}
            rel="noopener noreferrer"
            target="_blank"
          >
            Avisar por WhatsApp
          </a>
        </Button>
      ) : (
        <Button disabled size="sm" type="button" variant="outline">
          Avisar por WhatsApp
        </Button>
      )}
      <Button
        disabled={!message}
        onClick={copyMessage}
        size="sm"
        type="button"
        variant="ghost"
      >
        Copiar aviso
      </Button>
    </div>
  );
}
