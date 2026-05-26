"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useQuotePDF } from "@/modules/quotes/hooks/use-quote-pdf";

type QuoteActionsCellProps = {
  orgSlug: string;
  quoteId: string;
  customerName: string;
  createdAt: string | null;
};

export function QuoteActionsCell({
  orgSlug,
  quoteId,
  customerName,
  createdAt,
}: QuoteActionsCellProps) {
  const { generateAndDownloadPDF, isGenerating } = useQuotePDF({
    orgSlug,
    quoteId,
    customerName,
    createdAt,
  });

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
        <Download className="h-3.5 w-3.5" />
        {isGenerating ? "Generando..." : "Descargar"}
      </button>
      <Link
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-medium text-xs transition-colors hover:bg-accent"
        href={`/org/${orgSlug}/presupuestos/${quoteId}/editar`}
      >
        Editar
      </Link>
    </div>
  );
}
