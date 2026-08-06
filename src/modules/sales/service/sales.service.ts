import { randomUUID } from "node:crypto";
import {
  asentarInformalEntry,
  cancelInformalEntry,
  formalizarEntry,
} from "@/lib/accounting-server";
import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { isAccountingIntegrationEnabled } from "@/modules/accounting/service/accounting-integration.service";
import { getCategoryAccountingRules } from "@/modules/categories/service/categories.service";
import { regenerateChildOrderRemitos } from "@/modules/orders/server/regenerate-order-remitos.service";
import { getOrganizationSettings } from "@/modules/organizations/actions/get-organization-settings.action";
import { getOrganizationMembersWithUsersAdmin } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  buildItemizedTaxPlan,
  type ItemizedTaxPlan,
  type ItemTaxInput,
  type TaxableItemLine,
  toFallbackItemTaxes,
} from "@/modules/taxes/item-tax-calculations";
import { getProductTaxAssignments } from "@/modules/taxes/product-tax.service";
import type { Database } from "@/types/supabase";
import { uploadSalesDocument } from "../server/documents-storage.service";
import { renderRemittancePdfDocument } from "../server/remittance-pdf-renderer.service";
import type {
  ConfirmSaleItemInput,
  ConfirmSaleOrderInput,
  CreatePreSaleOrderInput,
  DeliverSaleOrderInput,
  DispatchSaleOrderInput,
  PaginatedResult,
  PreSaleItemInput,
  ReceivableStatus,
  SaleItemType,
  SaleProduct,
  SalesExportItem,
  SalesMetrics,
  SalesOrderStatus,
  SalesPaginatedParams,
  UpdateSaleOrderInput,
} from "../types";
import {
  computeDueDate,
  computeReceivableDueDateFromDispatch,
} from "../utils/date";
import { applySalesDateFilters } from "./sales-filters";
import { getAuthorizedSaleFiscalUpdateFields } from "./sales-update-guards";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const defaultInvoiceType: Database["public"]["Enums"]["invoice_type"] =
  "NOTA_DE_VENTA";

// Explicitly add remittance_number because generated types might be outdated
export type SalesOrder = Database["public"]["Tables"]["sales_orders"]["Row"] & {
  accounting_informal_entry_id?: string | null;
  remittance_number?: string | null;
  remittance_pdf_url?: string | null;
  invoice_pdf_url?: string | null;
};

export type SalesSeller = {
  id: string;
  name?: string;
  email?: string;
};

export type SalesOrderAccess = {
  canManage: boolean;
  canViewAll: boolean;
};

type SalesReadScope = "all" | "own";

export type SalesAccessContext = {
  currentUser: {
    id: string;
    email?: string;
    name?: string;
  } | null;
  userId: string | null;
  permissions: string[];
  scope: SalesReadScope;
  canRead: boolean;
  canManage: boolean;
  canManageAll: boolean;
  canViewAll: boolean;
  isOrganizationAdmin: boolean;
};

export type SalesOrderWithCustomer = SalesOrder & {
  customer: {
    id: string;
    business_name: string;
    fantasy_name: string | null;
    cuit: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    delivery_address: string | null;
    delivery_city: string | null;
    tax_condition: string | null;
    preferred_carrier_id: string | null;
  };
  carrier: { id: string; name: string } | null;
  seller: SalesSeller | null;
  receivable: {
    status: ReceivableStatus | null;
    pending_balance: number | null;
    total_amount: number | null;
  } | null;
  access: SalesOrderAccess;
  items?: SalesExportItem[];
};

type SalesOrderWithCustomerRaw = SalesOrder & {
  customer:
    | {
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        cuit?: string | null;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
        city?: string | null;
        delivery_address?: string | null;
        delivery_city?: string | null;
        tax_condition?: string | null;
        preferred_carrier_id?: string | null;
      }
    | Array<{
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        cuit?: string | null;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
        city?: string | null;
        delivery_address?: string | null;
        delivery_city?: string | null;
        tax_condition?: string | null;
        preferred_carrier_id?: string | null;
      }>
    | null;
  carrier?:
    | { id?: string | null; name?: string | null }
    | Array<{ id?: string | null; name?: string | null }>
    | null;
  receivable?:
    | {
        id?: string | null;
        status?: ReceivableStatus | null;
        pending_balance?: number | null;
        total_amount?: number | null;
      }
    | Array<{
        id?: string | null;
        status?: ReceivableStatus | null;
        pending_balance?: number | null;
        total_amount?: number | null;
      }>
    | null;
  items?: SalesOrderItemRaw[] | null;
};

type SalesOrderItemRaw = Partial<
  Database["public"]["Tables"]["sales_order_items"]["Row"]
> & {
  unit_quantity?: number | null;
  base_price?: number | null;
  discount_amount?: number | null;
  discount_percentage?: number | null;
  subtotal?: number | null;
  product?: {
    id?: string | null;
    name?: string | null;
    sku?: string | null;
    brand?: string | null;
    unit_of_measure?:
      | Database["public"]["Enums"]["unit_of_measure_type"]
      | null;
    supplier?:
      | {
          name?: string | null;
        }
      | Array<{
          name?: string | null;
        }>
      | null;
    tracks_stock_units?: boolean | null;
    weight_per_unit?: number | null;
    category_id?: string | null;
    accounting_account_code?: string | null;
  } | null;
  item_taxes?: Array<{
    tax_id?: string | null;
    name?: string | null;
    rate?: number | null;
    tax_code_snapshot?: string | null;
    source?: string | null;
  }> | null;
};

type SalesOrderWithRelations = SalesOrderWithCustomerRaw & {
  items?: SalesOrderItemRaw[] | null;
  taxes?: Array<{
    id?: string | null;
    tax_id?: string | null;
    name?: string | null;
    rate?: number | null;
    tax_amount?: number | null;
    base_amount?: number | null;
    tax_code_snapshot?: string | null;
  }> | null;
  global_discount_percentage?: number | null;
  global_discount_amount?: number | null;
  invoice_number?: string | null;
  observations?: string | null;
  credit_days?: number | null;
  supplier?:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};

export type SalesOrderTaxDetail = {
  id?: string;
  taxId: string;
  name: string;
  rate: number;
  taxAmount: number;
  baseAmount?: number | null;
  taxCodeSnapshot: string | null;
};

type SaleTaxAmount = {
  taxId: string;
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
};

type SaleTaxAmountWithSnapshot = SaleTaxAmount & {
  taxCodeSnapshot: string | null;
};

export type SalesOrderItemDetail = {
  id: string;
  type: SaleItemType;
  productId: string | null;
  productVariantId?: string | null;
  productVariantName?: string | null;
  description?: string | null;
  name: string;
  sku: string;
  brand?: string | null;
  quantity: number;
  weightQuantity: number | null;
  unitPrice: number;
  basePrice: number;
  discountPercent: number;
  subtotal: number;
  unitOfMeasure: SaleProduct["unitOfMeasure"];
  tracksStockUnits: boolean;
  accountingAccountCode?: string | null;
  averageQuantityPerUnit: number | null;
  taxes?: ItemTaxInput[];
};

export type SalesOrderDetail = Omit<SalesOrderWithCustomer, "items"> & {
  invoice_number: string | null;
  credit_days: number | null;
  observations: string | null;
  global_discount_percentage: number | null;
  global_discount_amount: number | null;
  remittance_number: string | null;
  remittance_pdf_url?: string | null;
  invoice_pdf_url?: string | null;
  items: SalesOrderItemDetail[];
  taxes: SalesOrderTaxDetail[];
  supplier?: { id: string; name: string } | null;
};

export type ConfirmSaleResult = {
  status: SalesOrderStatus;
  saleId: string;
  totalAmount: number;
};

type ProductWithPriceRow =
  Database["public"]["Views"]["products_with_price"]["Row"];

type ProductWithRelations = ProductWithPriceRow & {
  suppliers?: { name: string | null } | null;
  categories?: { name: string | null } | null;
};

type ProductStockSettings = {
  tracksStockUnits: boolean;
  weightPerUnit: number | null;
  unitsPerBox: number | null;
  boxesPerPallet: number | null;
  hasVariants: boolean;
  accountingAccountCode: string | null;
};

type StockTotals = {
  totalQuantity: number;
  totalUnits: number | null;
};

const SUPABASE_IN_FILTER_BATCH_SIZE = 100;

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function sanitizeText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function fetchTaxCodeSnapshotMap(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  taxIds: string[];
}): Promise<Map<string, string | null>> {
  if (params.taxIds.length === 0) {
    return new Map();
  }

  const { data, error } = await params.supabase
    .from("taxes")
    .select("id, code")
    .eq("organization_id", params.orgId)
    .in("id", params.taxIds);

  if (error) {
    throw new Error(
      `No se pudieron obtener los códigos fiscales de los impuestos: ${error.message}`
    );
  }

  return new Map(
    (data ?? []).map((tax) => [tax.id, sanitizeText(tax.code)] as const)
  );
}

async function attachTaxCodeSnapshots(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  taxes: SaleTaxAmount[];
}): Promise<SaleTaxAmountWithSnapshot[]> {
  if (params.taxes.length === 0) {
    return [];
  }

  const taxCodeSnapshotMap = await fetchTaxCodeSnapshotMap({
    supabase: params.supabase,
    orgId: params.orgId,
    taxIds: Array.from(new Set(params.taxes.map((tax) => tax.taxId))),
  });

  return params.taxes.map((tax) => ({
    ...tax,
    taxCodeSnapshot: taxCodeSnapshotMap.get(tax.taxId) ?? null,
  }));
}

function resolveFallbackSaleTaxes(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  taxes: Array<{ taxId: string; name: string; rate: number }> | undefined;
}): Promise<SaleTaxAmountWithSnapshot[]> {
  return attachTaxCodeSnapshots({
    supabase: params.supabase,
    orgId: params.orgId,
    taxes: (params.taxes ?? []).map((tax) => ({
      taxId: tax.taxId,
      name: tax.name,
      rate: tax.rate,
      baseAmount: 0,
      taxAmount: 0,
    })),
  });
}

function buildSalesOrderTaxesPayload(params: {
  orgId: string;
  saleOrderId: string;
  taxPlan: ItemizedTaxPlan;
}) {
  return params.taxPlan.aggregateTaxes.map((tax) => ({
    organization_id: params.orgId,
    sales_order_id: params.saleOrderId,
    tax_id: tax.taxId,
    name: tax.name,
    rate: tax.rate,
    base_amount: truncateMoney(tax.baseAmount),
    tax_amount: truncateMoney(tax.taxAmount),
    tax_code_snapshot: tax.taxCodeSnapshot,
  }));
}

function buildSalesOrderItemTaxesPayload(params: {
  orgId: string;
  saleOrderId: string;
  taxPlan: ItemizedTaxPlan;
}) {
  return params.taxPlan.itemTaxes.map((tax) => ({
    organization_id: params.orgId,
    sales_order_id: params.saleOrderId,
    sales_order_item_id: tax.lineId,
    product_id: tax.productId,
    tax_id: tax.taxId,
    name: tax.name,
    rate: tax.rate,
    base_amount: truncateMoney(tax.baseAmount),
    tax_amount: truncateMoney(tax.taxAmount),
    tax_code_snapshot: tax.taxCodeSnapshot,
    source: tax.source,
  }));
}

async function insertSalesOrderTaxSnapshots(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleOrderId: string;
  taxPlan: ItemizedTaxPlan;
}) {
  const itemTaxesPayload = buildSalesOrderItemTaxesPayload(params);
  const taxesPayload = buildSalesOrderTaxesPayload(params);

  if (itemTaxesPayload.length > 0) {
    const { error } = await params.supabase
      .from("sales_order_item_taxes" as never)
      .insert(itemTaxesPayload as never);

    if (error) {
      throw new Error(
        `No se pudieron guardar los impuestos por ítem de la venta: ${error.message}`
      );
    }
  }

  if (taxesPayload.length > 0) {
    const { error } = await params.supabase
      .from("sales_order_taxes")
      .insert(taxesPayload as never);

    if (error) {
      throw new Error(
        `No se pudieron guardar los impuestos de la venta: ${error.message}`
      );
    }
  }
}

async function replaceSalesOrderTaxSnapshots(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleOrderId: string;
  taxPlan: ItemizedTaxPlan;
}) {
  const { error: deleteItemTaxesError } = await params.supabase
    .from("sales_order_item_taxes" as never)
    .delete()
    .eq("sales_order_id", params.saleOrderId)
    .eq("organization_id", params.orgId);

  if (deleteItemTaxesError) {
    throw new Error(
      `No se pudieron actualizar los impuestos por ítem: ${deleteItemTaxesError.message}`
    );
  }

  const { error: deleteTaxesError } = await params.supabase
    .from("sales_order_taxes")
    .delete()
    .eq("sales_order_id", params.saleOrderId)
    .eq("organization_id", params.orgId);

  if (deleteTaxesError) {
    throw new Error(
      `No se pudieron actualizar los impuestos: ${deleteTaxesError.message}`
    );
  }

  await insertSalesOrderTaxSnapshots(params);
}

async function syncSaleOrderTaxSnapshots(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
}): Promise<void> {
  const { data: saleTaxes, error: saleTaxesError } = await params.supabase
    .from("sales_order_taxes")
    .select("id, tax_id")
    .eq("organization_id", params.orgId)
    .eq("sales_order_id", params.saleId);

  if (saleTaxesError) {
    throw new Error(
      `No se pudieron obtener los impuestos de la venta: ${saleTaxesError.message}`
    );
  }

  const taxIds = Array.from(
    new Set(
      (saleTaxes ?? [])
        .map((tax) => sanitizeText(tax.tax_id))
        .filter((taxId): taxId is string => Boolean(taxId))
    )
  );

  const taxCodeSnapshotMap = await fetchTaxCodeSnapshotMap({
    supabase: params.supabase,
    orgId: params.orgId,
    taxIds,
  });

  await Promise.all(
    (saleTaxes ?? []).map(async (tax) => {
      const { error } = await params.supabase
        .from("sales_order_taxes")
        .update({
          tax_code_snapshot: taxCodeSnapshotMap.get(tax.tax_id) ?? null,
        })
        .eq("id", tax.id)
        .eq("organization_id", params.orgId);

      if (error) {
        throw new Error(
          `No se pudo guardar el snapshot fiscal del impuesto: ${error.message}`
        );
      }
    })
  );
}

async function getCurrentUserId(
  client: SupabaseServerClient
): Promise<string | null> {
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

function canReadSales(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("sales.read") ||
    permissions.includes("sales.read.all") ||
    permissions.includes("sales.manage") ||
    permissions.includes("sales.manage.all")
  );
}

function canViewAllSales(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("sales.read.all") ||
    permissions.includes("sales.manage.all")
  );
}

function canManageSales(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("sales.manage") ||
    permissions.includes("sales.manage.all")
  );
}

function canManageAllSales(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("sales.manage.all")
  );
}

async function resolveSalesAccessContext(
  supabase: SupabaseServerClient,
  orgSlug: string
): Promise<SalesAccessContext> {
  const [{ data: authData }, permissionsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_user_org_permissions_by_slug", {
      target_org_slug: orgSlug,
    }),
  ]);

  if (permissionsResult.error) {
    console.warn(
      `No se pudieron obtener permisos para ventas (fallback a acceso restringido): ${permissionsResult.error.message}`
    );
  }

  const permissions = permissionsResult.error
    ? []
    : ((permissionsResult.data ?? []) as string[]);
  const currentUser = authData.user
    ? {
        id: authData.user.id,
        email: authData.user.email,
        name:
          authData.user.user_metadata?.full_name ?? authData.user.email ?? "",
      }
    : null;
  const isOrganizationAdmin = permissions.includes("organization.admin");
  const canRead = canReadSales(permissions);
  const canViewAll = canViewAllSales(permissions);
  const canManageAll = canManageAllSales(permissions);

  return {
    currentUser,
    userId: currentUser?.id ?? null,
    permissions,
    scope: canViewAll ? "all" : "own",
    canRead,
    canManage: canManageSales(permissions),
    canManageAll,
    canViewAll,
    isOrganizationAdmin,
  };
}

export async function getSalesAccessContext(
  orgSlug: string
): Promise<SalesAccessContext> {
  const supabase = await createClient();
  return resolveSalesAccessContext(supabase, orgSlug);
}

function assertCanReadSales(accessContext: SalesAccessContext) {
  if (!accessContext.canRead) {
    throw new Error("No tienes permisos para ver ventas");
  }
}

function assertCanManageSales(accessContext: SalesAccessContext) {
  if (!accessContext.canManage) {
    throw new Error("No tienes permisos para gestionar ventas");
  }
}

function assertCanManageSale(
  accessContext: SalesAccessContext,
  saleUserId: string | null
) {
  assertCanManageSales(accessContext);

  if (accessContext.isOrganizationAdmin || accessContext.canManageAll) {
    return;
  }

  if (!accessContext.userId || saleUserId !== accessContext.userId) {
    throw new Error("Solo puedes gestionar tus propias ventas");
  }
}

function assertCanAssignSeller(
  accessContext: SalesAccessContext,
  sellerId: string | null
) {
  if (!sellerId) {
    throw new Error("El vendedor es requerido");
  }

  if (accessContext.isOrganizationAdmin || accessContext.canManageAll) {
    return;
  }

  if (!accessContext.userId || sellerId !== accessContext.userId) {
    throw new Error("No puedes asignar ventas a otro vendedor");
  }
}

function buildSalesOrderAccess(
  saleUserId: string | null,
  accessContext: SalesAccessContext
): SalesOrderAccess {
  return {
    canManage:
      accessContext.isOrganizationAdmin ||
      accessContext.canManageAll ||
      (accessContext.canManage &&
        Boolean(accessContext.userId) &&
        saleUserId === accessContext.userId),
    canViewAll: accessContext.canViewAll,
  };
}

async function getSellersByUserId(
  orgSlug: string,
  accessContext: SalesAccessContext
): Promise<Map<string, SalesSeller>> {
  const sellersByUserId = new Map<string, SalesSeller>();

  if (accessContext.canViewAll) {
    try {
      const members = await getOrganizationMembersWithUsersAdmin(orgSlug);

      for (const member of members) {
        if (!member.user_id) {
          continue;
        }

        sellersByUserId.set(member.user_id, {
          id: member.user_id,
          name: member.user?.name,
          email: member.user?.email,
        });
      }
    } catch (error) {
      console.warn("No se pudo inicializar la carga ampliada de vendedores", {
        error,
      });
    }
  }

  if (
    accessContext.currentUser &&
    !sellersByUserId.has(accessContext.currentUser.id)
  ) {
    sellersByUserId.set(accessContext.currentUser.id, {
      id: accessContext.currentUser.id,
      name: accessContext.currentUser.name,
      email: accessContext.currentUser.email,
    });
  }

  return sellersByUserId;
}

function resolveSeller(
  userId: string | null,
  sellersByUserId: Map<string, SalesSeller>
): SalesSeller | null {
  if (!userId) {
    return null;
  }

  return sellersByUserId.get(userId) ?? { id: userId };
}

function normalizeCustomerFromSale(
  sale: SalesOrderWithCustomerRaw
): SalesOrderWithCustomer["customer"] {
  const customer = Array.isArray(sale.customer)
    ? sale.customer[0]
    : sale.customer;

  const normalizedCustomer =
    customer && typeof customer === "object" && "id" in customer
      ? {
          id: (customer.id as string) ?? sale.customer_id,
          business_name:
            (customer.business_name as string | null) ?? "Cliente desconocido",
          fantasy_name: (customer.fantasy_name as string | null) ?? null,
          cuit: (customer.cuit as string | null) ?? null,
          phone: (customer.phone as string | null) ?? null,
          email: (customer.email as string | null) ?? null,
          address: (customer.address as string | null) ?? null,
          city: (customer.city as string | null) ?? null,
          delivery_address:
            (customer.delivery_address as string | null) ?? null,
          delivery_city: (customer.delivery_city as string | null) ?? null,
          tax_condition: (customer.tax_condition as string | null) ?? null,
          preferred_carrier_id:
            (customer.preferred_carrier_id as string | null) ?? null,
        }
      : {
          id: sale.customer_id,
          business_name: "Cliente desconocido",
          fantasy_name: null,
          cuit: null,
          phone: null,
          email: null,
          address: null,
          city: null,
          delivery_address: null,
          delivery_city: null,
          tax_condition: null,
          preferred_carrier_id: null,
        };

  return normalizedCustomer;
}

function normalizeCarrierFromSale(
  sale: SalesOrderWithCustomerRaw
): SalesOrderWithCustomer["carrier"] {
  const raw = Array.isArray(sale.carrier) ? sale.carrier[0] : sale.carrier;
  if (!raw || typeof raw !== "object" || !raw.id) {
    return null;
  }
  return { id: raw.id as string, name: (raw.name as string) ?? "" };
}

function normalizeSupplierFromSale(
  sale: SalesOrderWithRelations
): { id: string; name: string } | null {
  const raw = Array.isArray(sale.supplier) ? sale.supplier[0] : sale.supplier;
  if (!raw || typeof raw !== "object" || !raw.id) {
    return null;
  }
  return { id: raw.id as string, name: (raw.name as string) ?? "" };
}

function normalizeReceivableFromSale(
  sale: SalesOrderWithCustomerRaw
): SalesOrderWithCustomer["receivable"] {
  const receivable = Array.isArray(sale.receivable)
    ? sale.receivable?.[0]
    : sale.receivable;

  if (
    receivable &&
    typeof receivable === "object" &&
    ("status" in receivable ||
      "pending_balance" in receivable ||
      "total_amount" in receivable)
  ) {
    const isCancelledSale = sale.status === "CANCELLED";
    const normalizedPendingBalance =
      receivable.pending_balance !== undefined &&
      receivable.pending_balance !== null
        ? truncateMoney(Number(receivable.pending_balance))
        : null;
    const normalizedTotalAmount =
      receivable.total_amount !== undefined && receivable.total_amount !== null
        ? truncateMoney(Number(receivable.total_amount))
        : null;

    return {
      status: (receivable.status as ReceivableStatus | null) ?? null,
      pending_balance: isCancelledSale ? 0 : normalizedPendingBalance,
      total_amount: normalizedTotalAmount,
    };
  }

  return null;
}

function normalizeSupplierNameFromProduct(
  product: SalesOrderItemRaw["product"]
): string | null {
  if (!product) {
    return null;
  }

  const rawSupplier = Array.isArray(product.supplier)
    ? product.supplier[0]
    : product.supplier;

  if (rawSupplier && typeof rawSupplier === "object" && "name" in rawSupplier) {
    return (rawSupplier.name as string | null) ?? null;
  }

  return null;
}

function deriveItemQuantities(item: SalesOrderItemRaw): {
  units: number | null;
  kilograms: number | null;
  subtotal: number | null;
} {
  if (!item.product_id) {
    return {
      units: null,
      kilograms: null,
      subtotal:
        item.subtotal !== undefined && item.subtotal !== null
          ? truncateMoney(Number(item.subtotal))
          : null,
    };
  }

  const product = item.product;
  const unitOfMeasure = product?.unit_of_measure ?? "UN";
  const quantity = item.quantity ?? null;
  const unitQuantity = item.unit_quantity ?? null;
  const subtotal =
    item.subtotal !== undefined && item.subtotal !== null
      ? truncateMoney(Number(item.subtotal))
      : null;

  if (unitOfMeasure === "UN") {
    return {
      units: quantity !== null ? Number(quantity) : null,
      kilograms: null,
      subtotal,
    };
  }

  return {
    units: quantity !== null ? Number(quantity) : null,
    kilograms: unitQuantity !== null ? Number(unitQuantity) : null,
    subtotal,
  };
}

function normalizeItems(items: PreSaleItemInput[]): PreSaleItemInput[] {
  return items
    .map((item) => ({
      ...item,
      id: item.id ?? randomUUID(),
      type: item.type ?? "product",
      quantity: Number(item.quantity),
      unitPrice: truncateMoney(Number(item.unitPrice)),
      basePrice: Number.isFinite(item.basePrice)
        ? truncateMoney(Number(item.basePrice))
        : truncateMoney(Number(item.unitPrice)),
      discountPercentage: Number.isFinite(item.discountPercentage)
        ? Math.min(Math.max(Number(item.discountPercentage), 0), 100)
        : null,
      discountAmount: Number.isFinite(item.discountAmount)
        ? truncateMoney(Number(item.discountAmount))
        : null,
    }))
    .map((item) => {
      if (item.type !== "adjustment") {
        return item;
      }

      return {
        ...item,
        productId: item.productId ?? null,
        description: item.description ?? null,
        quantity: 1,
        weightQuantity: null,
        basePrice: Number.isFinite(item.basePrice)
          ? truncateMoney(Number(item.basePrice))
          : truncateMoney(Number(item.unitPrice)),
        discountPercentage: 0,
        discountAmount: 0,
      };
    })
    .filter((item) => {
      if (item.type === "adjustment") {
        return Number.isFinite(item.unitPrice ?? 0);
      }
      const hasQuantity = item.quantity > 0;
      const hasWeightQuantity = (item.weightQuantity ?? 0) > 0;
      return (
        Boolean(item.productId) &&
        item.unitPrice >= 0 &&
        (hasQuantity || hasWeightQuantity)
      );
    });
}

function normalizeConfirmItems(
  items: ConfirmSaleItemInput[]
): ConfirmSaleItemInput[] {
  return items
    .map((item) => ({
      ...item,
      type: item.type ?? "product",
      quantity: Number.isFinite(item.quantity)
        ? Math.max(0, Number(item.quantity))
        : 0,
      weightQuantity:
        item.weightQuantity !== undefined && item.weightQuantity !== null
          ? Math.max(0, Number(item.weightQuantity))
          : null,
      unitPrice: truncateMoney(Number(item.unitPrice)),
      basePrice: Number.isFinite(item.basePrice)
        ? truncateMoney(Number(item.basePrice))
        : truncateMoney(Number(item.unitPrice)),
      discountPercentage:
        item.discountPercentage !== undefined &&
        item.discountPercentage !== null
          ? Math.min(Math.max(Number(item.discountPercentage), 0), 100)
          : 0,
      tracksStockUnits:
        item.tracksStockUnits !== undefined
          ? Boolean(item.tracksStockUnits)
          : undefined,
      unitOfMeasure: item.unitOfMeasure ?? null,
    }))
    .map((item) => {
      if (item.type !== "adjustment") {
        return item;
      }

      return {
        ...item,
        productId: item.productId ?? null,
        description: item.description ?? null,
        quantity: 1,
        weightQuantity: null,
        basePrice: Number.isFinite(item.basePrice)
          ? item.basePrice
          : item.unitPrice,
        discountPercentage: 0,
        tracksStockUnits: false,
        unitOfMeasure: "UN" as const,
      };
    })
    .filter(
      (item) =>
        item.type === "adjustment" ||
        (Boolean(item.productId) &&
          item.unitPrice >= 0 &&
          (item.quantity > 0 || (item.weightQuantity ?? 0) > 0))
    );
}

function resolveCustomerDisplayNameFromRecord(
  customer?: {
    business_name?: string | null;
    fantasy_name?: string | null;
  } | null
): string | null {
  const fantasy = customer?.fantasy_name?.trim();
  if (fantasy) {
    return fantasy;
  }

  const business = customer?.business_name?.trim();
  if (business) {
    return business;
  }

  return null;
}

export function formatSaleMovementReason(params: {
  saleNumber?: number | null;
  invoiceNumber?: string | null;
  saleId: string;
  customerName?: string | null;
  prefix?: string;
}): string {
  const { saleNumber, invoiceNumber, saleId, customerName, prefix } = params;

  const trimmedInvoice = invoiceNumber?.trim();
  let reference = `Venta ${saleId.slice(0, 6)}`;

  if (saleNumber !== null && saleNumber !== undefined) {
    reference = `Venta N${saleNumber}`;
  } else if (trimmedInvoice) {
    reference = `Venta ${trimmedInvoice}`;
  }

  const name = customerName?.trim();
  const reason = name ? `${reference} ${name}` : reference;

  return prefix ? `${prefix}${reason}` : reason;
}

function shouldUseWeightQuantity(item: {
  type?: SaleItemType;
  weightQuantity?: number | null;
  tracksStockUnits?: boolean;
}): boolean {
  if (item.type === "adjustment") {
    return false;
  }

  const hasWeightQuantity =
    item.weightQuantity !== undefined &&
    item.weightQuantity !== null &&
    item.weightQuantity > 0;

  if (!hasWeightQuantity) {
    return false;
  }

  // Backward compatibility: legacy callers may not send tracksStockUnits.
  if (item.tracksStockUnits === undefined) {
    return true;
  }

  return item.tracksStockUnits;
}

function calculateConfirmItemTotals(item: ConfirmSaleItemInput) {
  if (item.type === "adjustment") {
    const subtotal = truncateMoney(Number(item.unitPrice) || 0);
    return { gross: subtotal, discount: 0, subtotal };
  }

  const useWeightQuantity = shouldUseWeightQuantity(item);
  const effectiveQuantity = useWeightQuantity
    ? (item.weightQuantity ?? 0)
    : item.quantity;
  const effectiveUnitPrice =
    useWeightQuantity && Number.isFinite(item.basePrice)
      ? (item.basePrice as number)
      : item.unitPrice;
  const gross = truncateMoney(effectiveQuantity * effectiveUnitPrice);
  const discountPercent = item.discountPercentage ?? 0;
  const discount = truncateMoney(
    Math.min(Math.max(0, (discountPercent / 100) * gross), Math.max(0, gross))
  );
  const subtotal = truncateMoney(Math.max(0, gross - discount));

  return { gross, discount, subtotal };
}

function createAdjustmentItemPayload(
  item: PreSaleItemInput,
  orgId: string,
  saleOrderId: string
) {
  const subtotal = truncateMoney(Number(item.unitPrice) || 0);
  const basePrice = Number.isFinite(item.basePrice)
    ? truncateMoney(Number(item.basePrice))
    : subtotal;
  return {
    id: item.id ?? randomUUID(),
    organization_id: orgId,
    sales_order_id: saleOrderId,
    product_id: null,
    description: item.description ?? null,
    quantity: 1,
    unit_quantity: null,
    unit_price: subtotal,
    base_price: basePrice,
    discount_amount: 0,
    discount_percentage: 0,
    subtotal,
  };
}

function createProductItemPayload(
  item: PreSaleItemInput,
  orgId: string,
  saleOrderId: string
) {
  const usesWeight =
    item.weightQuantity !== undefined &&
    item.weightQuantity !== null &&
    item.weightQuantity > 0;
  const effectiveQuantity = usesWeight ? item.weightQuantity : item.quantity;
  const effectiveUnitPrice =
    usesWeight && Number.isFinite(item.basePrice)
      ? (item.basePrice as number)
      : item.unitPrice;

  const gross = truncateMoney((effectiveQuantity ?? 0) * effectiveUnitPrice);
  const discountAmountFromPercent =
    item.discountPercentage !== null && item.discountPercentage !== undefined
      ? (item.discountPercentage / 100) * gross
      : 0;
  const discount = truncateMoney(
    Math.min(
      Math.max(0, item.discountAmount ?? discountAmountFromPercent),
      Math.max(0, gross)
    )
  );
  const subtotal = truncateMoney(Math.max(0, gross - discount));

  return {
    id: item.id ?? randomUUID(),
    organization_id: orgId,
    sales_order_id: saleOrderId,
    product_id: item.productId ?? null,
    description: item.description ?? null,
    quantity: item.quantity,
    unit_quantity: usesWeight ? (item.weightQuantity ?? null) : null,
    unit_price: truncateMoney(item.unitPrice),
    base_price: truncateMoney(item.basePrice ?? item.unitPrice),
    discount_amount: discount,
    discount_percentage: item.discountPercentage ?? 0,
    subtotal,
  };
}

function createPreSaleItemPayload(
  item: PreSaleItemInput,
  orgId: string,
  saleOrderId: string
) {
  if (item.type === "adjustment") {
    return createAdjustmentItemPayload(item, orgId, saleOrderId);
  }

  return createProductItemPayload(item, orgId, saleOrderId);
}

function buildPreSaleTaxableLines(
  items: PreSaleItemInput[]
): TaxableItemLine[] {
  return items.map((item) => {
    const payload =
      item.type === "adjustment"
        ? createAdjustmentItemPayload(item, "", "")
        : createProductItemPayload(item, "", "");

    return {
      lineId: item.id ?? randomUUID(),
      productId: item.productId ?? null,
      netAmount: truncateMoney(payload.subtotal),
      taxes: item.taxes,
    };
  });
}

function buildConfirmSaleTaxableLines(
  items: ConfirmSaleItemInput[]
): TaxableItemLine[] {
  return items.map((item) => {
    const totals = calculateConfirmItemTotals(item);

    return {
      lineId: item.id,
      productId: item.productId ?? null,
      netAmount: truncateMoney(totals.subtotal),
      taxes: item.taxes,
    };
  });
}

async function buildSaleItemizedTaxPlan(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  lines: TaxableItemLine[];
  fallbackTaxes: SaleTaxAmountWithSnapshot[];
  globalDiscountAmount: number;
}) {
  const productIds = params.lines
    .map((line) => line.productId)
    .filter((productId): productId is string => Boolean(productId));
  const productTaxes = await getProductTaxAssignments({
    supabase: params.supabase,
    orgId: params.orgId,
    productIds,
  });
  const linesWithProductTaxes = params.lines.map((line) => {
    if (line.taxes?.length) {
      return line;
    }

    const taxes = line.productId ? productTaxes.get(line.productId) : undefined;
    return taxes?.length ? { ...line, taxes } : line;
  });

  return buildItemizedTaxPlan({
    lines: linesWithProductTaxes,
    globalDiscountAmount: params.globalDiscountAmount,
    fallbackTaxes: toFallbackItemTaxes(params.fallbackTaxes),
  });
}

async function fetchActiveProductsForOrg(
  supabase: SupabaseServerClient,
  orgId: string
): Promise<ProductWithRelations[]> {
  const { data, error } = await supabase
    .from("products_with_price")
    .select(
      "id, sku, name, brand, calculated_sale_price, organization_id, is_active, unit_of_measure, supplier_id, category_id, suppliers(name), categories(name)"
    )
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(`Error obteniendo productos: ${error.message}`);
  }

  return (data ?? []).filter(
    (product) => product.id && product.name && product.sku
  ) as ProductWithRelations[];
}

async function fetchProductStockSettingsMap(
  supabase: SupabaseServerClient,
  orgId: string,
  productIds: string[]
) {
  const productSettings = new Map<string, ProductStockSettings>();
  const idChunks = chunkItems(
    uniqueIds(productIds),
    SUPABASE_IN_FILTER_BATCH_SIZE
  );

  for (const ids of idChunks) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, tracks_stock_units, weight_per_unit, units_per_box, boxes_per_pallet, has_variants, accounting_account_code"
      )
      .eq("organization_id", orgId)
      .in("id", ids);

    if (error) {
      throw new Error(
        `Error obteniendo configuraciones de unidades: ${error.message}`
      );
    }

    for (const product of data ?? []) {
      if (product.id) {
        productSettings.set(product.id, {
          tracksStockUnits: Boolean(product.tracks_stock_units),
          weightPerUnit: product.weight_per_unit,
          unitsPerBox: product.units_per_box,
          boxesPerPallet: product.boxes_per_pallet,
          hasVariants: Boolean(product.has_variants),
          accountingAccountCode: product.accounting_account_code ?? null,
        });
      }
    }
  }

  return productSettings;
}

async function fetchTracksStockUnitsMap(
  supabase: SupabaseServerClient,
  orgId: string,
  productIds: string[]
) {
  const tracksStockUnitsByProduct = new Map<string, boolean>();

  for (const [productId, settings] of await fetchProductStockSettingsMap(
    supabase,
    orgId,
    productIds
  )) {
    tracksStockUnitsByProduct.set(productId, settings.tracksStockUnits);
  }

  return tracksStockUnitsByProduct;
}

function addLotToStockTotals(
  stockTotals: Map<string, StockTotals>,
  lot: {
    product_id: string | null;
    quantity_available: number | null;
    unit_quantity_available: number | null;
  }
) {
  if (!lot.product_id) {
    return;
  }

  const current = stockTotals.get(lot.product_id) ?? {
    totalQuantity: 0,
    totalUnits: null,
  };
  const nextTotalUnits =
    current.totalUnits !== null || lot.unit_quantity_available !== null
      ? (current.totalUnits ?? 0) + (lot.unit_quantity_available ?? 0)
      : null;

  stockTotals.set(lot.product_id, {
    totalQuantity: current.totalQuantity + (lot.quantity_available ?? 0),
    totalUnits: nextTotalUnits,
  });
}

async function fetchStockTotals(
  supabase: SupabaseServerClient,
  orgId: string,
  productIds: string[]
) {
  const stockTotals = new Map<string, StockTotals>();
  const idChunks = chunkItems(
    uniqueIds(productIds),
    SUPABASE_IN_FILTER_BATCH_SIZE
  );

  for (const ids of idChunks) {
    const { data, error } = await supabase
      .from("product_lots")
      .select("product_id, quantity_available, unit_quantity_available")
      .eq("organization_id", orgId)
      .in("product_id", ids);

    if (error) {
      throw new Error(`Error obteniendo stock: ${error.message}`);
    }

    for (const lot of data ?? []) {
      addLotToStockTotals(stockTotals, lot);
    }
  }

  return stockTotals;
}

/**
 * Prioritizes the static weightPerUnit field from the product definition.
 * Falls back to calculated average only if weightPerUnit is not set.
 *
 * @param options - Object with all required fields
 * @returns The weight/volume per unit, or null if not applicable
 */
type ComputeAverageQuantityPerUnitOptions = {
  unitOfMeasure: SaleProduct["unitOfMeasure"];
  tracksStockUnits: boolean;
  weightPerUnit: number | null | undefined;
  totalUnits: number | null;
  totalQuantity: number | null;
};

function computeAverageQuantityPerUnit({
  unitOfMeasure,
  tracksStockUnits,
  weightPerUnit,
  totalUnits,
  totalQuantity,
}: ComputeAverageQuantityPerUnitOptions): number | null {
  const isWeightOrVolume = unitOfMeasure === "KG" || unitOfMeasure === "LT";

  if (!(tracksStockUnits && isWeightOrVolume)) {
    return null;
  }

  // PRIORITY 1: Use static weightPerUnit from product definition
  if (
    weightPerUnit !== null &&
    weightPerUnit !== undefined &&
    weightPerUnit > 0
  ) {
    return weightPerUnit;
  }

  // PRIORITY 2: Calculate average if possible
  if (
    totalUnits !== null &&
    totalUnits > 0 &&
    totalQuantity !== null &&
    totalQuantity > 0
  ) {
    return totalQuantity / totalUnits;
  }

  return null;
}

function resolveSalesProductAccountingAccountCode(params: {
  accountingAccountCode: string | null | undefined;
  categoryId: string | null;
  accountingRuleByCategoryId: Map<string, string | null>;
}): string | null {
  const { accountingAccountCode, categoryId, accountingRuleByCategoryId } =
    params;

  if (accountingAccountCode) {
    return accountingAccountCode;
  }

  if (!categoryId) {
    return null;
  }

  return accountingRuleByCategoryId.get(categoryId) ?? null;
}

export async function getSaleProducts(orgSlug: string): Promise<SaleProduct[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const products = await fetchActiveProductsForOrg(supabase, org.id);

  if (!products.length) {
    return [];
  }

  const productIds = products
    .map((product) => product.id)
    .filter((id): id is string => Boolean(id));
  const categoryIds = uniqueIds(
    products
      .map((product) => product.category_id)
      .filter((categoryId): categoryId is string => Boolean(categoryId))
  );

  const [productSettings, stockTotals, productTaxes, categoryRules] =
    await Promise.all([
      fetchProductStockSettingsMap(supabase, org.id, productIds),
      fetchStockTotals(supabase, org.id, productIds),
      getProductTaxAssignments({
        supabase,
        orgId: org.id,
        productIds,
      }),
      categoryIds.length
        ? getCategoryAccountingRules(orgSlug, categoryIds)
        : Promise.resolve([]),
    ]);
  const accountingRuleByCategoryId = new Map(
    categoryRules.map((rule) => [rule.categoryId, rule.accountCode])
  );

  return products.map((product) => {
    const productId = product.id as string;
    const totals = stockTotals.get(productId);
    const totalQuantity = totals?.totalQuantity ?? null;
    const totalUnits = totals?.totalUnits ?? null;
    const settings = productSettings.get(productId);

    const unitOfMeasure =
      (product.unit_of_measure as Database["public"]["Enums"]["unit_of_measure_type"]) ||
      "UN";
    const tracksStockUnits = settings?.tracksStockUnits ?? false;
    const weightPerUnit = settings?.weightPerUnit ?? null;
    const averageQuantityPerUnit = computeAverageQuantityPerUnit({
      unitOfMeasure,
      tracksStockUnits,
      weightPerUnit,
      totalUnits,
      totalQuantity,
    });

    return {
      id: productId,
      name: product.name as string,
      sku: product.sku as string,
      brand: product.brand,
      supplierId: product.supplier_id,
      supplierName: product.suppliers?.name ?? null,
      categoryId: product.category_id,
      categoryName: product.categories?.name ?? null,
      accountingAccountCode: resolveSalesProductAccountingAccountCode({
        accountingAccountCode: settings?.accountingAccountCode,
        categoryId: product.category_id,
        accountingRuleByCategoryId,
      }),
      price: product.calculated_sale_price ?? 0,
      unitOfMeasure,
      tracksStockUnits,
      totalQuantity,
      totalUnitQuantity: totalUnits,
      averageQuantityPerUnit,
      weightPerUnit,
      unitsPerBox: settings?.unitsPerBox ?? null,
      boxesPerPallet: settings?.boxesPerPallet ?? null,
      hasVariants: settings?.hasVariants ?? false,
      taxes: productTaxes.get(productId) ?? [],
    };
  });
}

export async function getSalesOrdersByOrgSlug(
  orgSlug: string
): Promise<SalesOrderWithCustomer[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);
  assertCanReadSales(accessContext);

  let salesQuery = supabase
    .from("sales_orders")
    .select(
      `
        *,
        customer:customers(
          id,
          business_name,
          fantasy_name,
          cuit,
          phone,
          email,
          address,
          city,
          tax_condition,
          preferred_carrier_id
        ),
        carrier:carriers(id, name),
        items:sales_order_items(
          quantity,
          unit_quantity,
          subtotal,
          product_id,
          description,
          product:products(
            id,
            name,
            unit_of_measure,
            supplier:suppliers(name)
          )
        ),
        receivable:accounts_receivable(id, status, pending_balance, total_amount)
      `
    )
    .eq("organization_id", org.id);

  if (accessContext.scope === "own") {
    if (!accessContext.userId) {
      return [];
    }

    salesQuery = salesQuery.eq("user_id", accessContext.userId);
  }

  salesQuery = salesQuery.neq("is_historical", true);

  const [{ data, error }, sellersByUserId] = await Promise.all([
    salesQuery.order("created_at", { ascending: false }),
    getSellersByUserId(orgSlug, accessContext),
  ]);

  if (error) {
    throw new Error(`Error obteniendo ventas: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  return data.map((order: SalesOrderWithCustomerRaw) => {
    const normalizedCustomer = normalizeCustomerFromSale(order);
    const normalizedReceivable = normalizeReceivableFromSale(order);
    const saleItems = (order.items ?? []).map((item) => {
      const product = item.product;
      const quantities = deriveItemQuantities(item);
      const description =
        typeof item.description === "string" ? item.description : null;
      return {
        productId:
          (item.product_id as string | null) ??
          (product?.id as string | null) ??
          null,
        productName:
          (product?.name as string | null) ??
          (description ? description : null),
        supplierName: normalizeSupplierNameFromProduct(product),
        units: quantities.units,
        kilograms: quantities.kilograms,
        subtotal: quantities.subtotal,
      };
    });

    return {
      ...order,
      sub_total: truncateMoney(Number(order.sub_total ?? 0)),
      total_tax_amount:
        order.total_tax_amount !== null && order.total_tax_amount !== undefined
          ? truncateMoney(Number(order.total_tax_amount))
          : null,
      global_discount_amount:
        order.global_discount_amount !== null &&
        order.global_discount_amount !== undefined
          ? truncateMoney(Number(order.global_discount_amount))
          : null,
      total_amount: truncateMoney(Number(order.total_amount ?? 0)),
      customer: normalizedCustomer,
      carrier: normalizeCarrierFromSale(order),
      seller: resolveSeller(order.user_id ?? null, sellersByUserId),
      receivable: normalizedReceivable,
      access: buildSalesOrderAccess(order.user_id ?? null, accessContext),
      items: saleItems,
    };
  });
}

function resolveSellerIds(params: SalesPaginatedParams): string[] | null {
  if (params.sellerIds && params.sellerIds.length > 0) {
    return params.sellerIds;
  }
  if (params.sellerId) {
    return [params.sellerId];
  }
  return null;
}

function resolveCustomerIds(params: SalesPaginatedParams): string[] | null {
  if (params.customerIds && params.customerIds.length > 0) {
    return params.customerIds;
  }
  if (params.customerId) {
    return [params.customerId];
  }
  return null;
}

function buildSalesQuery(
  supabase: SupabaseServerClient,
  orgId: string,
  accessContext: SalesAccessContext,
  params: SalesPaginatedParams
) {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));

  let query = supabase
    .from("sales_orders")
    .select(
      `
        *,
        customer:customers(
          id,
          business_name,
          fantasy_name,
          cuit,
          phone,
          email,
          address,
          city,
          delivery_address,
          delivery_city,
          tax_condition,
          preferred_carrier_id
        ),
        carrier:carriers(id, name),
        items:sales_order_items(
          quantity,
          unit_quantity,
          subtotal,
          product_id,
          description,
          product:products(
            id,
            name,
            unit_of_measure,
            supplier:suppliers(name)
          )
        ),
        receivable:accounts_receivable(id, status, pending_balance, total_amount)
      `,
      { count: "exact" }
    )
    .eq("organization_id", orgId)
    .neq("is_historical", true);

  if (params.status) {
    query = query.eq("status", params.status);
  }

  if (params.search) {
    query = query.or(
      `sale_number.textSearch(${params.search}),invoice_number.ilike.%${params.search}%,customers.business_name.ilike.%${params.search}%,customers.fantasy_name.ilike.%${params.search}%`
    );
  }

  const sellerFilterIds = resolveSellerIds(params);
  if (sellerFilterIds) {
    query = query.in("user_id", sellerFilterIds as unknown as string[]);
  }

  if (params.dateFrom) {
    query = query.gte("sale_date", params.dateFrom);
  }

  if (params.dateTo) {
    query = query.lte("sale_date", params.dateTo);
  }

  const customerFilterIds = resolveCustomerIds(params);
  if (customerFilterIds) {
    query = query.in("customer_id", customerFilterIds as unknown as string[]);
  }

  if (params.invoiceType) {
    query = query.eq("invoice_type", params.invoiceType);
  }

  query = applySalesDateFilters(query, params);

  if (accessContext.scope === "own") {
    if (!accessContext.userId) {
      return null;
    }

    query = query.eq("user_id", accessContext.userId);
  }

  if (params.sort && params.sort.length > 0) {
    for (const s of params.sort) {
      query = query.order(s.id, { ascending: !s.desc });
    }
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  return query;
}

function enrichSalesOrders(
  data: SalesOrderWithCustomerRaw[],
  sellersByUserId: Map<string, SalesSeller>,
  accessContext: SalesAccessContext
): SalesOrderWithCustomer[] {
  return data.map((order) => {
    const { items: rawItems, ...orderWithoutItems } = order;
    const normalizedCustomer = normalizeCustomerFromSale(order);
    const normalizedReceivable = normalizeReceivableFromSale(order);

    const saleItems = (rawItems ?? []).map((item) => {
      const product = item.product;
      const quantities = deriveItemQuantities(item);
      const description =
        typeof item.description === "string" ? item.description : null;
      return {
        productId:
          (item.product_id as string | null) ??
          (product?.id as string | null) ??
          null,
        productName:
          (product?.name as string | null) ??
          (description ? description : null),
        supplierName: normalizeSupplierNameFromProduct(product),
        units: quantities.units,
        kilograms: quantities.kilograms,
        subtotal: quantities.subtotal,
      };
    });

    const sale: SalesOrderWithCustomer = {
      ...orderWithoutItems,
      sub_total: truncateMoney(Number(order.sub_total ?? 0)),
      total_tax_amount:
        order.total_tax_amount !== null && order.total_tax_amount !== undefined
          ? truncateMoney(Number(order.total_tax_amount))
          : null,
      global_discount_amount:
        order.global_discount_amount !== null &&
        order.global_discount_amount !== undefined
          ? truncateMoney(Number(order.global_discount_amount))
          : null,
      total_amount: truncateMoney(Number(order.total_amount ?? 0)),
      customer: normalizedCustomer,
      carrier: normalizeCarrierFromSale(order),
      seller: resolveSeller(order.user_id ?? null, sellersByUserId),
      receivable: normalizedReceivable,
      access: buildSalesOrderAccess(order.user_id ?? null, accessContext),
      items: saleItems,
    };
    return sale;
  });
}

export async function getSalesPaginated(
  orgSlug: string,
  params: SalesPaginatedParams
): Promise<PaginatedResult<SalesOrderWithCustomer>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
    };
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);
  assertCanReadSales(accessContext);

  const query = buildSalesQuery(supabase, org.id, accessContext, params);

  if (query === null) {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
    };
  }

  const [{ data, error, count }, sellersByUserId] = await Promise.all([
    query,
    getSellersByUserId(orgSlug, accessContext),
  ]);

  if (error || !data) {
    throw new Error(
      `Error fetching sales: ${error?.message ?? "No data returned"}`
    );
  }

  return {
    data: enrichSalesOrders(data, sellersByUserId, accessContext),
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

export async function getSalesMetrics(orgSlug: string): Promise<SalesMetrics> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      totalCurrentMonth: 0,
      totalAmountCurrentMonth: 0,
      preSalesCurrentMonth: 0,
      deliveredCurrentMonth: 0,
      draftCount: 0,
      confirmedCount: 0,
      dispatchedCount: 0,
      deliveredCount: 0,
      cancelledCount: 0,
    };
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);
  assertCanReadSales(accessContext);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const countedStatuses = ["CONFIRMED", "DISPATCH", "DELIVERED"] as const;

  let baseQuery = supabase
    .from("sales_orders")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .neq("is_historical", true);

  if (accessContext.scope === "own") {
    if (!accessContext.userId) {
      return {
        totalCurrentMonth: 0,
        totalAmountCurrentMonth: 0,
        preSalesCurrentMonth: 0,
        deliveredCurrentMonth: 0,
        draftCount: 0,
        confirmedCount: 0,
        dispatchedCount: 0,
        deliveredCount: 0,
        cancelledCount: 0,
      };
    }

    baseQuery = baseQuery.eq("user_id", accessContext.userId);
  }

  const currentMonthBase = supabase
    .from("sales_orders")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .neq("is_historical", true)
    .gte("sale_date", monthStart)
    .lte("sale_date", monthEnd);

  if (accessContext.scope === "own" && accessContext.userId) {
    currentMonthBase.eq("user_id", accessContext.userId);
  }

  const [
    draftCount,
    confirmedCount,
    dispatchedCount,
    deliveredCount,
    cancelledCount,
    currentMonthData,
    monthPreSalesCount,
  ] = await Promise.all([
    baseQuery.eq("status", "DRAFT").limit(1),
    baseQuery.eq("status", "CONFIRMED").limit(1),
    baseQuery.eq("status", "DISPATCH").limit(1),
    baseQuery.eq("status", "DELIVERED").limit(1),
    baseQuery.eq("status", "CANCELLED").limit(1),
    supabase
      .from("sales_orders")
      .select("total_amount, status")
      .eq("organization_id", org.id)
      .neq("is_historical", true)
      .gte("sale_date", monthStart)
      .lte("sale_date", monthEnd)
      .in("status", countedStatuses),
    currentMonthBase.eq("status", "DRAFT").limit(1),
  ]);

  const totalAmount = (currentMonthData.data ?? []).reduce(
    (sum, sale) => sum + truncateMoney(Number(sale.total_amount ?? 0)),
    0
  );

  const totalCount = (currentMonthData.data ?? []).length;
  const preSalesMonthCount = monthPreSalesCount.count ?? 0;

  return {
    totalCurrentMonth: totalCount,
    totalAmountCurrentMonth: totalAmount,
    preSalesCurrentMonth: preSalesMonthCount,
    deliveredCurrentMonth: (currentMonthData.data ?? []).filter(
      (s) => s.status === "DELIVERED"
    ).length,
    draftCount: draftCount.count ?? 0,
    confirmedCount: confirmedCount.count ?? 0,
    dispatchedCount: dispatchedCount.count ?? 0,
    deliveredCount: deliveredCount.count ?? 0,
    cancelledCount: cancelledCount.count ?? 0,
  };
}

export async function getAllSalesForExport(
  orgSlug: string,
  filters?: { status?: SalesOrderStatus }
): Promise<SalesOrderWithCustomer[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);
  assertCanReadSales(accessContext);

  let query = supabase
    .from("sales_orders")
    .select(
      `
        *,
        customer:customers(
          id,
          business_name,
          fantasy_name,
          cuit,
          phone,
          email,
          address,
          city,
          delivery_address,
          delivery_city,
          tax_condition,
          preferred_carrier_id
        ),
        carrier:carriers(id, name),
        items:sales_order_items(
          quantity,
          unit_quantity,
          subtotal,
          product_id,
          description,
          product:products(
            id,
            name,
            unit_of_measure,
            supplier:suppliers(name)
          )
        ),
        receivable:accounts_receivable(id, status, pending_balance, total_amount)
      `
    )
    .eq("organization_id", org.id)
    .neq("is_historical", true)
    .limit(10_000);

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (accessContext.scope === "own") {
    if (!accessContext.userId) {
      return [];
    }

    query = query.eq("user_id", accessContext.userId);
  }

  const [{ data, error }, sellersByUserId] = await Promise.all([
    query.order("created_at", { ascending: false }),
    getSellersByUserId(orgSlug, accessContext),
  ]);

  if (error || !data) {
    return [];
  }

  return data.map((order: SalesOrderWithCustomerRaw) => {
    const normalizedCustomer = normalizeCustomerFromSale(order);
    const normalizedReceivable = normalizeReceivableFromSale(order);
    const saleItems = (order.items ?? []).map((item) => {
      const product = item.product;
      const quantities = deriveItemQuantities(item);
      const description =
        typeof item.description === "string" ? item.description : null;
      return {
        productId:
          (item.product_id as string | null) ??
          (product?.id as string | null) ??
          null,
        productName:
          (product?.name as string | null) ??
          (description ? description : null),
        supplierName: normalizeSupplierNameFromProduct(product),
        units: quantities.units,
        kilograms: quantities.kilograms,
        subtotal: quantities.subtotal,
      };
    });

    return {
      ...order,
      sub_total: truncateMoney(Number(order.sub_total ?? 0)),
      total_tax_amount:
        order.total_tax_amount !== null && order.total_tax_amount !== undefined
          ? truncateMoney(Number(order.total_tax_amount))
          : null,
      global_discount_amount:
        order.global_discount_amount !== null &&
        order.global_discount_amount !== undefined
          ? truncateMoney(Number(order.global_discount_amount))
          : null,
      total_amount: truncateMoney(Number(order.total_amount ?? 0)),
      customer: normalizedCustomer,
      carrier: normalizeCarrierFromSale(order),
      seller: resolveSeller(order.user_id ?? null, sellersByUserId),
      receivable: normalizedReceivable,
      access: buildSalesOrderAccess(order.user_id ?? null, accessContext),
      items: saleItems,
    };
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: data fetching requires several guarded branches
export async function getSalesOrderById(
  orgSlug: string,
  saleId: string
): Promise<SalesOrderDetail | null> {
  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);
  assertCanReadSales(accessContext);

  const [{ data, error }, sellersByUserId] = await Promise.all([
    supabase
      .from("sales_orders")
      .select(
        `
          *,
          customer:customers(
            id,
            business_name,
            fantasy_name,
            cuit,
            phone,
            email,
            address,
            city,
            tax_condition,
            preferred_carrier_id
          ),
          carrier:carriers(id, name),
          supplier:suppliers(id, name),
          items:sales_order_items(
            id,
            product_id,
            product_variant_id,
            description,
            quantity,
            unit_quantity,
            unit_price,
            base_price,
            discount_amount,
            discount_percentage,
            subtotal,
            product:products(
              id,
              name,
              sku,
              brand,
              unit_of_measure,
              tracks_stock_units,
              weight_per_unit,
              category_id,
              accounting_account_code
            ),
            product_variant:product_variants!left(
              talle,
              color
            ),
            item_taxes:sales_order_item_taxes(
              tax_id,
              name,
              rate,
              tax_code_snapshot,
              source
            )
          ),
          taxes:sales_order_taxes(
            id,
            tax_id,
            name,
            rate,
            tax_amount,
            base_amount,
            tax_code_snapshot
          ),
          receivable:accounts_receivable(status, pending_balance, total_amount)
        `
      )
      .eq("organization_id", org.id)
      .eq("id", saleId)
      .maybeSingle(),
    getSellersByUserId(orgSlug, accessContext),
  ]);

  if (error) {
    throw new Error(`Error obteniendo la venta: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const sale = data as unknown as SalesOrderWithRelations;

  if (
    accessContext.scope === "own" &&
    (!accessContext.userId || sale.user_id !== accessContext.userId)
  ) {
    return null;
  }

  const productIds = (sale.items ?? [])
    .map((item) => item.product_id)
    .filter((id): id is string => Boolean(id));
  const categoryIds = uniqueIds(
    (sale.items ?? [])
      .map((item) => item.product?.category_id ?? null)
      .filter((categoryId): categoryId is string => Boolean(categoryId))
  );

  const [tracksStockUnitsByProduct, stockTotals, categoryRules] =
    await Promise.all([
      productIds.length
        ? fetchTracksStockUnitsMap(supabase, org.id, productIds)
        : Promise.resolve(new Map<string, boolean>()),
      productIds.length
        ? fetchStockTotals(supabase, org.id, productIds)
        : Promise.resolve(
            new Map<
              string,
              { totalQuantity: number; totalUnits: number | null }
            >()
          ),
      categoryIds.length
        ? getCategoryAccountingRules(orgSlug, categoryIds)
        : Promise.resolve([]),
    ]);
  const accountingRuleByCategoryId = new Map(
    categoryRules.map((rule) => [rule.categoryId, rule.accountCode])
  );

  const normalizedItems = (sale.items ?? []).filter(
    (item): item is SalesOrderItemRaw & { id: string } => Boolean(item.id)
  );

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mapping normalizes multiple optional fields
  const items: SalesOrderItemDetail[] = normalizedItems.map((item) => {
    const product = item.product ?? {};
    const productVariant =
      (
        item as {
          product_variant?: {
            talle: string | null;
            color: string | null;
          } | null;
        }
      ).product_variant ?? null;
    const productId = item.product_id ?? null;
    const isAdjustment = !productId;
    const description =
      typeof item.description === "string" ? item.description : null;
    const unitOfMeasure: SaleProduct["unitOfMeasure"] = isAdjustment
      ? "UN"
      : (product.unit_of_measure as SaleProduct["unitOfMeasure"]) || "UN";
    const isWeightUnit =
      unitOfMeasure === "KG" ||
      unitOfMeasure === "LT" ||
      unitOfMeasure === "MT";
    const rawWeight = isWeightUnit ? (item.unit_quantity ?? null) : null;
    const totals = productId ? stockTotals.get(productId) : undefined;
    const totalQuantity = totals?.totalQuantity ?? null;
    const totalUnits = totals?.totalUnits ?? null;
    const tracksStockUnits = isAdjustment
      ? false
      : (tracksStockUnitsByProduct.get(productId) ??
        Boolean(product.tracks_stock_units));
    const weightPerUnit = product.weight_per_unit ?? null;
    const averageQuantityPerUnit = isAdjustment
      ? null
      : computeAverageQuantityPerUnit({
          unitOfMeasure,
          tracksStockUnits,
          weightPerUnit,
          totalUnits,
          totalQuantity,
        });

    const weightQuantity = isAdjustment
      ? null
      : (rawWeight ??
        (averageQuantityPerUnit && item.quantity
          ? averageQuantityPerUnit * item.quantity
          : null));
    const itemTaxes: ItemTaxInput[] = (item.item_taxes ?? [])
      .filter(
        (tax) =>
          tax?.tax_id &&
          tax.name &&
          tax.source !== "fallback" &&
          tax.source !== "legacy_prorated"
      )
      .map((tax) => ({
        taxId: tax.tax_id as string,
        name: tax.name ?? "",
        rate: Number(tax.rate ?? 0),
        taxCodeSnapshot: sanitizeText(tax.tax_code_snapshot) ?? null,
        source: tax.source === "manual" ? "manual" : "product",
      }));

    return {
      id: item.id,
      type: isAdjustment ? "adjustment" : "product",
      productId,
      productVariantId: item.product_variant_id ?? null,
      productVariantName: productVariant
        ? [productVariant.talle, productVariant.color]
            .filter(Boolean)
            .join(" · ")
        : null,
      description,
      name: isAdjustment
        ? (description ?? "Ajuste manual")
        : (product.name ?? "Producto sin nombre"),
      sku: isAdjustment ? "AJUSTE" : (product.sku ?? ""),
      brand: isAdjustment ? null : (product.brand ?? null),
      quantity: item.quantity ?? 0,
      weightQuantity,
      unitPrice: truncateMoney(item.unit_price ?? 0),
      basePrice: truncateMoney(item.base_price ?? item.unit_price ?? 0),
      discountPercent: item.discount_percentage ?? 0,
      subtotal: truncateMoney(item.subtotal ?? 0),
      unitOfMeasure,
      tracksStockUnits,
      accountingAccountCode: isAdjustment
        ? null
        : (product.accounting_account_code ??
          (product.category_id
            ? (accountingRuleByCategoryId.get(product.category_id) ?? null)
            : null)),
      averageQuantityPerUnit:
        averageQuantityPerUnit && Number.isFinite(averageQuantityPerUnit)
          ? averageQuantityPerUnit
          : null,
      taxes: itemTaxes.length ? itemTaxes : undefined,
    };
  });

  const taxes: SalesOrderTaxDetail[] = (sale.taxes ?? [])
    .filter((tax) => tax?.tax_id)
    .map((tax) => ({
      id: tax?.id ?? undefined,
      taxId: (tax?.tax_id as string) ?? "",
      name: tax?.name ?? "",
      rate: tax?.rate ?? 0,
      taxAmount: truncateMoney(tax?.tax_amount ?? 0),
      baseAmount:
        tax?.base_amount !== null && tax?.base_amount !== undefined
          ? truncateMoney(tax.base_amount)
          : null,
      taxCodeSnapshot: sanitizeText(tax?.tax_code_snapshot) ?? null,
    }));

  const seller = resolveSeller(sale.user_id ?? null, sellersByUserId);

  const saleBase: SalesOrderWithCustomer = {
    ...(sale as SalesOrder),
    sub_total: truncateMoney(Number(sale.sub_total ?? 0)),
    total_tax_amount:
      sale.total_tax_amount !== null && sale.total_tax_amount !== undefined
        ? truncateMoney(Number(sale.total_tax_amount))
        : null,
    global_discount_amount:
      sale.global_discount_amount !== null &&
      sale.global_discount_amount !== undefined
        ? truncateMoney(Number(sale.global_discount_amount))
        : null,
    total_amount: truncateMoney(Number(sale.total_amount ?? 0)),
    customer: normalizeCustomerFromSale(sale),
    carrier: normalizeCarrierFromSale(sale),
    seller,
    receivable: normalizeReceivableFromSale(sale),
    access: buildSalesOrderAccess(sale.user_id ?? null, accessContext),
  };

  return {
    ...saleBase,
    supplier: normalizeSupplierFromSale(sale),
    invoice_number: sale.invoice_number ?? null,
    credit_days: sale.credit_days ?? null,
    observations: sale.observations ?? null,
    global_discount_percentage: sale.global_discount_percentage ?? 0,
    global_discount_amount: truncateMoney(sale.global_discount_amount ?? 0),
    remittance_number: sale.remittance_number ?? null,
    items,
    taxes,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: business logic involves several guarded steps
export async function createPreSaleOrder(
  input: CreatePreSaleOrderInput
): Promise<string> {
  const { orgSlug, customerId, sellerId, saleDate } = input;

  if (!customerId) {
    throw new Error("El cliente es requerido");
  }

  if (!saleDate) {
    throw new Error("La fecha de venta es requerida");
  }

  const items = normalizeItems(input.items);

  if (!items.length) {
    throw new Error("Agrega al menos un ítem a la preventa");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);
  assertCanManageSales(accessContext);
  const userId = await getCurrentUserId(supabase);
  const resolvedSellerId = sellerId || userId;
  assertCanAssignSeller(accessContext, resolvedSellerId);

  const subTotalAmount = items.reduce((total, item) => {
    if (item.type === "adjustment") {
      return truncateMoney(total + (Number(item.unitPrice) || 0));
    }
    const usesWeight =
      item.weightQuantity !== undefined &&
      item.weightQuantity !== null &&
      item.weightQuantity > 0;
    const effectiveQuantity = usesWeight ? item.weightQuantity : item.quantity;
    const effectiveUnitPrice =
      usesWeight && Number.isFinite(item.basePrice)
        ? (item.basePrice as number)
        : item.unitPrice;

    const gross = truncateMoney((effectiveQuantity ?? 0) * effectiveUnitPrice);
    const discountAmountFromPercent =
      item.discountPercentage !== null && item.discountPercentage !== undefined
        ? (item.discountPercentage / 100) * gross
        : 0;
    const discount = truncateMoney(
      Math.min(
        Math.max(0, item.discountAmount ?? discountAmountFromPercent),
        Math.max(0, gross)
      )
    );
    const subtotal = truncateMoney(Math.max(0, gross - discount));
    return truncateMoney(total + subtotal);
  }, 0);

  const normalizedGlobalDiscountPercent =
    input.globalDiscountPercentage !== null &&
    input.globalDiscountPercentage !== undefined
      ? Math.min(Math.max(Number(input.globalDiscountPercentage), 0), 100)
      : null;

  const computedGlobalDiscountAmount =
    normalizedGlobalDiscountPercent !== null
      ? truncateMoney((normalizedGlobalDiscountPercent / 100) * subTotalAmount)
      : null;

  const providedGlobalDiscountAmount = Number.isFinite(
    input.globalDiscountAmount
  )
    ? truncateMoney(Number(input.globalDiscountAmount))
    : null;

  const globalDiscountAmount = truncateMoney(
    Math.min(
      Math.max(
        0,
        computedGlobalDiscountAmount ?? providedGlobalDiscountAmount ?? 0
      ),
      Math.max(0, subTotalAmount)
    )
  );

  const discountedSubtotal = truncateMoney(
    Math.max(0, subTotalAmount - globalDiscountAmount)
  );

  const fallbackTaxes = await resolveFallbackSaleTaxes({
    supabase,
    orgId: org.id,
    taxes: input.taxes,
  });
  const taxPlan = await buildSaleItemizedTaxPlan({
    supabase,
    orgId: org.id,
    lines: buildPreSaleTaxableLines(items),
    fallbackTaxes,
    globalDiscountAmount,
  });
  const totalTaxAmount = taxPlan.totalTaxAmount;

  const totalAmount = truncateMoney(
    Math.max(0, discountedSubtotal + totalTaxAmount)
  );

  const dueDate = computeDueDate(
    saleDate,
    input.expirationDate,
    input.creditDays
  );

  const invoiceType = input.invoiceType || defaultInvoiceType;

  const { data: order, error: orderError } = await supabase
    .from("sales_orders")
    .insert({
      organization_id: org.id,
      customer_id: customerId,
      user_id: resolvedSellerId as string,
      sale_date: saleDate,
      credit_days: input.creditDays ?? null,
      expiration_date: dueDate,
      invoice_type: invoiceType,
      invoice_number: sanitizeText(input.invoiceNumber),
      observations: sanitizeText(input.observations),
      sub_total: subTotalAmount,
      total_tax_amount: taxPlan.aggregateTaxes.length ? totalTaxAmount : null,
      global_discount_percentage: normalizedGlobalDiscountPercent ?? 0,
      global_discount_amount: globalDiscountAmount,
      total_amount: totalAmount,
      status: "DRAFT" satisfies Database["public"]["Enums"]["order_status"],
      created_by: userId,
    })
    .select("id")
    .maybeSingle();

  if (orderError) {
    throw new Error(`No se pudo crear la preventa: ${orderError.message}`);
  }

  if (!order?.id) {
    throw new Error("No se pudo obtener el ID de la preventa creada");
  }

  const saleOrderId = order.id;

  const itemsPayload = items.map((item) =>
    createPreSaleItemPayload(item, org.id, saleOrderId)
  );

  const { error: itemsError } = await supabase
    .from("sales_order_items")
    .insert(itemsPayload);

  if (itemsError) {
    await supabase.from("sales_orders").delete().eq("id", saleOrderId);
    throw new Error(
      `No se pudieron guardar los productos de la preventa: ${itemsError.message}`
    );
  }

  try {
    await insertSalesOrderTaxSnapshots({
      supabase,
      orgId: org.id,
      saleOrderId,
      taxPlan,
    });
  } catch (error) {
    await supabase
      .from("sales_order_items")
      .delete()
      .eq("sales_order_id", saleOrderId);
    await supabase.from("sales_orders").delete().eq("id", saleOrderId);

    throw error;
  }

  return saleOrderId;
}

type ProductStockMetadata = {
  id: string;
  name: string;
  unitOfMeasure: SaleProduct["unitOfMeasure"];
  tracksStockUnits: boolean;
  weightPerUnit?: number | null;
};

type StockAdjustmentContext = {
  lotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][];
  rollbackLotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][];
  movementPayloads: Database["public"]["Tables"]["stock_movements"]["Insert"][];
};

const isWeightOrVolumeUnit = (unit: SaleProduct["unitOfMeasure"]) =>
  unit === "KG" || unit === "LT";

function compareLotsForFifo(
  a: {
    expiration_date?: string | null;
    created_at?: string | null;
    lot_number?: string | null;
    id?: string | null;
  },
  b: {
    expiration_date?: string | null;
    created_at?: string | null;
    lot_number?: string | null;
    id?: string | null;
  }
) {
  const expirationA = a.expiration_date ? new Date(a.expiration_date) : null;
  const expirationB = b.expiration_date ? new Date(b.expiration_date) : null;

  const expirationDiff =
    (expirationA?.getTime() ?? Number.POSITIVE_INFINITY) -
    (expirationB?.getTime() ?? Number.POSITIVE_INFINITY);

  if (expirationDiff !== 0) {
    return expirationDiff;
  }

  const createdA = a.created_at ? new Date(a.created_at) : null;
  const createdB = b.created_at ? new Date(b.created_at) : null;
  const createdDiff =
    (createdA?.getTime() ?? Number.POSITIVE_INFINITY) -
    (createdB?.getTime() ?? Number.POSITIVE_INFINITY);

  if (createdDiff !== 0) {
    return createdDiff;
  }

  const lotNumberA = a.lot_number ?? "";
  const lotNumberB = b.lot_number ?? "";

  if (lotNumberA !== lotNumberB) {
    return lotNumberA.localeCompare(lotNumberB);
  }

  return (a.id ?? "").localeCompare(b.id ?? "");
}

function resolveWeightRequirement(
  item: ConfirmSaleItemInput,
  product: ProductStockMetadata,
  totals: { totalQuantity: number; totalUnits: number | null }
) {
  const explicitWeight =
    item.weightQuantity !== undefined && item.weightQuantity !== null
      ? Math.max(0, Number(item.weightQuantity))
      : 0;

  if (explicitWeight > 0) {
    return explicitWeight;
  }

  const averageQuantityPerUnit = computeAverageQuantityPerUnit({
    unitOfMeasure: product.unitOfMeasure,
    tracksStockUnits: product.tracksStockUnits,
    weightPerUnit: product.weightPerUnit ?? null,
    totalUnits: totals.totalUnits,
    totalQuantity: totals.totalQuantity,
  });

  if (averageQuantityPerUnit && item.quantity > 0) {
    return averageQuantityPerUnit * item.quantity;
  }

  return Math.max(0, item.quantity);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Stock allocation across lots requires several guarded branches
async function buildStockAdjustmentContext(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  items: ConfirmSaleItemInput[];
  movementReason: string;
}): Promise<StockAdjustmentContext> {
  const { supabase, orgId, items, movementReason } = params;

  const productIds = Array.from(
    new Set(
      items
        .map((item) => item.productId)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (!productIds.length) {
    return {
      lotUpdates: [],
      rollbackLotUpdates: [],
      movementPayloads: [],
    };
  }

  const [productsResult, lotsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, unit_of_measure, tracks_stock_units, weight_per_unit")
      .eq("organization_id", orgId)
      .in("id", productIds),
    supabase
      .from("product_lots")
      .select(
        "id, product_id, quantity_available, unit_quantity_available, lot_number, expiration_date, created_at"
      )
      .eq("organization_id", orgId)
      .in("product_id", productIds)
      .order("expiration_date", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (productsResult.error) {
    throw new Error(
      `Error validando productos de la venta: ${productsResult.error.message}`
    );
  }

  if (lotsResult.error) {
    throw new Error(
      `Error obteniendo lotes para descontar stock: ${lotsResult.error.message}`
    );
  }

  // --- Fetch variant lot mappings (for variant products) ---
  const variantIds = items
    .map((item) => item.productVariantId)
    .filter((id): id is string => Boolean(id));

  const variantLotMap = new Map<string, string>();
  if (variantIds.length > 0) {
    const { data: variantData, error: variantError } = await supabase
      .from("product_variants")
      .select("id, lot_id")
      .eq("organization_id", orgId)
      .in("id", variantIds);

    if (variantError) {
      throw new Error(`Error obteniendo variantes: ${variantError.message}`);
    }

    for (const v of variantData ?? []) {
      if (v.id && v.lot_id) {
        variantLotMap.set(v.id, v.lot_id);
      }
    }
  }

  const products =
    (productsResult.data as Array<{
      id?: string | null;
      name?: string | null;
      unit_of_measure?: Database["public"]["Enums"]["unit_of_measure_type"];
      tracks_stock_units?: boolean | null;
      weight_per_unit?: number | null;
    }>) ?? [];

  const lots =
    (lotsResult.data as Array<{
      id?: string | null;
      product_id?: string | null;
      quantity_available?: number | null;
      unit_quantity_available?: number | null;
      lot_number?: string | null;
      expiration_date?: string | null;
      created_at?: string | null;
    }>) ?? [];

  const productsById = new Map<string, ProductStockMetadata>();

  for (const product of products) {
    if (!product.id) {
      continue;
    }

    productsById.set(product.id, {
      id: product.id,
      name: product.name ?? "Producto sin nombre",
      unitOfMeasure:
        (product.unit_of_measure as SaleProduct["unitOfMeasure"]) || "UN",
      tracksStockUnits: Boolean(product.tracks_stock_units),
      weightPerUnit: product.weight_per_unit ?? null,
    });
  }

  for (const productId of productIds) {
    if (!productsById.has(productId)) {
      throw new Error("No se encontró uno de los productos de la venta.");
    }
  }

  const lotsByProduct = new Map<string, typeof lots>();
  const totalsByProduct = new Map<
    string,
    { totalQuantity: number; totalUnits: number | null }
  >();

  for (const lot of lots) {
    if (!lot.product_id) {
      continue;
    }

    const lotList = lotsByProduct.get(lot.product_id) ?? [];
    lotList.push(lot);
    lotsByProduct.set(lot.product_id, lotList);

    const currentTotals = totalsByProduct.get(lot.product_id) ?? {
      totalQuantity: 0,
      totalUnits: null as number | null,
    };

    const nextTotalUnits =
      currentTotals.totalUnits !== null || lot.unit_quantity_available !== null
        ? (currentTotals.totalUnits ?? 0) + (lot.unit_quantity_available ?? 0)
        : null;

    totalsByProduct.set(lot.product_id, {
      totalQuantity:
        currentTotals.totalQuantity + (lot.quantity_available ?? 0),
      totalUnits: nextTotalUnits,
    });
  }

  const lotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][] =
    [];
  const rollbackLotUpdates: Database["public"]["Tables"]["product_lots"]["Update"][] =
    [];
  const movementPayloads: Database["public"]["Tables"]["stock_movements"]["Insert"][] =
    [];
  const rollbackSnapshotByLot = new Set<string>();
  const timestamp = new Date().toISOString();

  for (const item of items) {
    if (!item.productId || item.type === "adjustment") {
      continue;
    }

    const product = productsById.get(item.productId);

    if (!product) {
      throw new Error("Producto no encontrado para descontar stock.");
    }

    // ============= PRODUCTOS CON VARIANTES =============
    if (item.productVariantId) {
      const variantLotId = variantLotMap.get(item.productVariantId);
      if (!variantLotId) {
        throw new Error(
          `No se encontró el lote de la variante para ${product.name}.`
        );
      }

      const variantLot = lots.find((l) => l.id === variantLotId);
      if (!variantLot) {
        throw new Error(
          `No hay lote de stock para la variante de ${product.name}.`
        );
      }

      const weightUnit = isWeightOrVolumeUnit(product.unitOfMeasure);
      const variantTotals = {
        totalQuantity: variantLot.quantity_available ?? 0,
        totalUnits: variantLot.unit_quantity_available ?? null,
      };
      const requiredBase = weightUnit
        ? resolveWeightRequirement(item, product, variantTotals)
        : item.quantity;

      if (requiredBase > variantTotals.totalQuantity) {
        throw new Error(
          `No hay stock suficiente para la variante de ${product.name}. Disponible: ${variantTotals.totalQuantity}`
        );
      }

      const availableQuantity = Math.max(0, variantLot.quantity_available ?? 0);
      const baseToConsume = Math.min(availableQuantity, requiredBase);

      if (baseToConsume <= 0) {
        throw new Error(
          `No se pudo asignar stock para la variante de ${product.name}.`
        );
      }

      const lotId = variantLot.id;
      if (!lotId) {
        throw new Error(
          `El lote de la variante de ${product.name} no tiene ID.`
        );
      }

      if (!rollbackSnapshotByLot.has(lotId)) {
        rollbackSnapshotByLot.add(lotId);
        rollbackLotUpdates.push({
          id: lotId,
          organization_id: orgId,
          product_id: variantLot.product_id as string,
          lot_number: variantLot.lot_number ?? "DEFAULT",
          expiration_date: variantLot.expiration_date,
          quantity_available: availableQuantity,
          ...(variantLot.unit_quantity_available !== null
            ? { unit_quantity_available: variantLot.unit_quantity_available }
            : {}),
          updated_at: timestamp,
        });
      }

      const nextQuantity = Math.max(0, availableQuantity - baseToConsume);

      lotUpdates.push({
        id: lotId,
        organization_id: orgId,
        product_id: variantLot.product_id as string,
        lot_number: variantLot.lot_number ?? "DEFAULT",
        expiration_date: variantLot.expiration_date,
        quantity_available: nextQuantity,
        updated_at: timestamp,
      });

      movementPayloads.push({
        organization_id: orgId,
        lot_id: lotId,
        type: "OUTBOUND",
        quantity: baseToConsume,
        previous_stock: availableQuantity,
        new_stock: nextQuantity,
        reason: movementReason,
      });

      continue;
    }

    // ============= PRODUCTOS SIN VARIANTES (FIFO existente) =============
    const productLots = [...(lotsByProduct.get(item.productId) ?? [])].sort(
      compareLotsForFifo
    );
    const totals = totalsByProduct.get(item.productId) ?? {
      totalQuantity: 0,
      totalUnits: null as number | null,
    };

    if (!productLots.length || totals.totalQuantity <= 0) {
      throw new Error(`No hay stock disponible para ${product.name}.`);
    }

    const weightUnit = isWeightOrVolumeUnit(product.unitOfMeasure);
    const requiredBase = weightUnit
      ? resolveWeightRequirement(item, product, totals)
      : item.quantity;
    const requiredUnits =
      weightUnit && product.tracksStockUnits ? item.quantity : null;

    if (requiredBase > totals.totalQuantity) {
      throw new Error(
        `No hay stock suficiente para ${product.name}. Disponible: ${totals.totalQuantity}`
      );
    }

    if (
      requiredUnits !== null &&
      totals.totalUnits !== null &&
      requiredUnits > totals.totalUnits
    ) {
      throw new Error(
        `No hay unidades suficientes para ${product.name}. Disponibles: ${totals.totalUnits}`
      );
    }

    let remainingBase = requiredBase;
    let remainingUnits = requiredUnits ?? 0;

    for (const lot of productLots) {
      if (remainingBase <= 0 && remainingUnits <= 0) {
        break;
      }

      const lotId = lot.id;
      const lotProductId = lot.product_id;

      if (!(lotId && lotProductId)) {
        continue;
      }

      const availableQuantity = Math.max(0, lot.quantity_available ?? 0);
      const availableUnits =
        requiredUnits !== null && lot.unit_quantity_available !== null
          ? Math.max(0, lot.unit_quantity_available ?? 0)
          : 0;

      if (availableQuantity <= 0 && availableUnits <= 0) {
        continue;
      }

      const baseToConsume =
        remainingBase > 0 ? Math.min(availableQuantity, remainingBase) : 0;
      const unitsToConsume =
        requiredUnits !== null && remainingUnits > 0
          ? Math.min(availableUnits, remainingUnits)
          : 0;

      if (baseToConsume <= 0 && unitsToConsume <= 0) {
        continue;
      }

      const lotNumber = lot.lot_number ?? "DEFAULT";
      const expirationDate = lot.expiration_date ?? null;

      if (!rollbackSnapshotByLot.has(lotId)) {
        rollbackSnapshotByLot.add(lotId);
        rollbackLotUpdates.push({
          id: lotId,
          organization_id: orgId,
          product_id: lotProductId as string,
          lot_number: lotNumber,
          expiration_date: expirationDate,
          quantity_available: availableQuantity,
          ...(lot.unit_quantity_available !== null
            ? { unit_quantity_available: lot.unit_quantity_available }
            : {}),
          updated_at: timestamp,
        });
      }

      const nextQuantity = Math.max(0, availableQuantity - baseToConsume);
      const nextUnits =
        requiredUnits !== null && lot.unit_quantity_available !== null
          ? Math.max(0, (lot.unit_quantity_available ?? 0) - unitsToConsume)
          : null;

      lotUpdates.push({
        id: lotId,
        organization_id: orgId,
        product_id: lotProductId as string,
        lot_number: lotNumber,
        expiration_date: expirationDate,
        quantity_available: nextQuantity,
        ...(nextUnits !== null ? { unit_quantity_available: nextUnits } : {}),
        updated_at: timestamp,
      });

      movementPayloads.push({
        organization_id: orgId,
        lot_id: lotId,
        type: "OUTBOUND",
        quantity: baseToConsume,
        previous_stock: availableQuantity,
        new_stock: nextQuantity,
        unit_quantity:
          requiredUnits !== null && unitsToConsume > 0 ? -unitsToConsume : null,
        reason: movementReason,
      });

      remainingBase -= baseToConsume;
      remainingUnits -= unitsToConsume;
    }

    if (remainingBase > 0 || remainingUnits > 0) {
      throw new Error(
        `No se pudo asignar stock suficiente para ${product.name}.`
      );
    }
  }

  return {
    lotUpdates,
    rollbackLotUpdates,
    movementPayloads,
  } as StockAdjustmentContext;
}

async function getSaleReasonMetadata(
  supabase: SupabaseServerClient,
  orgId: string,
  saleId: string
): Promise<{
  saleNumber: number | null;
  invoiceNumber: string | null;
  customerName: string | null;
  reasonText: string;
  legacyReasonText: string;
}> {
  const { data, error } = await supabase
    .from("sales_orders")
    .select(
      `
        sale_number,
        invoice_number,
        customer:customers(fantasy_name, business_name)
      `
    )
    .eq("id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("No se pudo obtener la referencia de la venta", {
      saleId,
      error,
    });
  }

  const customerName = resolveCustomerDisplayNameFromRecord(
    (
      data as {
        customer?: {
          fantasy_name?: string | null;
          business_name?: string | null;
        };
      }
    )?.customer ?? null
  );

  const saleNumber =
    (data as { sale_number?: number | null })?.sale_number ?? null;
  const invoiceNumber =
    (data as { invoice_number?: string | null })?.invoice_number ?? null;

  return {
    saleNumber,
    invoiceNumber,
    customerName,
    reasonText: formatSaleMovementReason({
      saleNumber,
      invoiceNumber,
      saleId,
      customerName,
    }),
    legacyReasonText: `Venta confirmada ${saleId}`,
  };
}

async function applyStockAdjustments(
  supabase: SupabaseServerClient,
  context: StockAdjustmentContext
) {
  if (!context.lotUpdates.length) {
    return [] as string[];
  }

  const { error: lotUpdateError } = await supabase
    .from("product_lots")
    .upsert(context.lotUpdates);

  if (lotUpdateError) {
    throw new Error(
      `No se pudo descontar el stock de los productos: ${lotUpdateError.message}`
    );
  }

  if (!context.movementPayloads.length) {
    return [] as string[];
  }

  const { data: movements, error: movementError } = await supabase
    .from("stock_movements")
    .insert(context.movementPayloads)
    .select("id");

  if (movementError) {
    await supabase.from("product_lots").upsert(context.rollbackLotUpdates);
    throw new Error(
      `No se pudo registrar el movimiento de stock: ${movementError.message}`
    );
  }

  return (movements ?? [])
    .map((movement) => movement.id)
    .filter((id): id is string => Boolean(id));
}

export async function confirmIncompleteSaleWithStockDeduction(
  supabase: SupabaseServerClient,
  orgId: string,
  saleId: string
): Promise<void> {
  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select(
      "id, status, sale_number, invoice_number, customer_id, total_amount, user_id"
    )
    .eq("id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (saleError || !sale) {
    throw new Error("Venta no encontrada");
  }

  if (sale.status !== "INCOMPLETE") {
    throw new Error("La venta no está en estado incompleto");
  }

  const { data: saleCustomer } = await supabase
    .from("customers")
    .select("business_name, fantasy_name")
    .eq("id", sale.customer_id)
    .eq("organization_id", orgId)
    .maybeSingle();

  const { data: dbItems, error: itemsError } = await supabase
    .from("sales_order_items")
    .select(
      "id, product_id, product_variant_id, quantity, unit_price, base_price, discount_percentage, unit_quantity, description, is_adjustment"
    )
    .eq("sales_order_id", saleId);

  if (itemsError || !dbItems?.length) {
    throw new Error("La venta no tiene items para descontar stock");
  }

  const items = normalizeConfirmItems(
    dbItems.map((item) => ({
      id: item.id,
      type: item.is_adjustment ? ("adjustment" as const) : ("product" as const),
      productId: item.product_id,
      productVariantId: item.product_variant_id,
      description: item.description,
      quantity: item.quantity,
      weightQuantity: item.unit_quantity,
      unitPrice: item.unit_price,
      basePrice: item.base_price,
      discountPercentage: item.discount_percentage,
    }))
  );

  const customerName = resolveCustomerDisplayNameFromRecord(
    saleCustomer ?? null
  );

  const movementReason = formatSaleMovementReason({
    saleNumber: sale.sale_number,
    invoiceNumber: sale.invoice_number,
    saleId,
    customerName,
  });

  const context = await buildStockAdjustmentContext({
    supabase,
    orgId,
    items,
    movementReason,
  });

  const movementIds = await applyStockAdjustments(supabase, context);

  const { error: updateError } = await supabase
    .from("sales_orders")
    .update({
      status: "CONFIRMED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("organization_id", orgId);

  if (updateError) {
    await rollbackStockAdjustments(supabase, orgId, context, movementIds);
    throw new Error(`No se pudo confirmar la venta: ${updateError.message}`);
  }
}

export async function dispatchSaleFromOrders(
  supabase: SupabaseServerClient,
  orgId: string,
  saleId: string
): Promise<void> {
  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select("id, status, customer_id, total_amount, credit_days")
    .eq("id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (saleError || !sale) {
    throw new Error("Venta no encontrada");
  }

  if (sale.status !== "CONFIRMED" && sale.status !== "INCOMPLETE") {
    throw new Error("Solo las ventas confirmadas pueden despacharse");
  }

  const dispatchedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("sales_orders")
    .update({
      status: "DISPATCH" satisfies Database["public"]["Enums"]["order_status"],
      dispatched_at: dispatchedAt,
      updated_at: dispatchedAt,
    })
    .eq("id", saleId)
    .eq("organization_id", orgId);

  if (updateError) {
    throw new Error(`No se pudo despachar la venta: ${updateError.message}`);
  }

  await updateReceivableForDispatchedSale({
    supabase,
    orgId,
    saleId,
    customerId: sale.customer_id,
    totalAmount: Number(sale.total_amount ?? 0),
    creditDays: sale.credit_days ?? null,
    dispatchedAt,
  });
}

async function rollbackStockAdjustments(
  supabase: SupabaseServerClient,
  orgId: string,
  context: StockAdjustmentContext,
  movementIds: string[]
) {
  if (movementIds.length) {
    try {
      await supabase
        .from("stock_movements")
        .delete()
        .in("id", movementIds)
        .eq("organization_id", orgId);
    } catch (error) {
      console.error("No se pudieron revertir los movimientos de stock", error);
    }
  }

  if (context.rollbackLotUpdates.length) {
    try {
      await supabase.from("product_lots").upsert(context.rollbackLotUpdates);
    } catch (error) {
      console.error("No se pudo revertir el stock descontado", error);
    }
  }
}

type StockMovementRow = {
  lot_id: string | null;
  quantity: number | null;
  unit_quantity: number | null;
};

type NetLot = { quantity: number; unit_quantity: number | null };

function accumulateOutbounds(
  netByLot: Map<string, NetLot>,
  outbounds: StockMovementRow[]
): void {
  for (const m of outbounds) {
    if (!m.lot_id) {
      continue;
    }
    const current = netByLot.get(m.lot_id) ?? {
      quantity: 0,
      unit_quantity: null,
    };
    const uq = m.unit_quantity != null ? Math.abs(m.unit_quantity) : null;
    netByLot.set(m.lot_id, {
      quantity: current.quantity + (m.quantity ?? 0),
      unit_quantity:
        uq != null ? (current.unit_quantity ?? 0) + uq : current.unit_quantity,
    });
  }
}

function subtractPreviousReingresos(
  netByLot: Map<string, NetLot>,
  reingresos: StockMovementRow[]
): void {
  for (const m of reingresos) {
    if (!m.lot_id) {
      continue;
    }
    const current = netByLot.get(m.lot_id);
    if (!current) {
      continue;
    }
    const uq = m.unit_quantity != null ? Math.abs(m.unit_quantity) : null;
    netByLot.set(m.lot_id, {
      quantity: current.quantity - (m.quantity ?? 0),
      unit_quantity:
        uq != null && current.unit_quantity != null
          ? current.unit_quantity - uq
          : current.unit_quantity,
    });
  }
}

/**
 * net = Σ OUTBOUNDs (all confirmation cycles) − Σ Reingreso INBOUNDs already applied.
 * Prevents double-counting when a confirmed sale is re-edited multiple times.
 */
function buildNetByLot(
  outbounds: StockMovementRow[],
  previousReingresos: StockMovementRow[]
): Map<string, NetLot> {
  const netByLot = new Map<string, NetLot>();
  accumulateOutbounds(netByLot, outbounds);
  subtractPreviousReingresos(netByLot, previousReingresos);
  return netByLot;
}

type RestockPayloads = {
  lotUpdates: Database["public"]["Tables"]["product_lots"]["Insert"][];
  movements: Database["public"]["Tables"]["stock_movements"]["Insert"][];
};

type LotRow = {
  id: string | null;
  product_id: string | null;
  lot_number: string | null;
  expiration_date: string | null;
  quantity_available: number | null;
  unit_quantity_available: number | null;
};

type RestockContext = {
  orgId: string;
  reingresReason: string;
  timestamp: string;
};

type LotRestockEntry = {
  lotUpdate: Database["public"]["Tables"]["product_lots"]["Insert"];
  movement: Database["public"]["Tables"]["stock_movements"]["Insert"];
};

function buildSingleLotRestock(
  lot: LotRow,
  net: NetLot,
  ctx: RestockContext
): LotRestockEntry | null {
  if (!(lot.id && lot.product_id && lot.lot_number && lot.expiration_date)) {
    return null;
  }
  const previousStock = lot.quantity_available ?? 0;
  const previousUnitStock = lot.unit_quantity_available ?? null;
  const newStock = previousStock + net.quantity;
  const restoredUnitQuantity =
    net.unit_quantity != null && previousUnitStock != null
      ? previousUnitStock + net.unit_quantity
      : previousUnitStock;

  return {
    lotUpdate: {
      id: lot.id,
      organization_id: ctx.orgId,
      product_id: lot.product_id,
      lot_number: lot.lot_number,
      expiration_date: lot.expiration_date,
      quantity_available: newStock,
      ...(restoredUnitQuantity != null
        ? { unit_quantity_available: restoredUnitQuantity }
        : {}),
      updated_at: ctx.timestamp,
    },
    movement: {
      organization_id: ctx.orgId,
      lot_id: lot.id,
      type: "INBOUND",
      quantity: net.quantity,
      previous_stock: previousStock,
      new_stock: newStock,
      unit_quantity: net.unit_quantity,
      reason: ctx.reingresReason,
    },
  };
}

function buildRestockPayloads(
  lots: LotRow[],
  netByLot: Map<string, NetLot>,
  ctx: RestockContext
): RestockPayloads {
  const lotUpdatesById = new Map<
    string,
    Database["public"]["Tables"]["product_lots"]["Insert"]
  >();
  const movements: Database["public"]["Tables"]["stock_movements"]["Insert"][] =
    [];

  for (const lot of lots) {
    if (!lot.id) {
      continue;
    }
    const net = netByLot.get(lot.id);
    if (!net || net.quantity <= 0) {
      continue;
    }
    const entry = buildSingleLotRestock(lot, net, ctx);
    if (!entry) {
      continue;
    }
    lotUpdatesById.set(lot.id, entry.lotUpdate);
    movements.push(entry.movement);
  }

  return { lotUpdates: Array.from(lotUpdatesById.values()), movements };
}

async function restockFromSale(
  supabase: SupabaseServerClient,
  orgId: string,
  saleId: string
) {
  const saleReason = await getSaleReasonMetadata(supabase, orgId, saleId);

  const reingresReason = formatSaleMovementReason({
    saleNumber: saleReason.saleNumber,
    invoiceNumber: saleReason.invoiceNumber,
    saleId,
    customerName: saleReason.customerName,
    prefix: "Reingreso ",
  });

  const [outboundsResult, inboundsResult] = await Promise.all([
    supabase
      .from("stock_movements")
      .select("lot_id, quantity, unit_quantity")
      .eq("organization_id", orgId)
      .eq("type", "OUTBOUND")
      .in("reason", [saleReason.reasonText, saleReason.legacyReasonText]),
    supabase
      .from("stock_movements")
      .select("lot_id, quantity, unit_quantity")
      .eq("organization_id", orgId)
      .eq("type", "INBOUND")
      .eq("reason", reingresReason),
  ]);

  if (outboundsResult.error) {
    throw new Error(
      `No se pudieron obtener los movimientos de la venta para reingresar stock: ${outboundsResult.error.message}`
    );
  }

  const outbounds = outboundsResult.data ?? [];
  if (!outbounds.length) {
    return;
  }

  const netByLot = buildNetByLot(outbounds, inboundsResult.data ?? []);

  const activeLotIds = Array.from(netByLot.entries())
    .filter(([, net]) => net.quantity > 0)
    .map(([lotId]) => lotId);

  if (!activeLotIds.length) {
    return;
  }

  const { data: lots, error: lotsError } = await supabase
    .from("product_lots")
    .select(
      "id, product_id, quantity_available, unit_quantity_available, lot_number, expiration_date"
    )
    .eq("organization_id", orgId)
    .in("id", activeLotIds);

  if (lotsError) {
    throw new Error(
      `No se pudieron obtener los lotes para reingresar stock: ${lotsError.message}`
    );
  }

  const { lotUpdates, movements } = buildRestockPayloads(lots ?? [], netByLot, {
    orgId,
    reingresReason,
    timestamp: new Date().toISOString(),
  });

  if (lotUpdates.length) {
    const { error: updateError } = await supabase
      .from("product_lots")
      .upsert(lotUpdates);
    if (updateError) {
      throw new Error(
        `No se pudo reingresar el stock de la venta: ${updateError.message}`
      );
    }
  }

  if (movements.length) {
    const { error: movementInsertError } = await supabase
      .from("stock_movements")
      .insert(movements);
    if (movementInsertError) {
      throw new Error(
        `No se pudo registrar el reingreso de stock: ${movementInsertError.message}`
      );
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: confirmation flow validates and persists several related records
export async function confirmSaleOrder(
  input: ConfirmSaleOrderInput
): Promise<ConfirmSaleResult> {
  const { orgSlug, saleId, customerId, sellerId, saleDate } = input;

  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  if (!customerId) {
    throw new Error("El cliente es requerido");
  }

  if (!saleDate) {
    throw new Error("La fecha de venta es requerida");
  }

  const items = normalizeConfirmItems(input.items);

  if (!items.length) {
    throw new Error("Agrega al menos un ítem para confirmar la venta");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);

  const { data: existingSale, error: saleError } = await supabase
    .from("sales_orders")
    .select(
      "id, status, credit_days, invoice_type, expiration_date, sale_number, invoice_number, user_id, total_amount"
    )
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `Error obteniendo la venta para confirmar: ${saleError.message}`
    );
  }

  if (!existingSale) {
    throw new Error("Venta no encontrada");
  }

  assertCanManageSale(accessContext, existingSale.user_id ?? null);

  const currentStatus = existingSale.status as SalesOrderStatus;

  if (currentStatus === "CANCELLED") {
    throw new Error("No se puede confirmar una venta cancelada");
  }

  if (currentStatus === "CONFIRMED") {
    throw new Error("La venta ya está confirmada");
  }

  if (currentStatus !== "DRAFT" && currentStatus !== "INCOMPLETE") {
    throw new Error(
      "Solo las preventas en borrador o incompletas pueden confirmarse"
    );
  }

  if (currentStatus === "INCOMPLETE") {
    const { error: updateError } = await supabase
      .from("sales_orders")
      .update({
        status: "CONFIRMED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", saleId)
      .eq("organization_id", org.id);

    if (updateError) {
      throw new Error(`No se pudo confirmar la venta: ${updateError.message}`);
    }

    return {
      status: "CONFIRMED",
      saleId,
      totalAmount: existingSale.total_amount ?? 0,
    };
  }

  assertCanAssignSeller(accessContext, sellerId);

  const { data: saleCustomer, error: customerError } = await supabase
    .from("customers")
    .select("business_name, fantasy_name")
    .eq("id", customerId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (customerError) {
    console.error(
      "No se pudo obtener el cliente para el motivo de stock de la venta",
      customerError
    );
  }

  const saleMovementReason = formatSaleMovementReason({
    saleNumber: existingSale.sale_number,
    invoiceNumber: input.invoiceNumber ?? existingSale.invoice_number,
    saleId,
    customerName: resolveCustomerDisplayNameFromRecord(saleCustomer ?? null),
  });

  const shouldUpdateStock = currentStatus === "DRAFT";
  const stockAdjustmentContext = shouldUpdateStock
    ? await buildStockAdjustmentContext({
        supabase,
        orgId: org.id,
        items,
        movementReason: saleMovementReason,
      })
    : null;

  let appliedMovementIds: string[] = [];
  let accountingInformalEntryId = input.accountingInformalEntryId ?? undefined;

  if (stockAdjustmentContext?.lotUpdates.length) {
    appliedMovementIds = await applyStockAdjustments(
      supabase,
      stockAdjustmentContext
    );
  }

  try {
    const invoiceType =
      input.invoiceType ||
      (existingSale.invoice_type as Database["public"]["Enums"]["invoice_type"]) ||
      defaultInvoiceType;

    const creditDays = input.creditDays ?? existingSale.credit_days ?? null;
    const accountingIntegrationEnabled = await isAccountingIntegrationEnabled(
      input.orgSlug
    );
    accountingInformalEntryId = accountingIntegrationEnabled
      ? (input.accountingInformalEntryId ?? undefined)
      : undefined;
    const dueDate = computeDueDate(
      saleDate,
      input.expirationDate ?? existingSale.expiration_date ?? null,
      creditDays
    );

    const subTotalAmount = items.reduce((total, item) => {
      const { subtotal } = calculateConfirmItemTotals(item);
      return truncateMoney(total + subtotal);
    }, 0);

    const normalizedGlobalDiscountPercent =
      input.globalDiscountPercentage !== null &&
      input.globalDiscountPercentage !== undefined
        ? Math.min(Math.max(Number(input.globalDiscountPercentage), 0), 100)
        : null;

    const computedGlobalDiscountAmount =
      normalizedGlobalDiscountPercent !== null
        ? truncateMoney(
            (normalizedGlobalDiscountPercent / 100) * subTotalAmount
          )
        : null;

    const globalDiscountAmount = truncateMoney(
      Math.min(
        Math.max(0, computedGlobalDiscountAmount ?? 0),
        Math.max(0, subTotalAmount)
      )
    );

    const discountedSubtotal = truncateMoney(
      Math.max(0, subTotalAmount - globalDiscountAmount)
    );

    const fallbackTaxes = await resolveFallbackSaleTaxes({
      supabase,
      orgId: org.id,
      taxes: input.taxes,
    });
    const taxPlan = await buildSaleItemizedTaxPlan({
      supabase,
      orgId: org.id,
      lines: buildConfirmSaleTaxableLines(items),
      fallbackTaxes,
      globalDiscountAmount,
    });
    const totalTaxAmount = taxPlan.totalTaxAmount;

    const totalAmount = truncateMoney(
      Math.max(0, discountedSubtotal + totalTaxAmount)
    );

    const confirmSaleUpdate = {
      customer_id: customerId,
      user_id: sellerId,
      sale_date: saleDate,
      credit_days: creditDays,
      expiration_date: dueDate,
      invoice_type: invoiceType,
      invoice_number: sanitizeText(input.invoiceNumber),
      observations: sanitizeText(input.observations),
      sub_total: subTotalAmount,
      total_tax_amount: taxPlan.aggregateTaxes.length ? totalTaxAmount : null,
      global_discount_percentage: normalizedGlobalDiscountPercent ?? 0,
      global_discount_amount: globalDiscountAmount,
      total_amount: totalAmount,
      status: "CONFIRMED" satisfies Database["public"]["Enums"]["order_status"],
      updated_at: new Date().toISOString(),
      ...(accountingInformalEntryId
        ? { accounting_informal_entry_id: accountingInformalEntryId }
        : {}),
    };

    const { error: updateSaleError } = await supabase
      .from("sales_orders")
      .update(confirmSaleUpdate as never)
      .eq("id", saleId)
      .eq("organization_id", org.id);

    if (updateSaleError) {
      throw new Error(
        `No se pudo confirmar la venta: ${updateSaleError.message}`
      );
    }

    const itemsPayload = items.map((item) => {
      const totals = calculateConfirmItemTotals(item);
      const usesWeight = shouldUseWeightQuantity(item);

      return {
        id: item.id,
        organization_id: org.id,
        sales_order_id: saleId,
        product_id: item.productId,
        quantity: item.quantity,
        unit_quantity: usesWeight ? (item.weightQuantity ?? null) : null,
        unit_price: truncateMoney(item.unitPrice),
        base_price: truncateMoney(item.basePrice ?? item.unitPrice),
        discount_amount: truncateMoney(totals.discount),
        discount_percentage: item.discountPercentage ?? 0,
        subtotal: truncateMoney(totals.subtotal),
      };
    });

    const { error: itemsError } = await supabase
      .from("sales_order_items")
      .upsert(itemsPayload as never);

    if (itemsError) {
      throw new Error(
        `No se pudieron actualizar los productos de la venta: ${itemsError.message}`
      );
    }

    await replaceSalesOrderTaxSnapshots({
      supabase,
      orgId: org.id,
      saleOrderId: saleId,
      taxPlan,
    });

    if (accountingIntegrationEnabled && accountingInformalEntryId) {
      if (invoiceType === "NOTA_DE_VENTA") {
        try {
          await asentarInformalEntry(accountingInformalEntryId, org.id);
        } catch (asentarError) {
          console.error(
            "No se pudo marcar como asentado el asiento informal de la nota de venta",
            asentarError
          );
        }
      } else if (sanitizeText(input.invoiceNumber)) {
        try {
          await formalizarEntry(accountingInformalEntryId, org.id);
        } catch (formalizeError) {
          console.error(
            "No se pudo formalizar el asiento informal al confirmar la venta",
            formalizeError
          );
        }
      }
    }

    return { status: "CONFIRMED", saleId, totalAmount };
  } catch (error) {
    if (accountingInformalEntryId) {
      try {
        await cancelInformalEntry(accountingInformalEntryId, org.id);
      } catch (cancelError) {
        console.error(
          "No se pudo cancelar el asiento informal luego del error en la confirmacion de venta",
          cancelError
        );
      }
    }

    if (stockAdjustmentContext) {
      await rollbackStockAdjustments(
        supabase,
        org.id,
        stockAdjustmentContext,
        appliedMovementIds
      );
    }
    throw error;
  }
}

export async function deriveSaleCreditSupplier(
  supabase: SupabaseServerClient,
  saleId: string
): Promise<string | null> {
  const { data: saleItems } = await supabase
    .from("sales_order_items")
    .select("product_id, products!inner(supplier_id)")
    .eq("sales_order_id", saleId)
    .not("product_id", "is", null);

  if (!saleItems?.length) {
    return null;
  }

  const supplierIds = new Set<string>();
  for (const item of saleItems) {
    const product = item.products as unknown as {
      supplier_id: string | null;
    } | null;
    if (product?.supplier_id) {
      supplierIds.add(product.supplier_id);
    }
  }

  return supplierIds.size === 1 ? [...supplierIds][0] : null;
}

async function cancelSaleReceivable(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  customerId: string | null | undefined;
}): Promise<void> {
  const { supabase, orgId, saleId, customerId } = params;

  const { data: receivable } = await supabase
    .from("accounts_receivable")
    .select("id, total_amount, pending_balance")
    .eq("sales_order_id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!receivable?.id) {
    return;
  }

  const previousTotal = truncateMoney(Number(receivable.total_amount ?? 0));
  const previousPending = truncateMoney(
    Number(receivable.pending_balance ?? 0)
  );
  const paidAmount = truncateMoney(
    Math.max(0, previousTotal - previousPending)
  );

  const { error: receivableError } = await supabase
    .from("accounts_receivable")
    .update({
      pending_balance: 0,
      status: "PAID" satisfies Database["public"]["Enums"]["receivable_status"],
      updated_at: new Date().toISOString(),
    })
    .eq("id", receivable.id);

  if (receivableError) {
    throw new Error(
      `Venta cancelada, pero no se pudo actualizar la cuenta por cobrar: ${receivableError.message}`
    );
  }

  if (paidAmount > 0 && customerId) {
    const creditAmount = truncateMoney(paidAmount);
    const creditSupplierId = await deriveSaleCreditSupplier(supabase, saleId);

    await supabase.from("customer_credits").insert({
      organization_id: orgId,
      customer_id: customerId,
      supplier_id: creditSupplierId,
      amount: creditAmount,
      remaining_amount: creditAmount,
      source_payment_id: null,
      notes: `Saldo a favor generado por cancelación de venta ${saleId}`,
    });
  }
}

export async function cancelSaleOrder(
  orgSlug: string,
  saleId: string
): Promise<{
  status: Database["public"]["Enums"]["order_status"];
  wasUpdated: boolean;
}> {
  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);

  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select("id, status, user_id, customer_id")
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `Error obteniendo la venta para cancelar: ${saleError.message}`
    );
  }

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  assertCanManageSale(accessContext, sale.user_id ?? null);

  if (sale.status === "CANCELLED") {
    return { status: sale.status, wasUpdated: false };
  }

  const shouldRestock =
    sale.status === "CONFIRMED" ||
    sale.status === "DISPATCH" ||
    sale.status === "DELIVERED";

  if (shouldRestock) {
    await restockFromSale(supabase, org.id, saleId);
  }

  const { error: updateError } = await supabase
    .from("sales_orders")
    .update({
      status: "CANCELLED" satisfies Database["public"]["Enums"]["order_status"],
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("organization_id", org.id);

  if (updateError) {
    throw new Error(`No se pudo cancelar la venta: ${updateError.message}`);
  }

  const customerId = (sale as { customer_id?: string | null })?.customer_id;

  await cancelSaleReceivable({
    supabase,
    orgId: org.id,
    saleId,
    customerId,
  });

  return { status: "CANCELLED", wasUpdated: true };
}

export async function dispatchSaleOrder(
  input: DispatchSaleOrderInput
): Promise<{ status: SalesOrderStatus }> {
  const { orgSlug, saleId, remittanceNumber, carrierId } = input;

  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  if (!remittanceNumber?.trim()) {
    throw new Error("El número de remito es requerido para despachar");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);

  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select(
      "id, status, user_id, customer_id, credit_days, dispatched_at, total_amount"
    )
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `Error obteniendo la venta para despachar: ${saleError.message}`
    );
  }

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  assertCanManageSale(accessContext, sale.user_id ?? null);

  const currentStatus = sale.status as SalesOrderStatus;

  if (currentStatus === "CANCELLED") {
    throw new Error("No se puede despachar una venta cancelada");
  }

  if (currentStatus !== "CONFIRMED" && currentStatus !== "DISPATCH") {
    throw new Error("Solo las ventas confirmadas pueden despacharse");
  }

  const dispatchedAt = sale.dispatched_at ?? new Date().toISOString();
  const { error: updateError } = await supabase
    .from("sales_orders")
    .update({
      status: "DISPATCH" satisfies Database["public"]["Enums"]["order_status"],
      remittance_number: remittanceNumber.trim(),
      carrier_id: carrierId ?? null,
      dispatched_at: dispatchedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("organization_id", org.id);

  if (updateError) {
    throw new Error(`No se pudo despachar la venta: ${updateError.message}`);
  }

  await updateReceivableForDispatchedSale({
    supabase,
    orgId: org.id,
    saleId,
    customerId: sale.customer_id,
    totalAmount: Number(sale.total_amount ?? 0),
    creditDays: sale.credit_days ?? null,
    dispatchedAt,
  });

  return { status: "DISPATCH" };
}

export async function deliverSaleOrder(
  input: DeliverSaleOrderInput
): Promise<{ status: SalesOrderStatus }> {
  const { orgSlug, saleId } = input;

  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);

  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select("id, status, user_id")
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `Error obteniendo la venta para entregar: ${saleError.message}`
    );
  }

  if (!sale) {
    throw new Error("Venta no encontrada");
  }

  assertCanManageSale(accessContext, sale.user_id ?? null);

  const currentStatus = sale.status as SalesOrderStatus;

  if (currentStatus === "CANCELLED") {
    throw new Error("No se puede entregar una venta cancelada");
  }

  if (currentStatus !== "DISPATCH" && currentStatus !== "DELIVERED") {
    throw new Error(
      "Solo las ventas despachadas pueden marcarse como entregadas"
    );
  }

  const { error: updateError } = await supabase
    .from("sales_orders")
    .update({
      status: "DELIVERED" satisfies Database["public"]["Enums"]["order_status"],
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("organization_id", org.id);

  if (updateError) {
    throw new Error(
      `No se pudo marcar la venta como entregada: ${updateError.message}`
    );
  }

  return { status: "DELIVERED" };
}

async function validateSaleForUpdate(
  supabase: SupabaseServerClient,
  orgId: string,
  saleId: string
): Promise<{
  arcaStatus: string | null;
  status: SalesOrderStatus;
  saleNumber: number | null;
  invoiceNumber: string | null;
  invoiceType: Database["public"]["Enums"]["invoice_type"] | null;
  customerId: string | null;
  userId: string | null;
}> {
  const { data: existingSale, error: saleError } = await supabase
    .from("sales_orders")
    .select(
      "id, status, sale_number, invoice_number, invoice_type, customer_id, user_id, arca_status"
    )
    .eq("id", saleId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (saleError) {
    throw new Error(
      `Error obteniendo la venta para actualizar: ${saleError.message}`
    );
  }

  if (!existingSale) {
    throw new Error("Venta no encontrada");
  }

  const currentStatus = existingSale.status as SalesOrderStatus;

  if (currentStatus === "CANCELLED") {
    throw new Error("No se puede actualizar una venta cancelada");
  }

  if (
    currentStatus !== "DRAFT" &&
    currentStatus !== "CONFIRMED" &&
    currentStatus !== "DISPATCH" &&
    currentStatus !== "DELIVERED"
  ) {
    throw new Error(
      "Solo las preventas en borrador o ventas confirmadas/despachadas/entregadas pueden actualizarse"
    );
  }

  return {
    arcaStatus:
      typeof existingSale.arca_status === "string"
        ? existingSale.arca_status
        : null,
    status: currentStatus,
    saleNumber:
      typeof existingSale.sale_number === "number"
        ? existingSale.sale_number
        : null,
    invoiceNumber:
      typeof existingSale.invoice_number === "string"
        ? existingSale.invoice_number
        : null,
    invoiceType:
      typeof existingSale.invoice_type === "string"
        ? (existingSale.invoice_type as Database["public"]["Enums"]["invoice_type"])
        : null,
    customerId:
      typeof existingSale.customer_id === "string"
        ? existingSale.customer_id
        : null,
    userId:
      typeof existingSale.user_id === "string" ? existingSale.user_id : null,
  };
}

function buildSaleUpdateData(
  input: UpdateSaleOrderInput
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.customerId) {
    updateData.customer_id = input.customerId;
  }
  if (input.sellerId) {
    updateData.user_id = input.sellerId;
  }
  if (input.saleDate) {
    updateData.sale_date = input.saleDate;
  }
  if (input.expirationDate !== undefined) {
    updateData.expiration_date = input.expirationDate;
  }
  if (input.creditDays !== undefined) {
    updateData.credit_days = input.creditDays;
  }
  if (input.invoiceType) {
    updateData.invoice_type = input.invoiceType;
  }
  if (input.invoiceNumber !== undefined) {
    updateData.invoice_number = input.invoiceNumber;
  }
  if (input.remittanceNumber !== undefined) {
    updateData.remittance_number = input.remittanceNumber;
  }
  if (input.observations !== undefined) {
    updateData.observations = input.observations;
  }
  if (input.globalDiscountPercentage !== undefined) {
    updateData.global_discount_percentage = input.globalDiscountPercentage;
  }

  return updateData;
}

function resetPendingArcaState(
  updateData: Record<string, unknown>,
  existingSale: Awaited<ReturnType<typeof validateSaleForUpdate>>,
  input: UpdateSaleOrderInput
): void {
  if (existingSale.arcaStatus === "authorized") {
    return;
  }

  const invoiceTypeChanged =
    input.invoiceType !== undefined &&
    input.invoiceType !== existingSale.invoiceType;
  const customerChanged =
    input.customerId !== undefined &&
    input.customerId !== existingSale.customerId;
  const hasFiscalPayload =
    Boolean(input.items?.length) || Boolean(input.taxes?.length);

  if (!(invoiceTypeChanged || customerChanged || hasFiscalPayload)) {
    return;
  }

  Object.assign(updateData, {
    arca_status: "not_requested",
    arca_last_error: null,
    arca_request_json: null,
    arca_response_json: null,
    arca_point_of_sale: null,
    arca_voucher_number: null,
    arca_voucher_type_code: null,
    arca_cae: null,
    arca_cae_expires_at: null,
    arca_authorized_at: null,
  });
}

function assertNoAuthorizedSaleFiscalChanges(
  existingSale: Awaited<ReturnType<typeof validateSaleForUpdate>>,
  input: UpdateSaleOrderInput
): void {
  if (existingSale.arcaStatus !== "authorized") {
    return;
  }

  const fiscalFields = getAuthorizedSaleFiscalUpdateFields(input);

  if (fiscalFields.length === 0) {
    return;
  }

  throw new Error(
    "No se pueden modificar datos fiscales de una venta con factura ARCA emitida."
  );
}

function calculateSaleTotals(
  items: UpdateSaleOrderInput["items"],
  taxes: UpdateSaleOrderInput["taxes"],
  globalDiscountPercentage: number | null | undefined
): {
  subTotalAmount: number;
  totalTaxAmount: number;
  globalDiscountAmount: number;
  totalAmount: number;
  taxAmounts: Array<{
    taxId: string;
    name: string;
    rate: number;
    baseAmount: number;
    taxAmount: number;
  }>;
} {
  if (!items || items.length === 0) {
    return {
      subTotalAmount: 0,
      totalTaxAmount: 0,
      globalDiscountAmount: 0,
      totalAmount: 0,
      taxAmounts: [],
    };
  }

  const subTotalAmount = items.reduce((total, item) => {
    const { subtotal } = calculateConfirmItemTotals({
      id: item.id ?? "",
      type: item.type ?? "product",
      productId: item.productId,
      description: item.description ?? null,
      quantity: item.quantity,
      weightQuantity: item.weightQuantity ?? null,
      unitPrice: item.unitPrice,
      basePrice: item.basePrice,
      discountPercentage: item.discountPercentage ?? null,
    });
    return truncateMoney(total + subtotal);
  }, 0);

  const normalizedGlobalDiscountPercent =
    globalDiscountPercentage !== null && globalDiscountPercentage !== undefined
      ? Math.min(Math.max(Number(globalDiscountPercentage), 0), 100)
      : 0;

  const globalDiscountAmount =
    normalizedGlobalDiscountPercent > 0
      ? truncateMoney(
          Math.min(
            Math.max(
              0,
              (normalizedGlobalDiscountPercent / 100) * subTotalAmount
            ),
            Math.max(0, subTotalAmount)
          )
        )
      : 0;

  const discountedSubtotal = truncateMoney(
    Math.max(0, subTotalAmount - globalDiscountAmount)
  );

  const taxAmountsAfterDiscount = (taxes ?? []).map((tax) => ({
    taxId: tax.taxId,
    name: tax.name,
    rate: tax.rate,
    baseAmount: discountedSubtotal,
    taxAmount: truncateMoney(discountedSubtotal * (tax.rate / 100)),
  }));

  const totalTaxAmount = taxAmountsAfterDiscount.reduce(
    (total, tax) => truncateMoney(total + tax.taxAmount),
    0
  );

  const totalAmount = truncateMoney(
    Math.max(0, discountedSubtotal + totalTaxAmount)
  );

  return {
    subTotalAmount,
    totalTaxAmount,
    globalDiscountAmount,
    totalAmount,
    taxAmounts: taxAmountsAfterDiscount,
  };
}

const STOCK_CHANGE_TOLERANCE = 0.0001;

function normalizeUpdateItemsForConfirm(
  items: NonNullable<UpdateSaleOrderInput["items"]>
): ConfirmSaleItemInput[] {
  return normalizeConfirmItems(
    items.map((item, index) => ({
      id: item.id ?? item.productId ?? `item-${index}`,
      type: item.type ?? "product",
      productId: item.productId ?? null,
      productVariantId: item.productVariantId ?? null,
      description: item.description ?? null,
      quantity: item.quantity,
      weightQuantity: item.weightQuantity ?? null,
      unitPrice: item.unitPrice,
      basePrice: item.basePrice,
      discountPercentage: item.discountPercentage ?? null,
      tracksStockUnits:
        item.tracksStockUnits !== undefined
          ? Boolean(item.tracksStockUnits)
          : undefined,
      unitOfMeasure: item.unitOfMeasure ?? null,
    }))
  );
}

function buildStockSnapshot(items: ConfirmSaleItemInput[]) {
  const snapshot = new Map<
    string,
    { quantity: number; weightQuantity: number | null; hasWeight: boolean }
  >();

  for (const item of items) {
    if (item.type === "adjustment" || !item.productId) {
      continue;
    }

    const current = snapshot.get(item.productId) ?? {
      quantity: 0,
      weightQuantity: 0,
      hasWeight: false,
    };

    current.quantity += item.quantity;

    if (item.weightQuantity !== null && item.weightQuantity !== undefined) {
      current.weightQuantity =
        (current.weightQuantity ?? 0) + item.weightQuantity;
      current.hasWeight = true;
    }

    snapshot.set(item.productId, current);
  }

  for (const [key, value] of snapshot.entries()) {
    snapshot.set(key, {
      quantity: value.quantity,
      weightQuantity: value.hasWeight ? value.weightQuantity : null,
      hasWeight: value.hasWeight,
    });
  }

  return snapshot;
}

function hasStockImpactChange(
  previousItems: ConfirmSaleItemInput[],
  nextItems: ConfirmSaleItemInput[]
): boolean {
  const prevSnapshot = buildStockSnapshot(previousItems);
  const nextSnapshot = buildStockSnapshot(nextItems);

  if (prevSnapshot.size !== nextSnapshot.size) {
    return true;
  }

  for (const [productId, prev] of prevSnapshot.entries()) {
    const next = nextSnapshot.get(productId);
    if (!next) {
      return true;
    }

    if (Math.abs(prev.quantity - next.quantity) > STOCK_CHANGE_TOLERANCE) {
      return true;
    }

    const prevWeight = prev.weightQuantity;
    const nextWeight = next.weightQuantity;

    if (prevWeight === null || nextWeight === null) {
      if (prevWeight !== nextWeight) {
        return true;
      }
    } else if (Math.abs(prevWeight - nextWeight) > STOCK_CHANGE_TOLERANCE) {
      return true;
    }
  }

  return false;
}

async function fetchSaleItemsForStock(
  supabase: SupabaseServerClient,
  orgId: string,
  saleId: string
): Promise<ConfirmSaleItemInput[]> {
  const { data, error } = await supabase
    .from("sales_order_items")
    .select(
      "id, product_id, product_variant_id, description, quantity, unit_quantity, unit_price, base_price, discount_percentage, product:products(tracks_stock_units, unit_of_measure)"
    )
    .eq("organization_id", orgId)
    .eq("sales_order_id", saleId);

  if (error) {
    throw new Error(
      `Error obteniendo los productos para actualizar stock: ${error.message}`
    );
  }

  const mapped = (data ?? []).map(mapStockItemForConfirmInput);

  return normalizeConfirmItems(mapped);
}

function mapStockItemForConfirmInput(
  item: {
    id: string | null;
    product_id: string | null;
    product_variant_id: string | null;
    description: string | null;
    quantity: number | null;
    unit_quantity: number | null;
    unit_price: number | null;
    base_price: number | null;
    discount_percentage: number | null;
    product?: {
      tracks_stock_units?: boolean | null;
      unit_of_measure?: SaleProduct["unitOfMeasure"] | null;
    } | null;
  },
  index: number
): ConfirmSaleItemInput {
  return {
    id: item.id ?? `item-${index}`,
    type: item.product_id ? "product" : "adjustment",
    productId: (item.product_id as string | null) ?? null,
    productVariantId: (item.product_variant_id as string | null) ?? null,
    description: typeof item.description === "string" ? item.description : null,
    quantity: Number(item.quantity ?? 0),
    weightQuantity: item.product_id ? (item.unit_quantity ?? null) : null,
    unitPrice: Number(item.unit_price ?? 0),
    basePrice: Number(item.base_price ?? item.unit_price ?? 0),
    discountPercentage: Number(item.discount_percentage ?? 0),
    tracksStockUnits: item.product_id
      ? Boolean(item.product?.tracks_stock_units)
      : false,
    unitOfMeasure: item.product_id
      ? ((item.product?.unit_of_measure as SaleProduct["unitOfMeasure"]) ??
        null)
      : "UN",
  };
}

async function fetchCustomerName(
  supabase: SupabaseServerClient,
  orgId: string,
  customerId: string | null
): Promise<string | null> {
  if (!customerId) {
    return null;
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("business_name, fantasy_name")
    .eq("id", customerId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("No se pudo obtener el cliente para el motivo de stock", {
      customerId,
      error,
    });
    return null;
  }

  return resolveCustomerDisplayNameFromRecord(customer ?? null);
}

type SaleUpdateContext = {
  updateData: Record<string, unknown>;
  items: NonNullable<UpdateSaleOrderInput["items"]>;
  shouldUpdateItems: boolean;
  totals: ReturnType<typeof calculateSaleTotals> | null;
};

type SaleStockUpdateState = {
  stockContext: StockAdjustmentContext | null;
  appliedMovementIds: string[];
  previousStockItems: ConfirmSaleItemInput[] | null;
  previousMovementReason: string | null;
  stockWasRestocked: boolean;
  stockNeedsRollback: boolean;
};

const isStockedSaleStatus = (status: SalesOrderStatus) =>
  status === "CONFIRMED" || status === "DISPATCH" || status === "DELIVERED";

function buildSaleUpdateContext(
  input: UpdateSaleOrderInput
): SaleUpdateContext {
  const updateData = buildSaleUpdateData(input);
  const items = input.items ?? [];
  const shouldUpdateItems = items.length > 0;
  let totals: ReturnType<typeof calculateSaleTotals> | null = null;

  if (shouldUpdateItems) {
    totals = calculateSaleTotals(
      items,
      input.taxes,
      input.globalDiscountPercentage
    );

    updateData.sub_total = totals.subTotalAmount;
    updateData.total_tax_amount =
      totals.taxAmounts.length > 0 ? totals.totalTaxAmount : null;
    updateData.global_discount_amount = totals.globalDiscountAmount;
    updateData.total_amount = totals.totalAmount;
  }

  return { updateData, items, shouldUpdateItems, totals };
}

type SaleStockImpactContext = {
  newStockItems: ConfirmSaleItemInput[];
  previousStockItems: ConfirmSaleItemInput[];
  previousMovementReason: string;
  movementReason: string;
};

async function resolveSaleStockImpactContext(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  input: UpdateSaleOrderInput;
  existingSale: Awaited<ReturnType<typeof validateSaleForUpdate>>;
  items: NonNullable<UpdateSaleOrderInput["items"]>;
}): Promise<SaleStockImpactContext | null> {
  const newStockItems = normalizeUpdateItemsForConfirm(params.items);
  const previousStockItems = await fetchSaleItemsForStock(
    params.supabase,
    params.orgId,
    params.saleId
  );

  if (!hasStockImpactChange(previousStockItems ?? [], newStockItems ?? [])) {
    return null;
  }

  const oldReason = await getSaleReasonMetadata(
    params.supabase,
    params.orgId,
    params.saleId
  );
  const movementCustomerId =
    params.input.customerId ?? params.existingSale.customerId ?? null;
  const customerName = await fetchCustomerName(
    params.supabase,
    params.orgId,
    movementCustomerId
  );
  const movementReason = formatSaleMovementReason({
    saleNumber: params.existingSale.saleNumber,
    invoiceNumber:
      params.input.invoiceNumber ?? params.existingSale.invoiceNumber,
    saleId: params.saleId,
    customerName,
  });

  return {
    newStockItems,
    previousStockItems,
    previousMovementReason: oldReason.reasonText,
    movementReason,
  };
}

async function applySaleStockUpdate(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  items: ConfirmSaleItemInput[];
  movementReason: string;
}): Promise<{
  stockContext: StockAdjustmentContext;
  appliedMovementIds: string[];
}> {
  const stockContext = await buildStockAdjustmentContext({
    supabase: params.supabase,
    orgId: params.orgId,
    items: params.items ?? [],
    movementReason: params.movementReason,
  });

  const appliedMovementIds = await applyStockAdjustments(
    params.supabase,
    stockContext
  );

  return { stockContext, appliedMovementIds };
}

async function restorePreviousStockAfterEditFailure(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  items: ConfirmSaleItemInput[];
  movementReason: string;
}): Promise<void> {
  try {
    const rollbackContext = await buildStockAdjustmentContext({
      supabase: params.supabase,
      orgId: params.orgId,
      items: params.items ?? [],
      movementReason: params.movementReason,
    });
    await applyStockAdjustments(params.supabase, rollbackContext);
  } catch (rollbackError) {
    console.error(
      "No se pudo restaurar el stock anterior tras fallar la edición",
      rollbackError
    );
  }
}

async function updateSaleStockIfNeeded(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  input: UpdateSaleOrderInput;
  existingSale: Awaited<ReturnType<typeof validateSaleForUpdate>>;
  items: NonNullable<UpdateSaleOrderInput["items"]>;
  shouldUpdateItems: boolean;
  isStockedSale: boolean;
}): Promise<SaleStockUpdateState> {
  const emptyState: SaleStockUpdateState = {
    stockContext: null,
    appliedMovementIds: [],
    previousStockItems: null,
    previousMovementReason: null,
    stockWasRestocked: false,
    stockNeedsRollback: false,
  };

  if (!(params.isStockedSale && params.shouldUpdateItems)) {
    return emptyState;
  }

  const impactContext = await resolveSaleStockImpactContext({
    supabase: params.supabase,
    orgId: params.orgId,
    saleId: params.saleId,
    input: params.input,
    existingSale: params.existingSale,
    items: params.items,
  });

  if (!impactContext) {
    return emptyState;
  }

  let stockWasRestocked = false;

  try {
    await restockFromSale(params.supabase, params.orgId, params.saleId);
    stockWasRestocked = true;

    const { stockContext, appliedMovementIds } = await applySaleStockUpdate({
      supabase: params.supabase,
      orgId: params.orgId,
      items: impactContext.newStockItems,
      movementReason: impactContext.movementReason,
    });

    return {
      stockContext,
      appliedMovementIds,
      previousStockItems: impactContext.previousStockItems,
      previousMovementReason: impactContext.previousMovementReason,
      stockWasRestocked,
      stockNeedsRollback: true,
    };
  } catch (error) {
    if (stockWasRestocked) {
      await restorePreviousStockAfterEditFailure({
        supabase: params.supabase,
        orgId: params.orgId,
        items: impactContext.previousStockItems,
        movementReason: impactContext.previousMovementReason,
      });
    }
    throw error;
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: builds payloads for optional fields and handles RPC fallback
async function persistSaleUpdate(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  updateData: Record<string, unknown>;
  input: UpdateSaleOrderInput;
  items: NonNullable<UpdateSaleOrderInput["items"]>;
  shouldUpdateItems: boolean;
  totals: ReturnType<typeof calculateSaleTotals> | null;
}): Promise<SalesOrder> {
  if (params.shouldUpdateItems) {
    const stableItems = params.items.map((item) => ({
      ...item,
      id: item.id ?? randomUUID(),
    }));
    const rpcItems = stableItems.map((item) => ({
      id: item.id ?? null,
      type: item.type ?? "product",
      productId: item.productId ?? null,
      productVariantId: item.productVariantId ?? null,
      description: item.description ?? null,
      quantity: item.quantity,
      weightQuantity: item.weightQuantity ?? null,
      unitPrice: item.unitPrice,
      basePrice: item.basePrice ?? item.unitPrice,
      discountPercentage: item.discountPercentage ?? 0,
    }));

    const rpcTaxes = (params.input.taxes ?? []).map((tax) => ({
      taxId: tax.taxId,
      name: tax.name,
      rate: tax.rate,
    }));

    const { data: rpcData, error: rpcError } = await (
      params.supabase as SupabaseServerClient & {
        rpc: (
          fn: string,
          args?: Record<string, unknown>
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("update_sale_order_atomic", {
      p_org_id: params.orgId,
      p_sale_id: params.saleId,
      p_customer_id: params.input.customerId ?? null,
      p_user_id: params.input.sellerId ?? null,
      p_sale_date: params.input.saleDate ?? null,
      p_expiration_date:
        params.input.expirationDate !== undefined
          ? params.input.expirationDate
          : null,
      p_credit_days:
        params.input.creditDays !== undefined ? params.input.creditDays : null,
      p_invoice_type: params.input.invoiceType ?? null,
      p_invoice_number:
        params.input.invoiceNumber !== undefined
          ? params.input.invoiceNumber
          : null,
      p_observations:
        params.input.observations !== undefined
          ? params.input.observations
          : null,
      p_global_discount_percentage:
        params.input.globalDiscountPercentage !== undefined
          ? params.input.globalDiscountPercentage
          : null,
      p_items: rpcItems,
      p_taxes: rpcTaxes,
    });

    if (rpcError || !rpcData) {
      throw new Error(
        `Error actualizando la venta de forma atómica: ${rpcError?.message || "Not found"}`
      );
    }

    const fallbackTaxes = await resolveFallbackSaleTaxes({
      supabase: params.supabase,
      orgId: params.orgId,
      taxes: params.input.taxes,
    });
    const globalDiscountAmount = truncateMoney(
      params.totals?.globalDiscountAmount ?? 0
    );
    const taxPlan = await buildSaleItemizedTaxPlan({
      supabase: params.supabase,
      orgId: params.orgId,
      lines: buildConfirmSaleTaxableLines(
        stableItems as ConfirmSaleItemInput[]
      ),
      fallbackTaxes,
      globalDiscountAmount,
    });
    const totalAmount = truncateMoney(
      Math.max(
        0,
        (params.totals?.subTotalAmount ?? 0) -
          globalDiscountAmount +
          taxPlan.totalTaxAmount
      )
    );

    await replaceSalesOrderTaxSnapshots({
      supabase: params.supabase,
      orgId: params.orgId,
      saleOrderId: params.saleId,
      taxPlan,
    });

    const { data: itemizedSale, error: itemizedSaleError } =
      await params.supabase
        .from("sales_orders")
        .update({
          sub_total: params.totals?.subTotalAmount ?? 0,
          total_tax_amount: taxPlan.aggregateTaxes.length
            ? taxPlan.totalTaxAmount
            : null,
          global_discount_amount: globalDiscountAmount,
          total_amount: totalAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.saleId)
        .eq("organization_id", params.orgId)
        .select("*")
        .single();

    if (itemizedSaleError || !itemizedSale) {
      throw new Error(
        `Error actualizando los totales itemizados de la venta: ${itemizedSaleError?.message || "Not found"}`
      );
    }

    // The RPC does not handle remittance_number — update it separately if provided
    if (params.input.remittanceNumber !== undefined) {
      const { error: remittanceError } = await params.supabase
        .from("sales_orders")
        .update({ remittance_number: params.input.remittanceNumber })
        .eq("id", params.saleId)
        .eq("organization_id", params.orgId);

      if (remittanceError) {
        throw new Error(
          `Error actualizando el N° de remito: ${remittanceError.message}`
        );
      }
    }

    return itemizedSale as SalesOrder;
  }

  const { data, error: updateError } = await params.supabase
    .from("sales_orders")
    .update(params.updateData)
    .eq("id", params.saleId)
    .eq("organization_id", params.orgId)
    .select("*")
    .single();

  if (updateError || !data) {
    throw new Error(
      `Error actualizando la venta: ${updateError?.message || "Not found"}`
    );
  }

  return data as SalesOrder;
}

type ReceivableUpdateContext = {
  totalAmount: number;
  dueDate: string | null;
  customerId: string | null;
};

function resolveReceivableUpdateContext(params: {
  input: UpdateSaleOrderInput;
  updatedSale: SalesOrder;
}): ReceivableUpdateContext {
  const totalAmount = truncateMoney(
    Number(params.updatedSale.total_amount ?? 0) || 0
  );
  const creditDays =
    params.input.creditDays ?? params.updatedSale.credit_days ?? null;
  const dueDate = computeReceivableDueDateFromDispatch(
    params.updatedSale.dispatched_at,
    creditDays
  );
  const customerId =
    params.input.customerId ??
    (params.updatedSale.customer_id as string | null) ??
    null;

  return { totalAmount, dueDate, customerId };
}

function resolveReceivableStatus(
  totalAmount: number,
  nextPending: number
): ReceivableStatus {
  if (nextPending <= 0) {
    return "PAID";
  }

  if (nextPending < totalAmount) {
    return "PARTIALLY_PAID";
  }

  return "PENDING";
}

async function fetchReceivableRecord(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
}): Promise<{
  id: string;
  total_amount: number | null;
  pending_balance: number | null;
  paid_amount: number | null;
} | null> {
  const { data } = await params.supabase
    .from("accounts_receivable")
    .select("id, total_amount, pending_balance, status")
    .eq("sales_order_id", params.saleId)
    .eq("organization_id", params.orgId)
    .maybeSingle();

  if (!data?.id) {
    return null;
  }

  const { data: payments } = await params.supabase
    .from("receivable_payments")
    .select("amount")
    .eq("account_receivable_id", data.id)
    .eq("organization_id", params.orgId);

  const paidAmount =
    payments && payments.length > 0
      ? truncateMoney(
          payments.reduce(
            (total, payment) =>
              truncateMoney(total + Number(payment.amount ?? 0)),
            0
          )
        )
      : null;

  return {
    id: data.id,
    total_amount:
      data.total_amount !== null && data.total_amount !== undefined
        ? truncateMoney(Number(data.total_amount))
        : null,
    pending_balance:
      data.pending_balance !== null && data.pending_balance !== undefined
        ? truncateMoney(Number(data.pending_balance))
        : null,
    paid_amount: paidAmount,
  };
}

async function createCustomerCreditFromSaleOverpayment(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  customerId: string;
  amount: number;
}): Promise<void> {
  const creditAmount = truncateMoney(Math.max(0, params.amount));
  if (creditAmount <= 0) {
    return;
  }

  let creditSupplierId: string | null = null;
  if (params.saleId) {
    creditSupplierId = await deriveSaleCreditSupplier(
      params.supabase,
      params.saleId
    );
  }

  const { error } = await params.supabase.from("customer_credits").insert({
    organization_id: params.orgId,
    customer_id: params.customerId,
    supplier_id: creditSupplierId,
    amount: creditAmount,
    remaining_amount: creditAmount,
    source_payment_id: null,
    notes: `Saldo a favor generado por devolución/edición de venta ${params.saleId}`,
  });

  if (error) {
    throw new Error(
      `No se pudo registrar el saldo a favor del cliente: ${error.message}`
    );
  }
}

async function updateExistingReceivable(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  receivable: {
    id: string;
    total_amount: number | null;
    pending_balance: number | null;
    paid_amount: number | null;
  };
  context: ReceivableUpdateContext;
}): Promise<void> {
  if (!params.context.dueDate) {
    return;
  }

  const previousTotal = truncateMoney(
    Number(params.receivable.total_amount ?? 0)
  );
  const previousPending = truncateMoney(
    Number(params.receivable.pending_balance ?? 0)
  );
  const paidAmount = truncateMoney(
    params.receivable.paid_amount !== null
      ? Math.max(0, params.receivable.paid_amount)
      : Math.max(0, previousTotal - previousPending)
  );
  const overpaidAmount = truncateMoney(
    Math.max(0, paidAmount - params.context.totalAmount)
  );
  const nextPending = truncateMoney(
    Math.max(0, params.context.totalAmount - paidAmount)
  );
  const nextStatus = resolveReceivableStatus(
    params.context.totalAmount,
    nextPending
  );

  const updatePayload: Database["public"]["Tables"]["accounts_receivable"]["Update"] =
    {
      total_amount: truncateMoney(params.context.totalAmount),
      pending_balance: truncateMoney(nextPending),
      due_date: params.context.dueDate,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

  if (params.context.customerId) {
    updatePayload.customer_id = params.context.customerId;
  }

  const { error } = await params.supabase
    .from("accounts_receivable")
    .update(updatePayload)
    .eq("id", params.receivable.id);

  if (error) {
    throw new Error(
      `No se pudo actualizar la cuenta por cobrar: ${error.message}`
    );
  }

  if (overpaidAmount > 0) {
    if (!params.context.customerId) {
      throw new Error(
        "No se pudo generar saldo a favor porque la venta no tiene cliente asociado"
      );
    }

    await createCustomerCreditFromSaleOverpayment({
      supabase: params.supabase,
      orgId: params.orgId,
      saleId: params.saleId,
      customerId: params.context.customerId,
      amount: overpaidAmount,
    });
  }
}

async function insertReceivableIfNeeded(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  context: ReceivableUpdateContext;
}): Promise<void> {
  if (!(params.context.customerId && params.context.dueDate)) {
    return;
  }

  const { error } = await params.supabase.from("accounts_receivable").insert({
    organization_id: params.orgId,
    customer_id: params.context.customerId,
    sales_order_id: params.saleId,
    total_amount: truncateMoney(params.context.totalAmount),
    pending_balance: truncateMoney(params.context.totalAmount),
    due_date: params.context.dueDate,
    status:
      "PENDING" satisfies Database["public"]["Enums"]["receivable_status"],
  });

  if (error) {
    throw new Error(`No se pudo crear la cuenta por cobrar: ${error.message}`);
  }
}

async function updateReceivableForDispatchedSale(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  customerId: string | null;
  totalAmount: number;
  creditDays: number | null;
  dispatchedAt: string;
}): Promise<void> {
  const dueDate = computeReceivableDueDateFromDispatch(
    params.dispatchedAt,
    params.creditDays
  );
  const context: ReceivableUpdateContext = {
    totalAmount: truncateMoney(params.totalAmount),
    dueDate,
    customerId: params.customerId,
  };
  const receivable = await fetchReceivableRecord({
    supabase: params.supabase,
    orgId: params.orgId,
    saleId: params.saleId,
  });

  if (receivable) {
    await updateExistingReceivable({
      supabase: params.supabase,
      orgId: params.orgId,
      saleId: params.saleId,
      receivable,
      context,
    });
    return;
  }

  await insertReceivableIfNeeded({
    supabase: params.supabase,
    orgId: params.orgId,
    saleId: params.saleId,
    context,
  });
}

async function updateReceivableForSaleUpdate(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  saleId: string;
  input: UpdateSaleOrderInput;
  updatedSale: SalesOrder;
}): Promise<void> {
  const context = resolveReceivableUpdateContext({
    input: params.input,
    updatedSale: params.updatedSale,
  });
  const receivable = await fetchReceivableRecord({
    supabase: params.supabase,
    orgId: params.orgId,
    saleId: params.saleId,
  });

  if (receivable) {
    await updateExistingReceivable({
      supabase: params.supabase,
      orgId: params.orgId,
      saleId: params.saleId,
      receivable,
      context,
    });
    return;
  }

  await insertReceivableIfNeeded({
    supabase: params.supabase,
    orgId: params.orgId,
    saleId: params.saleId,
    context,
  });
}

async function rollbackSaleUpdateStock(params: {
  supabase: SupabaseServerClient;
  orgId: string;
  state: SaleStockUpdateState;
}): Promise<void> {
  if (params.state.stockNeedsRollback && params.state.stockContext) {
    await rollbackStockAdjustments(
      params.supabase,
      params.orgId,
      params.state.stockContext,
      params.state.appliedMovementIds
    );
  }

  if (params.state.stockWasRestocked && params.state.previousMovementReason) {
    try {
      const rollbackContext = await buildStockAdjustmentContext({
        supabase: params.supabase,
        orgId: params.orgId,
        items: params.state.previousStockItems ?? [],
        movementReason: params.state.previousMovementReason,
      });
      await applyStockAdjustments(params.supabase, rollbackContext);
    } catch (rollbackError) {
      console.error(
        "No se pudo restaurar el stock anterior tras fallar la actualización",
        rollbackError
      );
    }
  }
}

/**
 * Regenerates the sale-level remittance PDF of a standalone sale so it
 * reflects the current sale data. The file is overwritten in-place (same
 * storage path), so the URL stays valid and no orphan files are left behind.
 *
 * Only regenerates when a remittance already exists (never auto-creates one).
 * Best-effort: on failure the URL is nulled (falling back to the manual
 * "Generar remito" flow) and the caller is never failed.
 */
async function regenerateSaleLevelRemito(params: {
  supabase: SupabaseServerClient;
  orgSlug: string;
  orgId: string;
  saleId: string;
}): Promise<void> {
  const { supabase, orgSlug, orgId, saleId } = params;

  try {
    const sale = await getSalesOrderById(orgSlug, saleId);

    if (!sale?.remittance_pdf_url) {
      return;
    }

    const type = sale.status === "DRAFT" ? "PRESUPUESTO" : "REMITO_FINAL";
    const [organization, orgSettingsResult] = await Promise.all([
      getOrganizationBySlug(orgSlug),
      getOrganizationSettings(orgSlug),
    ]);

    const doc = await renderRemittancePdfDocument({
      sale,
      type,
      issuer: {
        businessName: organization?.name,
        cuit: organization?.cuit,
      },
      singlePageDuplicate:
        orgSettingsResult.success && orgSettingsResult.data
          ? orgSettingsResult.data.remittance_single_page_duplicate
          : false,
    });

    const uploadResult = await uploadSalesDocument({
      orgSlug,
      saleId,
      type: "remittos",
      filename: doc.filename,
      content: doc.content,
    });

    await supabase
      .from("sales_orders")
      .update(
        uploadResult.success
          ? { remittance_pdf_url: uploadResult.url }
          : { remittance_pdf_url: null }
      )
      .eq("id", saleId)
      .eq("organization_id", orgId);

    if (!uploadResult.success) {
      console.error(
        `No se pudo regenerar el remito de la venta ${saleId}: ${uploadResult.error}`
      );
    }
  } catch (error) {
    console.error(
      `No se pudo regenerar el remito de la venta ${saleId}`,
      error
    );
    await supabase
      .from("sales_orders")
      .update({ remittance_pdf_url: null })
      .eq("id", saleId)
      .eq("organization_id", orgId);
  }
}

export async function updateSaleOrder(
  input: UpdateSaleOrderInput
): Promise<SalesOrder> {
  const { orgSlug, saleId } = input;

  if (!saleId) {
    throw new Error("El ID de la venta es requerido");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await resolveSalesAccessContext(supabase, orgSlug);

  const existingSale = await validateSaleForUpdate(supabase, org.id, saleId);
  assertCanManageSale(accessContext, existingSale.userId);
  assertNoAuthorizedSaleFiscalChanges(existingSale, input);

  if (input.sellerId !== undefined) {
    assertCanAssignSeller(accessContext, input.sellerId);
  }

  const isStockedSale = isStockedSaleStatus(existingSale.status);

  const { updateData, items, shouldUpdateItems, totals } =
    buildSaleUpdateContext(input);
  resetPendingArcaState(updateData, existingSale, input);

  const stockState = await updateSaleStockIfNeeded({
    supabase,
    orgId: org.id,
    saleId,
    input,
    existingSale,
    items,
    shouldUpdateItems,
    isStockedSale,
  });

  let updatedSale: SalesOrder | null = null;
  try {
    updatedSale = await persistSaleUpdate({
      supabase,
      orgId: org.id,
      saleId,
      updateData,
      input,
      items,
      shouldUpdateItems,
      totals,
    });

    if (isStockedSale) {
      await updateReceivableForSaleUpdate({
        supabase,
        orgId: org.id,
        saleId,
        input,
        updatedSale,
      });
    }
  } catch (error) {
    await rollbackSaleUpdateStock({
      supabase,
      orgId: org.id,
      state: stockState,
    });

    throw error;
  }

  if (!updatedSale) {
    throw new Error("No se pudo actualizar la venta");
  }

  if (shouldUpdateItems) {
    try {
      await regenerateChildOrderRemitos({ supabase, orgSlug, saleId });
      await regenerateSaleLevelRemito({
        supabase,
        orgSlug,
        orgId: org.id,
        saleId,
      });
    } catch (regenError) {
      console.error(
        "No se pudieron regenerar los remitos de la venta",
        regenError
      );
    }
    await syncSaleOrderTaxSnapshots({
      supabase,
      orgId: org.id,
      saleId,
    });
  }

  return updatedSale;
}
