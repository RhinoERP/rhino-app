import { z } from "zod";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  SupplierInvoice,
  SupplierInvoiceWithRelations,
} from "../supplier-invoices.types";

const money = z.coerce
  .number()
  .finite()
  .min(0)
  .refine((value) => truncateMoney(value) === value, {
    message: "El importe no puede tener más de dos decimales.",
  });

export const createSupplierInvoiceSchema = z
  .object({
    orgSlug: z.string().min(1),
    supplierId: z.string().uuid(),
    purchaseOrderId: z.string().uuid().nullable(),
    invoiceType: z.enum(["A", "B", "C", "M", "E", "Otro"]),
    pointOfSale: z.string().trim().max(20).nullable(),
    invoiceNumber: z.string().trim().min(1).max(100),
    invoiceDate: z.string().date(),
    dueDate: z.string().date().nullable(),
    subtotalAmount: money,
    taxAmount: money,
    totalAmount: money,
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

function supplierInvoicesTable(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  // This migration adds the table. Keep this boundary isolated until the
  // generated Supabase types are refreshed in the deployment environment.
  return supabase.from("supplier_invoices" as never);
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
      "id, organization_id, supplier_id, purchase_order_id, invoice_type, point_of_sale, invoice_number, invoice_date, due_date, subtotal_amount, tax_amount, total_amount, currency, status, invoice_pdf_url, invoice_filename, notes, created_at, created_by, supplier:suppliers(id, name), purchase_order:purchase_orders(id, purchase_number)"
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

  return (data ?? []) as unknown as SupplierInvoiceWithRelations[];
}

export async function createSupplierInvoice(
  input: CreateSupplierInvoiceInput
): Promise<SupplierInvoice> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autorizado");
  }

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", input.supplierId)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!supplier) {
    throw new Error("Proveedor no encontrado");
  }

  if (input.purchaseOrderId) {
    const { data: purchaseOrder } = await supabase
      .from("purchase_orders")
      .select("id, supplier_id")
      .eq("id", input.purchaseOrderId)
      .eq("organization_id", org.id)
      .maybeSingle();

    if (!purchaseOrder) {
      throw new Error("Orden de compra no encontrada");
    }
    if (purchaseOrder.supplier_id !== input.supplierId) {
      throw new Error("La orden de compra corresponde a otro proveedor");
    }
  }

  const { data, error } = await supplierInvoicesTable(supabase)
    .insert({
      organization_id: org.id,
      supplier_id: input.supplierId,
      purchase_order_id: input.purchaseOrderId,
      invoice_type: input.invoiceType,
      point_of_sale: input.pointOfSale,
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate,
      due_date: input.dueDate,
      subtotal_amount: truncateMoney(input.subtotalAmount),
      tax_amount: truncateMoney(input.taxAmount),
      total_amount: truncateMoney(input.totalAmount),
      notes: input.notes,
      created_by: user.id,
    } as never)
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new Error("Esta factura ya fue registrada para el proveedor.");
    }
    throw new Error(`No se pudo registrar la factura: ${error?.message}`);
  }

  return data as unknown as SupplierInvoice;
}

export async function attachSupplierInvoicePdf(params: {
  invoiceId: string;
  orgSlug: string;
  filename: string;
  url: string;
}): Promise<void> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(params.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const { error } = await supplierInvoicesTable(supabase)
    .update({
      invoice_pdf_url: params.url,
      invoice_filename: params.filename,
    } as never)
    .eq("id", params.invoiceId)
    .eq("organization_id", org.id);
  if (error) {
    throw new Error(`No se pudo adjuntar la factura: ${error.message}`);
  }
}

export async function deleteSupplierInvoice(params: {
  invoiceId: string;
  orgSlug: string;
}): Promise<void> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(params.orgSlug);
  if (!org?.id) {
    return;
  }

  await supplierInvoicesTable(supabase)
    .delete()
    .eq("id", params.invoiceId)
    .eq("organization_id", org.id);
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
