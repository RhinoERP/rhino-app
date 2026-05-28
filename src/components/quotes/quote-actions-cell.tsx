"use client";

import { ArrowSquareOutIcon, DownloadIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useConvertQuote } from "@/modules/quotes/hooks/use-convert-quote";
import { useQuotePDF } from "@/modules/quotes/hooks/use-quote-pdf";
import type { QuoteStatus } from "@/modules/quotes/types";

type QuoteActionsCellProps = {
  orgSlug: string;
  quoteId: string;
  customerName: string;
  createdAt: string | null;
  status: QuoteStatus;
};

export function QuoteActionsCell({
  orgSlug,
  quoteId,
  customerName,
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

  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="Descargar presupuesto en PDF"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isGenerating}
        onClick={async () => {
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
      >
        Editar
      </Link>
      {status === "APPROVED" && (
        <button
          aria-label="Convertir a nota de venta"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={convertQuote.isPending}
          onClick={async () => {
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
