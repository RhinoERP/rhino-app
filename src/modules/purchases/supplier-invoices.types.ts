export const SUPPLIER_INVOICE_TYPES = [
  "A",
  "B",
  "C",
  "M",
  "E",
  "Otro",
] as const;

export type SupplierInvoiceType = (typeof SUPPLIER_INVOICE_TYPES)[number];

export type SupplierInvoice = {
  id: string;
  organization_id: string;
  supplier_id: string;
  purchase_order_id: string | null;
  invoice_type: SupplierInvoiceType;
  point_of_sale: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: "REGISTERED" | "CANCELLED";
  invoice_pdf_url: string | null;
  invoice_filename: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

export type SupplierInvoiceWithRelations = SupplierInvoice & {
  supplier: { id: string; name: string } | null;
  purchase_order: { id: string; purchase_number: number | null } | null;
};

export type SupplierInvoicePurchaseOrderOption = {
  id: string;
  purchase_number: number | null;
  supplier_id: string | null;
  total_amount: number;
  status: string;
};
