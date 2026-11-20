import "server-only";

import { createAiMessage } from "@/modules/commercial-ai/service/ai-client";
import type { AiMeter } from "@/modules/commercial-ai/service/usage.service";
import {
  EXTRACTED_INVOICE_SCHEMA,
  EXTRACTION_PROMPT,
  type ExtractedInvoice,
} from "./schema";

/**
 * Lee la factura del PDF con IA. Para leer bien tablas y números se usa un
 * modelo más preciso que el del asistente (COMMERCIAL_AI_INVOICE_MODEL).
 * El consumo descuenta créditos como el resto de la IA.
 */

const DEFAULT_INVOICE_MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 16_000;

export class InvoiceReadError extends Error {}

export function invoiceModel(): string {
  return process.env.COMMERCIAL_AI_INVOICE_MODEL || DEFAULT_INVOICE_MODEL;
}

export async function extractInvoiceFromPdf(params: {
  pdfBase64: string;
  meter: AiMeter;
  buyerName: string;
  buyerCuit: string | null;
}): Promise<ExtractedInvoice> {
  const result = await createAiMessage({
    meter: params.meter,
    model: invoiceModel(),
    system: EXTRACTION_PROMPT,
    maxTokens: MAX_TOKENS,
    effort: "medium",
    schema: EXTRACTED_INVOICE_SCHEMA,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: params.pdfBase64,
            },
          },
          {
            type: "text",
            text: `El comprador es ${params.buyerName}${params.buyerCuit ? ` (CUIT ${params.buyerCuit})` : ""}: no es el proveedor. Pasá los datos de esta factura.`,
          },
        ],
      },
    ],
  });
  if (!result.ok) {
    throw new InvoiceReadError("No pude leer esta factura. Cargala a mano.");
  }
  if (result.truncated) {
    throw new InvoiceReadError(
      "La factura es demasiado larga para leerla de una vez. Probá separándola en partes."
    );
  }
  let invoice: ExtractedInvoice;
  try {
    invoice = JSON.parse(result.text) as ExtractedInvoice;
  } catch {
    throw new InvoiceReadError(
      "No pude interpretar la factura. Probá de nuevo."
    );
  }
  if (!invoice.es_factura) {
    throw new InvoiceReadError(
      "El PDF no parece una factura de compra. Revisá el archivo."
    );
  }
  if (!invoice.lineas.length) {
    throw new InvoiceReadError(
      "No encontré artículos en la factura. Cargala a mano."
    );
  }
  return invoice;
}
