import { z } from "zod";

/**
 * Schema for organization_settings.settings JSONB column.
 * Add new settings here — never touches the organizations table.
 * Existing settings (remittance_auto_enabled, etc.) remain in organizations.
 */
export const organizationSettingsSchema = z.object({
  remittance_single_page_duplicate: z.boolean().default(false),
  invoice_email_from_name: z.string().trim().max(80).default(""),
  invoice_email_subject_template: z.string().trim().max(160).default(""),
  invoice_email_body_template: z.string().trim().max(2000).default(""),
  invoice_email_attach_pdf: z.boolean().default(true),
  due_days_enabled: z.boolean().default(false),
  due_days_default: z.number().int().min(1).default(30),
  accounting_integration_enabled: z.boolean().default(false),
  credit_note_accounting_modal_enabled: z.boolean().default(false),
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
        "qr",
        "cheque",
        "deposito",
        "e-cheq",
      ])
    )
    .default([]),
  non_invoiced_payment_methods: z
    .array(
      z.enum([
        "efectivo",
        "tarjeta_de_credito",
        "tarjeta_de_debito",
        "transferencia",
        "qr",
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
      "qr",
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

export type OrganizationSettingsData = z.infer<
  typeof organizationSettingsSchema
>;

export const ORGANIZATION_SETTINGS_DEFAULTS: OrganizationSettingsData = {
  remittance_single_page_duplicate: false,
  invoice_email_from_name: "",
  invoice_email_subject_template: "",
  invoice_email_body_template: "",
  invoice_email_attach_pdf: true,
  due_days_enabled: false,
  due_days_default: 30,
  accounting_integration_enabled: false,
  credit_note_accounting_modal_enabled: false,
  configurable_price_lists_enabled: false,
  initial_balances_enabled: false,
  sales_default_tax_ids: [],
  sales_enabled_payment_methods: [],
  non_invoiced_payment_methods: [],
  sales_default_payment_method: "efectivo",
  sales_default_invoice_type: "NOTA_DE_VENTA",
};
