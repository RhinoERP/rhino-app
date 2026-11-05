import { z } from "zod";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  SUPPLIER_INVOICE_TYPES,
  type SupplierInvoice,
  type SupplierInvoiceWithRelations,
} from "../supplier-invoices.types";

const money = z.coerce
  .number()
  .finite()
  .min(0)
  .refine((value) => truncateMoney(value) === value, {
    message: "El importe no puede tener más de dos decimales.",
  });

const invoiceEnums = z.object({
  invoice_type: z.enum(SUPPLIER_INVOICE_TYPES),
  payable_model: z.enum(["LEGACY_OC", "INVOICE", "UNRESOLVED"]),
  status: z.enum(["REGISTERED", "CANCELLED"]),
});

function normalizeInvoice<
  T extends { invoice_type: string; payable_model: string; status: string },
>(invoice: T) {
  return { ...invoice, ...invoiceEnums.parse(invoice) };
}

export const createSupplierInvoiceSchema = z
  .object({
    orgSlug: z.string().min(1),
    supplierId: z.string().uuid(),
    purchaseOrderId: z.string().uuid().nullable().default(null),
    purchaseOrderIds: z.array(z.string().uuid()).max(100).default([]),
    currency: z.enum(["ARS", "USD"]).default("ARS"),
    invoiceType: z.enum(["A", "B", "C", "M", "E", "Otro"]),
    pointOfSale: z.string().trim().max(20).nullable(),
    invoiceNumber: z.string().trim().min(1).max(100),
    invoiceDate: z.string().date(),
    dueDate: z.string().date().nullable(),
    subtotalAmount: money,
    taxAmount: money,
    totalAmount: money,
    exchangeRate: z
      .preprocess(
        (value) =>
          value === null || value === undefined || value === ""
            ? undefined
            : String(value),
        z.string().optional()
      )
      .transform((value) => (value === undefined ? undefined : Number(value)))
      .refine(
        (value) => value === undefined || (Number.isFinite(value) && value > 0),
        { message: "La cotización debe ser un número mayor a cero." }
      ),
    notes: z.string().trim().max(2000).nullable(),
  })
  .superRefine((value, ctx) => {
    const expectedTotal = truncateMoney(value.subtotalAmount + value.taxAmount);
    if (value.totalAmount !== expectedTotal) {
      ctx.addIssue({
        code: "custom",
        path: ["totalAmount"],
        message: "El total debe ser igual al subtotal más los impuestos.",
      });
    }
  });

export type CreateSupplierInvoiceInput = z.infer<
  typeof createSupplierInvoiceSchema
>;

const ROLLED_BACK_INVOICE_CODES = new Set([
  "23505",
  "23503",
  "23514",
  "23502",
  "22023",
  "22P02",
  "22007",
  "22008",
  "22003",
  "42501",
  "P0001",
  "40001",
  "40P01",
]);

export class SupplierInvoiceRegistrationError extends Error {
  readonly stagedFileCanBeRemoved: boolean;
  constructor(message: string, stagedFileCanBeRemoved: boolean) {
    super(message);
    this.name = "SupplierInvoiceRegistrationError";
    this.stagedFileCanBeRemoved = stagedFileCanBeRemoved;
  }
}

function supplierInvoicesTable(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  return supabase.from("supplier_invoices");
}

export async function getSupplierInvoices(
  orgSlug: string
): Promise<SupplierInvoiceWithRelations[]> {
  const [supabase, org] = await Promise.all([
    createClient(),
    getOrganizationBySlug(orgSlug),
  ]);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const [{ data: authData }, permissionsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_user_org_permissions_by_slug", {
      target_org_slug: orgSlug,
    }),
  ]);
  const permissions = (permissionsResult.data ?? []) as string[];
  const canViewAll =
    permissions.includes("organization.admin") ||
    permissions.includes("purchases.read.all") ||
    permissions.includes("purchases.manage.all");

  let query = supplierInvoicesTable(supabase)
    .select(
      "*, supplier:suppliers(id, name), purchase_order:purchase_orders!supplier_invoices_purchase_order_id_fkey(id, purchase_number), order_links:supplier_invoice_purchase_orders!supplier_invoice_purchase_orders_supplier_invoice_id_fkey(purchase_order_id, purchase_order:purchase_orders(id, purchase_number))"
    )
    .eq("organization_id", org.id)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!canViewAll && authData.user?.id) {
    query = query.eq("created_by", authData.user.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`No se pudieron obtener las facturas: ${error.message}`);
  }

  return (data ?? []).map((invoice) => ({
    ...normalizeInvoice(invoice),
    purchase_orders: invoice.order_links.map(
      (link) =>
        link.purchase_order ?? {
          id: link.purchase_order_id,
          purchase_number: null,
        }
    ),
  }));
}

export async function createSupplierInvoice(
  input: CreateSupplierInvoiceInput,
  attachment?: { path: string; filename: string }
): Promise<SupplierInvoice> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new SupplierInvoiceRegistrationError(
      "Organización no encontrada",
      true
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new SupplierInvoiceRegistrationError("No autorizado", true);
  }

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", input.supplierId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!supplier) {
    throw new SupplierInvoiceRegistrationError("Proveedor no encontrado", true);
  }

  const { data, error } = await supabase.rpc(
    "create_supplier_invoice_with_payable",
    {
      p_org_id: org.id,
      p_purchase_order_ids: [
        ...new Set([
          ...input.purchaseOrderIds,
          ...(input.purchaseOrderId ? [input.purchaseOrderId] : []),
        ]),
      ],
      p_invoice: {
        supplier_id: input.supplierId,
        currency: input.currency,
        invoice_type: input.invoiceType,
        point_of_sale: input.pointOfSale,
        invoice_number: input.invoiceNumber,
        invoice_date: input.invoiceDate,
        due_date: input.dueDate,
        subtotal_amount: truncateMoney(input.subtotalAmount),
        tax_amount: truncateMoney(input.taxAmount),
        total_amount: truncateMoney(input.totalAmount),
        exchange_rate: input.exchangeRate ?? null,
        notes: input.notes,
        invoice_pdf_url: attachment?.path ?? null,
        invoice_filename: attachment?.filename ?? null,
      },
    }
  );

  if (error || !data?.[0]) {
    if (error?.code === "23505") {
      throw new SupplierInvoiceRegistrationError(
        "Esta factura ya fue registrada para el proveedor.",
        true
      );
    }
    throw new SupplierInvoiceRegistrationError(
      `No se pudo registrar la factura: ${error?.message ?? "respuesta no confirmada"}`,
      ROLLED_BACK_INVOICE_CODES.has(error?.code ?? "")
    );
  }

  return normalizeInvoice(data[0]);
}

export async function setSupplierInvoiceOrders(params: {
  invoiceId: string;
  orgSlug: string;
  purchaseOrderIds: string[];
}): Promise<void> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(params.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }
  const { data: invoice, error: readError } = await supplierInvoicesTable(
    supabase
  )
    .select("id")
    .eq("id", params.invoiceId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (readError || !invoice) {
    throw new Error("Factura no disponible");
  }
  const { error } = await supabase.rpc("set_supplier_invoice_purchase_orders", {
    p_invoice_id: invoice.id,
    p_purchase_order_ids: [...new Set(params.purchaseOrderIds)],
  });
  if (error) {
    throw new Error(error.message);
  }
}

export function formatSupplierInvoiceReference(
  invoice: Pick<
    SupplierInvoice,
    "invoice_type" | "point_of_sale" | "invoice_number"
  >
): string {
  return [invoice.invoice_type, invoice.point_of_sale, invoice.invoice_number]
    .filter(Boolean)
    .join("-");
}
