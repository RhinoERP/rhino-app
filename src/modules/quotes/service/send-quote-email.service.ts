import "server-only";

import { formatDateOnly } from "@/lib/format";
import { requireAuth } from "@/lib/supabase/auth";
import { renderHtmlToPdfBuffer } from "@/modules/arca/server/html-to-pdf.service";
import { createResendClient } from "@/modules/email/client";
import { QuoteEmail } from "@/modules/email/templates/quote-email";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { QuoteItemRow, QuoteRow } from "../types";
import type { QuotePDFData } from "./quote-pdf-generator.service";
import { generateQuotePDFHTML } from "./quote-pdf-generator.service";

export async function sendQuoteEmail(input: {
  orgSlug: string;
  quoteId: string;
  recipientEmail: string;
  recipientName: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAuth();
  if (!auth) {
    return { success: false, error: "No autorizado" };
  }

  const { supabase } = auth;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email;

  const { orgSlug, quoteId, recipientEmail, recipientName } = input;

  const organization = await getOrganizationBySlug(orgSlug);
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
    ? formatDateOnly(quote.created_at).replace(/\//g, "-")
    : formatDateOnly(new Date().toISOString()).replace(/\//g, "-");
  const filename = `presupuesto_${safeDate}_${quoteNumber}.pdf`;

  if (!userEmail) {
    return {
      success: false,
      error: "El usuario no tiene un email configurado",
    };
  }

  const resend = createResendClient();

  const { error } = await resend.emails.send({
    from: `${organization.name} <${userEmail}>`,
    to: [recipientEmail],
    subject: `Presupuesto - ${organization.name}`,
    react: QuoteEmail({
      customerName: recipientName,
      organizationName: organization.name,
    }),
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

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ status: "SENT", updated_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("organization_id", organization.id);

  if (updateError) {
    console.error("Error al actualizar status a SENT:", updateError.message);
  }

  return { success: true };
}
