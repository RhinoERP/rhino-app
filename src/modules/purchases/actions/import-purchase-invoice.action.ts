"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { truncateMoney } from "@/lib/decimal";
import { getCurrentUser } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { AiBudgetExceededError } from "@/modules/commercial-ai/service/usage.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  extractInvoiceFromPdf,
  InvoiceReadError,
} from "../invoice-import/extract-invoice.service";
import {
  type LineMatch,
  matchLine,
  matchSupplier,
  type SupplierMatch,
} from "../invoice-import/matching";
import type { ExtractedInvoice } from "../invoice-import/schema";
import {
  getAllProductsByOrg,
  getProductsBySupplier,
  type ProductWithPrice,
} from "../service/purchases.service";
import {
  attachSupplierInvoicePdf,
  createSupplierInvoice,
  createSupplierInvoiceSchema,
} from "../service/supplier-invoices.service";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IMPORT_FOLDER = "facturas_importadas";
const PDF_MAGIC = "%PDF";
const SAFE_PATH = /^[a-z0-9-]+\/facturas_importadas\/[a-f0-9-]{36}\.pdf$/;

function validPath(orgSlug: string, path: string): boolean {
  return (
    SAFE_PATH.test(path) && path.startsWith(`${orgSlug}/${IMPORT_FOLDER}/`)
  );
}

/**
 * Lugar para subir el PDF directo a Storage (sin pasar por el servidor, que
 * tiene límite de 1 MB). La URL firmada sirve para un solo archivo.
 */
export async function createInvoiceUploadAction(
  orgSlug: string
): Promise<
  | { success: true; path: string; token: string }
  | { success: false; error: string }
> {
  if (!orgSlug) {
    return { success: false, error: "Organización no especificada" };
  }
  await ensure("purchases.manage", orgSlug);
  const path = `${orgSlug}/${IMPORT_FOLDER}/${randomUUID()}.pdf`;
  const { data, error } = await createAdminClient()
    .storage.from("documents")
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error("Compras: no se pudo preparar la subida", error);
    return { success: false, error: "No se pudo preparar la subida del PDF." };
  }
  return { success: true, path: data.path, token: data.token };
}

export type ImportedInvoiceLine = {
  index: number;
  match: LineMatch;
};

export type ImportPurchaseInvoiceResult =
  | {
      success: true;
      invoice: ExtractedInvoice;
      supplier: SupplierMatch;
      lines: ImportedInvoiceLine[];
      /** Productos sugeridos o elegidos, para armar los ítems sin esperar. */
      products: ProductWithPrice[];
      /** Ya hay una factura con este número para el proveedor. */
      duplicate: boolean;
    }
  | { success: false; error: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadAliases(
  supabase: Supabase,
  organizationId: string,
  supplierId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("purchase_invoice_product_aliases" as never)
    .select("alias_key, product_id")
    .eq("organization_id", organizationId)
    .eq("supplier_id", supplierId);
  return new Map(
    ((data ?? []) as { alias_key: string; product_id: string }[]).map((row) => [
      row.alias_key,
      row.product_id,
    ])
  );
}

async function isDuplicate(
  supabase: Supabase,
  organizationId: string,
  supplierId: string,
  invoice: ExtractedInvoice
): Promise<boolean> {
  let query = supabase
    .from("supplier_invoices" as never)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("supplier_id", supplierId)
    .eq("invoice_number", invoice.numero)
    .neq("status", "CANCELLED");
  if (invoice.punto_de_venta) {
    query = query.eq("point_of_sale", invoice.punto_de_venta);
  }
  const { data } = await query.limit(1);
  return Boolean(data?.length);
}

class ImportInputError extends Error {}

function failure(error: unknown): { success: false; error: string } {
  if (
    error instanceof InvoiceReadError ||
    error instanceof AiBudgetExceededError ||
    error instanceof ImportInputError
  ) {
    return { success: false, error: error.message };
  }
  console.error("Compras: no se pudo leer la factura", error);
  return {
    success: false,
    error: "No pude leer la factura. Probá de nuevo o cargala a mano.",
  };
}

/** Baja el PDF que subió el navegador y controla que sea un PDF razonable. */
async function readUploadedPdf(path: string) {
  const { data: blob, error } = await createAdminClient()
    .storage.from("documents")
    .download(path);
  if (error || !blob) {
    throw new ImportInputError("No se pudo leer el PDF subido.");
  }
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length > MAX_FILE_SIZE) {
    throw new ImportInputError("El PDF no puede superar los 10 MB.");
  }
  if (bytes.subarray(0, PDF_MAGIC.length).toString() !== PDF_MAGIC) {
    throw new ImportInputError("La factura tiene que ser un PDF.");
  }
  return bytes;
}

function userNameOf(claims: Record<string, unknown>): string {
  const metadata = claims.user_metadata as Record<string, unknown> | undefined;
  return (
    (metadata?.full_name as string | undefined) ??
    (claims.email as string | undefined) ??
    ""
  );
}

/** Proveedor, productos y equivalencias recordadas para cada línea. */
async function matchInvoice(
  supabase: Supabase,
  org: { id: string; cuit?: string | null },
  orgSlug: string,
  invoice: ExtractedInvoice
) {
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, cuit")
    .eq("organization_id", org.id)
    .eq("is_active", true);
  const supplier = matchSupplier(invoice.proveedor, suppliers ?? [], org.cuit);
  const supplierId = supplier.supplierId;
  const products = supplierId
    ? await getProductsBySupplier(orgSlug, supplierId)
    : await getAllProductsByOrg(orgSlug);
  const matchable = products
    .filter((p): p is ProductWithPrice & { id: string; name: string } =>
      Boolean(p.id && p.name)
    )
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku, brand: p.brand }));
  const aliases = supplierId
    ? await loadAliases(supabase, org.id, supplierId)
    : new Map<string, string>();
  const lines = invoice.lineas.map((line, index) => ({
    index,
    match: matchLine(line, matchable, aliases),
  }));
  const referenced = new Set(
    lines.flatMap((l) => [
      ...(l.match.productId ? [l.match.productId] : []),
      ...l.match.candidates,
    ])
  );
  return {
    supplier,
    lines,
    products: products.filter((p) => p.id && referenced.has(p.id)),
    duplicate: supplierId
      ? await isDuplicate(supabase, org.id, supplierId, invoice)
      : false,
  };
}

/** Lee la factura del PDF y la prepara para la compra (no guarda nada). */
export async function importPurchaseInvoiceAction(
  formData: FormData
): Promise<ImportPurchaseInvoiceResult> {
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const path = String(formData.get("path") ?? "");
  if (!orgSlug) {
    return { success: false, error: "Organización no especificada" };
  }
  await ensure("purchases.manage", orgSlug);
  if (!validPath(orgSlug, path)) {
    return { success: false, error: "Elegí el PDF de la factura." };
  }

  try {
    const supabase = await createClient();
    const bytes = await readUploadedPdf(path);
    const [org, user] = await Promise.all([
      getOrganizationBySlug(orgSlug),
      getCurrentUser(),
    ]);
    if (!(org?.id && user)) {
      return { success: false, error: "No se encontró la organización." };
    }
    const invoice = await extractInvoiceFromPdf({
      pdfBase64: bytes.toString("base64"),
      buyerName: org.name,
      buyerCuit: org.cuit ?? null,
      meter: {
        organizationId: org.id,
        userId: user.sub,
        userName: userNameOf(user as Record<string, unknown>),
        feature: "factura",
      },
    });
    return {
      success: true,
      invoice,
      ...(await matchInvoice(supabase, org, orgSlug, invoice)),
    };
  } catch (error) {
    return failure(error);
  }
}

const registerSchema = z.object({
  orgSlug: z.string().min(1),
  purchaseOrderId: z.uuid(),
  supplierId: z.uuid(),
  path: z.string().min(1),
  filename: z.string().max(200),
  registerInvoice: z.boolean(),
  invoice: z.object({
    tipo: z.enum(["A", "B", "C", "M", "E", "Otro"]),
    puntoDeVenta: z.string().max(20).nullable(),
    numero: z.string().min(1).max(100),
    fecha: z.string().date(),
    vencimiento: z.string().date().nullable(),
    subtotal: z.number(),
    total: z.number(),
    cotizacion: z.number().positive().nullable(),
  }),
  aliases: z
    .array(z.object({ key: z.string().min(1).max(120), productId: z.uuid() }))
    .max(500),
});

const SAFE_NAME = /[^a-zA-Z0-9._-]/g;

/**
 * Después de crear la compra: registra la factura del proveedor con el PDF
 * (si se pidió) y recuerda qué producto es cada línea para la próxima vez.
 */
export async function finishPurchaseInvoiceImportAction(
  input: z.infer<typeof registerSchema>
): Promise<{ success: boolean; error?: string }> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Datos de la factura inválidos." };
  }
  const data = parsed.data;
  await ensure("purchases.manage", data.orgSlug);
  if (!validPath(data.orgSlug, data.path)) {
    return { success: false, error: "No se encontró el PDF de la factura." };
  }
  const [org, user] = await Promise.all([
    getOrganizationBySlug(data.orgSlug),
    getCurrentUser(),
  ]);
  if (!org?.id) {
    return { success: false, error: "No se encontró la organización." };
  }
  const supabase = await createClient();

  if (data.aliases.length) {
    const { error } = await supabase
      .from("purchase_invoice_product_aliases" as never)
      .upsert(
        data.aliases.map((alias) => ({
          organization_id: org.id,
          supplier_id: data.supplierId,
          alias_key: alias.key,
          product_id: alias.productId,
          updated_by: user?.sub ?? null,
          updated_at: new Date().toISOString(),
        })) as never,
        { onConflict: "organization_id,supplier_id,alias_key" }
      );
    if (error) {
      console.warn("Compras: no se guardaron equivalencias", error.message);
    }
  }

  if (!data.registerInvoice) {
    await createAdminClient().storage.from("documents").remove([data.path]);
    return { success: true };
  }

  const subtotal = truncateMoney(data.invoice.subtotal);
  const total = truncateMoney(data.invoice.total);
  const invoiceInput = createSupplierInvoiceSchema.safeParse({
    orgSlug: data.orgSlug,
    supplierId: data.supplierId,
    purchaseOrderId: data.purchaseOrderId,
    invoiceType: data.invoice.tipo,
    pointOfSale: data.invoice.puntoDeVenta,
    invoiceNumber: data.invoice.numero,
    invoiceDate: data.invoice.fecha,
    dueDate: data.invoice.vencimiento,
    subtotalAmount: subtotal,
    taxAmount: truncateMoney(total - subtotal),
    totalAmount: total,
    exchangeRate: data.invoice.cotizacion ?? undefined,
    notes: "Cargada desde el PDF de la factura.",
  });
  if (!invoiceInput.success) {
    return {
      success: false,
      error: `La compra se creó, pero no la factura: ${invoiceInput.error.issues[0]?.message ?? "datos inválidos"}`,
    };
  }
  try {
    const invoice = await createSupplierInvoice(invoiceInput.data);
    const filename =
      data.filename.normalize("NFD").replace(SAFE_NAME, "_") || "factura.pdf";
    const target = `${data.orgSlug}/${invoice.id}/facturas_proveedor/${filename}`;
    const { error: moveError } = await createAdminClient()
      .storage.from("documents")
      .move(data.path, target);
    if (!moveError) {
      await attachSupplierInvoicePdf({
        invoiceId: invoice.id,
        orgSlug: data.orgSlug,
        filename,
        url: target,
      });
    }
    revalidatePath(`/org/${data.orgSlug}/compras/facturas-proveedor`);
    revalidatePath(`/org/${data.orgSlug}/compras/${data.purchaseOrderId}`);
    revalidatePath(`/org/${data.orgSlug}/cobranzas`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `La compra se creó, pero no la factura: ${error instanceof Error ? error.message : "error desconocido"}`,
    };
  }
}
