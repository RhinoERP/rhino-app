"use client";

import {
  ArrowSquareOutIcon,
  DownloadIcon,
  EnvelopeIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { sendQuoteEmailAction } from "@/modules/quotes/actions/send-quote-email.action";
import { useConvertQuote } from "@/modules/quotes/hooks/use-convert-quote";
import { useQuotePDF } from "@/modules/quotes/hooks/use-quote-pdf";
import type { QuoteStatus } from "@/modules/quotes/types";

type QuoteActionsCellProps = {
  orgSlug: string;
  quoteId: string;
  customerName: string;
  customerEmail: string | null;
  createdAt: string | null;
  status: QuoteStatus;
};

export function QuoteActionsCell({
  orgSlug,
  quoteId,
  customerName,
  customerEmail,
  createdAt,
  status,
}: QuoteActionsCellProps) {
  const { generateAndDownloadPDF, isGenerating } = useQuotePDF({
    orgSlug,
    quoteId,
    customerName,
    createdAt,
  });
  const { convertQuote } = useConvertQuote(orgSlug);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleSendEmail = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!customerEmail) {
      toast.error("El cliente no tiene email registrado");
      return;
    }

    setIsSendingEmail(true);
    const result = await sendQuoteEmailAction({
      orgSlug,
      quoteId,
      recipientEmail: customerEmail,
      recipientName: customerName,
    });
    setIsSendingEmail(false);

    if (result.success) {
      toast.success("Presupuesto enviado por email correctamente");
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="Descargar presupuesto en PDF"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isGenerating}
        onClick={async (e) => {
          e.stopPropagation();
          await generateAndDownloadPDF();
        }}
        type="button"
      >
        <DownloadIcon className="h-3.5 w-3.5" />
        {isGenerating ? "Generando..." : "Descargar"}
      </button>
      <Link
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent"
        href={`/org/${orgSlug}/presupuestos/${quoteId}/editar`}
        onClick={(e) => e.stopPropagation()}
      >
        Editar
      </Link>
      {(status === "DRAFT" || status === "SENT" || status === "REJECTED") &&
        customerEmail && (
          <button
            aria-label="Enviar presupuesto por email"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSendingEmail}
            onClick={handleSendEmail}
            type="button"
          >
            <EnvelopeIcon className="h-3.5 w-3.5" />
            {isSendingEmail ? "Enviando..." : "Enviar"}
          </button>
        )}
      {status === "APPROVED" && (
        <button
          aria-label="Convertir a nota de venta"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={convertQuote.isPending}
          onClick={async (e) => {
            e.stopPropagation();
            await convertQuote.mutateAsync(quoteId);
          }}
          type="button"
        >
          <ArrowSquareOutIcon className="h-3.5 w-3.5" />
          {convertQuote.isPending ? "Convirtiendo..." : "Convertir"}
        </button>
      )}
    </div>
  );
}
