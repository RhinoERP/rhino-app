"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import { createResendClient } from "@/modules/email/client";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { QuotePDFData } from "../service/quote-pdf-generator.service";
import { generateQuotePDFHTML } from "../service/quote-pdf-generator.service";
import type { QuoteItemRow, QuoteRow } from "../types";

export async function sendQuoteEmailAction(input: {
  orgSlug: string;
  quoteId: string;
  recipientEmail: string;
  recipientName: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { orgSlug, quoteId, recipientEmail, recipientName } = input;

    const [organization, supabase] = await Promise.all([
      getOrganizationBySlug(orgSlug),
      createClient(),
    ]);

    if (!organization) {
      return { success: false, error: "Organización no encontrada" };
    }

    const { data: quoteData, error: quoteError } = await supabase
      .from("quotes")
      .select(
        `
        *,
        customers (
          business_name,
          fantasy_name,
          cuit,
          phone,
          address
        ),
        quote_items (*)
      `
      )
      .eq("id", quoteId)
      .eq("organization_id", organization.id)
      .single();

    if (quoteError || !quoteData) {
      return { success: false, error: "Presupuesto no encontrado" };
    }

    const quote = quoteData as QuoteRow & {
      customers: {
        business_name: string;
        fantasy_name?: string | null;
        cuit?: string | null;
        phone?: string | null;
        address?: string | null;
      } | null;
      quote_items: QuoteItemRow[];
    };

    if (!quote.customers) {
      return { success: false, error: "Datos del cliente no disponibles" };
    }

    const pdfData: QuotePDFData = {
      quote,
      customer: quote.customers,
      items: quote.quote_items ?? [],
      organization: {
        name: organization.name,
        cuit: organization.cuit ?? undefined,
      },
    };

    const html = generateQuotePDFHTML(pdfData);
    const pdfBuffer = await renderHtmlToPdfBuffer(html);

    const quoteNumber = quote.id.substring(0, 8).toUpperCase();
    const safeDate = quote.created_at
      ? new Date(quote.created_at)
          .toLocaleDateString("es-AR")
          .replace(/\//g, "-")
      : new Date().toLocaleDateString("es-AR").replace(/\//g, "-");
    const filename = `presupuesto_${safeDate}_${quoteNumber}.pdf`;

    const resend = createResendClient();
    const fromName = organization.name || "Rhino";
    const fromEmail = process.env.RESEND_FROM_EMAIL || "empresa@rhinosapp.com";

    const { error } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [recipientEmail],
      subject: `Presupuesto - ${organization.name}`,
      text: `Hola ${recipientName},\n\nAdjuntamos el presupuesto solicitado.\n\nSaludos,\n${organization.name}`,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    if (error) {
      return {
        success: false,
        error: `Error al enviar el email: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Error al enviar el email",
    };
  }
}
