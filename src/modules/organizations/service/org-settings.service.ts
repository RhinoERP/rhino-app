import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "./organizations.service";

export const OrgSettingsSchema = z.object({
  accounting_integration_enabled: z.boolean().default(false),
  credit_note_accounting_modal_enabled: z.boolean().default(false),
  remittance_single_page_duplicate: z.boolean().default(false),
  invoice_email_from_name: z.string().trim().max(80).default(""),
  invoice_email_subject_template: z.string().trim().max(160).default(""),
  invoice_email_body_template: z.string().trim().max(2000).default(""),
  invoice_email_attach_pdf: z.boolean().default(true),
  require_carrier_on_dispatch: z.boolean().default(false),
  due_days_enabled: z.boolean().default(false),
  due_days_default: z.number().int().min(1).default(30),
  configurable_price_lists_enabled: z.boolean().default(false),
  initial_balances_enabled: z.boolean().default(false),
  sales_default_tax_ids: z.array(z.string().uuid()).default([]),
  sales_enabled_payment_methods: z
    .array(
      z.enum([
        "efectivo",
        "tarjeta_de_credito",
        "tarjeta_de_debito",
        "transferencia",
        "cheque",
        "deposito",
        "e-cheq",
      ])
    )
    .default([]),
  sales_default_payment_method: z
    .enum([
      "efectivo",
      "tarjeta_de_credito",
      "tarjeta_de_debito",
      "transferencia",
      "cheque",
      "deposito",
      "e-cheq",
    ])
    .default("efectivo"),
  sales_default_invoice_type: z
    .enum([
      "NOTA_DE_VENTA",
      "FACTURA_A",
      "FACTURA_A_RETENCION",
      "FACTURA_B",
      "FACTURA_C",
      "FACTURA_E",
    ])
    .default("NOTA_DE_VENTA"),
});

export type OrgSettings = z.infer<typeof OrgSettingsSchema>;

export async function getOrgSettings(orgSlug: string): Promise<OrgSettings> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Error al obtener configuración: ${error.message}`);
  }

  return OrgSettingsSchema.parse(data?.settings ?? {});
}

export async function updateOrgSettings(
  orgSlug: string,
  patch: Partial<OrgSettings>
): Promise<OrgSettings> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const current = await getOrgSettings(orgSlug);
  const merged = OrgSettingsSchema.parse({ ...current, ...patch });

  const supabase = await createClient();

  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: org.id,
      settings: merged,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) {
    throw new Error(`Error al actualizar configuración: ${error.message}`);
  }

  return merged;
}
