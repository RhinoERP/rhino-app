"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  generateQuotePDFHTML,
  type QuotePDFData,
} from "../service/quote-pdf-generator.service";
import type {
  QuoteItemExtraRow,
  QuoteItemRow,
  QuoteRow,
  QuoteTaxRow,
} from "../types";

type GenerateQuotePDFResult =
  | { success: true; html: string; quoteNumber: string }
  | { success: false; error: string };

export async function generateQuotePDFAction(
  orgSlug: string,
  quoteId: string
): Promise<GenerateQuotePDFResult> {
  await ensure("quotes.manage", orgSlug);
  try {
    const [organization, supabase] = await Promise.all([
      getOrganizationBySlug(orgSlug),
      createClient(),
    ]);

    if (!organization) {
      return { success: false, error: "Organización no encontrada" };
    }

    // Fetch quote with customer and items
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
        quote_items (
          *,
          quote_item_extras (*)
        ),
        quote_taxes (*)
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
      quote_items: (QuoteItemRow & {
        quote_item_extras: QuoteItemExtraRow[];
      })[];
      quote_taxes: QuoteTaxRow[];
    };

    if (!quote.customers) {
      return { success: false, error: "Datos del cliente no disponibles" };
    }

    const pdfData: QuotePDFData = {
      quote,
      customer: quote.customers,
      items: quote.quote_items ?? [],
      taxes: quote.quote_taxes ?? [],
      organization: {
        name: organization.name,
        cuit: organization.cuit ?? undefined,
      },
    };

    const html = generateQuotePDFHTML(pdfData);

    // Format quote number: use first 8 characters of ID in uppercase
    const quoteNumber = quote.id.substring(0, 8).toUpperCase();

    return {
      success: true,
      html,
      quoteNumber,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error al generar el PDF",
    };
  }
}
