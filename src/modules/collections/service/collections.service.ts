import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationMembersWithUsersAdmin } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isPosCashPaymentMethod } from "@/modules/pos/utils/payment-method";
import type { Database } from "@/types/supabase";
import type {
  BulkPaymentDistribution,
  BulkPaymentInput,
  BulkPaymentResult,
  CollectionAccountStatus,
  CollectionExportItem,
  CreditBreakdownEntry,
  CustomerCredit,
  DirectSalesCollectionsMetrics,
  PaginatedResult,
  PayableAccount,
  PayablesMetrics,
  PayablesPaginatedParams,
  ReceivableAccount,
  ReceivablesMetrics,
  ReceivablesPaginatedParams,
} from "../types";

type ReceivableRow = Database["public"]["Tables"]["accounts_receivable"]["Row"];

type ReceivableWithRelations = ReceivableRow & {
  customer:
    | {
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        city?: string | null;
      }
    | Array<{
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
        city?: string | null;
      }>
    | null;
  sale:
    | {
        status?: Database["public"]["Enums"]["order_status"] | null;
        user_id?: string | null;
        supplier_id?: string | null;
        invoice_number?: string | null;
        sale_date?: string | null;
        dispatched_at?: string | null;
        sale_number?: number | null;
        sub_total?: number | null;
        global_discount_amount?: number | null;
        remittance_number?: string | null;
        items?: SaleItemRaw[] | null;
      }
    | Array<{
        status?: Database["public"]["Enums"]["order_status"] | null;
        user_id?: string | null;
        supplier_id?: string | null;
        invoice_number?: string | null;
        sale_date?: string | null;
        dispatched_at?: string | null;
        sale_number?: number | null;
        sub_total?: number | null;
        global_discount_amount?: number | null;
        remittance_number?: string | null;
        items?: SaleItemRaw[] | null;
      }>
    | null;
};

type CollectionsScope = "all" | "own";

type CollectionsAccessContext = {
  scope: CollectionsScope;
  userId: string | null;
};

type CollectionsQueryOptions = {
  accessContext?: CollectionsAccessContext;
};

type ProductWithSupplierRaw = {
  id?: string | null;
  name?: string | null;
  unit_of_measure?: Database["public"]["Enums"]["unit_of_measure_type"] | null;
  supplier_id?: string | null;
  supplier?:
    | {
        id?: string | null;
        name?: string | null;
      }
    | {
        id?: string | null;
        name?: string | null;
      }[]
    | null;
};

type SaleItemRaw = {
  quantity?: number | null;
  unit_quantity?: number | null;
  subtotal?: number | null;
  discount_amount?: number | null;
  discount_percentage?: number | null;
  product_id?: string | null;
  product?: ProductWithSupplierRaw | ProductWithSupplierRaw[] | null;
};

type PayableRow = {
  id: string;
  organization_id: string;
  supplier_id: string;
  purchase_order_id: string;
  total_amount: number;
  pending_balance: number;
  due_date: string;
  status?: string | null;
  created_at?: string | null;
};

type PayableWithRelations = PayableRow & {
  supplier:
    | {
        id?: string | null;
        name?: string | null;
      }
    | Array<{
        id?: string | null;
        name?: string | null;
      }>
    | null;
  purchase:
    | {
        purchase_number?: number | null;
        purchase_date?: string | null;
        total_amount?: number | null;
        items?: PurchaseItemRaw[] | null;
      }
    | Array<{
        purchase_number?: number | null;
        purchase_date?: string | null;
        total_amount?: number | null;
        items?: PurchaseItemRaw[] | null;
      }>
    | null;
};

type PurchaseItemRaw = {
  quantity?: number | null;
  unit_quantity?: number | null;
  subtotal?: number | null;
  discount_amount?: number | null;
  discount_precentage?: number | null;
  product_id?: string | null;
  product?: ProductWithSupplierRaw | ProductWithSupplierRaw[] | null;
};
type PayablePaymentRow = {
  account_payable_id: string;
  payment_date: string;
};

const deriveStatus = (
  totalAmount: number,
  pendingBalance: number
): CollectionAccountStatus => {
  if (pendingBalance <= 0) {
    return "PAID";
  }

  if (pendingBalance < totalAmount) {
    return "PARTIAL";
  }

  return "PENDING";
};

const BUENOS_AIRES_TIMEZONE = "America/Argentina/Buenos_Aires";

function getCurrentMonthRangeBuenosAires(): {
  startDate: string;
  endDate: string;
} | null {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUENOS_AIRES_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (!(Number.isFinite(year) && Number.isFinite(month))) {
    return null;
  }

  const monthStr = String(month).padStart(2, "0");
  const startDate = `${year}-${monthStr}-01`;
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${monthStr}-${String(endDay).padStart(2, "0")}`;

  return { startDate, endDate };
}

function canReadCollectionsMetrics(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("collections.manage") ||
    permissions.includes("collections.read.all") ||
    permissions.includes("collections.read")
  );
}

function canViewAllCollections(permissions: string[]): boolean {
  return (
    permissions.includes("organization.admin") ||
    permissions.includes("collections.manage") ||
    permissions.includes("collections.read.all")
  );
}

async function resolveCollectionsAccessContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgSlug: string
): Promise<CollectionsAccessContext> {
  const [{ data: authData }, permissionsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_user_org_permissions_by_slug", {
      target_org_slug: orgSlug,
    }),
  ]);

  if (permissionsResult.error) {
    console.warn(
      `No se pudieron obtener permisos para cobranzas (fallback a scope propio): ${permissionsResult.error.message}`
    );
  }

  const permissions = permissionsResult.error
    ? []
    : ((permissionsResult.data ?? []) as string[]);

  return {
    scope: canViewAllCollections(permissions) ? "all" : "own",
    userId: authData.user?.id ?? null,
  };
}

function getSaleUserId(sale: ReceivableWithRelations["sale"]): string | null {
  const rawSale = Array.isArray(sale) ? sale[0] : sale;
  if (!rawSale) {
    return null;
  }

  return typeof rawSale.user_id === "string" ? rawSale.user_id : null;
}

function canAccessReceivable(
  receivable: ReceivableWithRelations,
  accessContext: CollectionsAccessContext
): boolean {
  if (accessContext.scope === "all") {
    return true;
  }

  if (!accessContext.userId) {
    return false;
  }

  return getSaleUserId(receivable.sale) === accessContext.userId;
}

async function fetchLastPayablePaymentDates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payableIds: string[]
): Promise<Map<string, string | null>> {
  const lastPaymentDatesMap = new Map<string, string | null>();

  if (payableIds.length === 0) {
    return lastPaymentDatesMap;
  }

  const { data: paymentsData } = await supabase
    .from("payable_payments" as never)
    .select("account_payable_id, payment_date")
    .in("account_payable_id", payableIds)
    .order("payment_date", { ascending: false });

  const payments = paymentsData as PayablePaymentRow[] | null;

  for (const payment of payments ?? []) {
    const payableId = payment.account_payable_id;
    if (!lastPaymentDatesMap.has(payableId)) {
      lastPaymentDatesMap.set(payableId, payment.payment_date);
    }
  }

  return lastPaymentDatesMap;
}

function getPayableDiscrepancy(params: {
  total: number;
  pending: number;
  purchaseTotal: number | null;
}): { hasDiscrepancy: boolean; discrepancyAmount?: number } {
  const { total, pending, purchaseTotal } = params;

  if (purchaseTotal === null || purchaseTotal <= 0 || pending <= 0) {
    return { hasDiscrepancy: false };
  }

  const discrepancyAmount = truncateMoney(Math.abs(total - purchaseTotal));
  const discrepancyPercent = (discrepancyAmount / purchaseTotal) * 100;

  if (discrepancyPercent <= 1) {
    return { hasDiscrepancy: false };
  }

  return {
    hasDiscrepancy: true,
    discrepancyAmount,
  };
}

function mapPayableAccount(
  row: PayableWithRelations,
  lastPaymentDatesMap: Map<string, string | null>
): PayableAccount {
  const total = truncateMoney(Number(row.total_amount ?? 0));
  const pending = truncateMoney(Math.max(0, Number(row.pending_balance ?? 0)));
  const status = deriveStatus(total, pending);
  const lastPaymentDate = row.id
    ? (lastPaymentDatesMap.get(row.id) ?? null)
    : null;

  const purchase = normalizePurchase(row);
  const purchaseTotal = purchase?.total_amount
    ? truncateMoney(Number(purchase.total_amount))
    : null;
  const discrepancy = getPayableDiscrepancy({
    total,
    pending,
    purchaseTotal,
  });

  return {
    id: row.id,
    organization_id: row.organization_id,
    supplier_id: row.supplier_id,
    purchase_order_id: row.purchase_order_id,
    total_amount: total,
    pending_balance: pending,
    due_date: row.due_date,
    status,
    created_at: row.created_at,
    last_payment_date: lastPaymentDate,
    supplier: normalizeSupplier(row),
    purchase,
    items: normalizePurchaseItems(row),
    type: "payable",
    hasDiscrepancy: discrepancy.hasDiscrepancy,
    discrepancyAmount: discrepancy.discrepancyAmount,
  };
}

function normalizeCustomer(
  receivable: ReceivableWithRelations
): ReceivableAccount["customer"] {
  const rawCustomer = Array.isArray(receivable.customer)
    ? receivable.customer[0]
    : receivable.customer;

  if (rawCustomer && typeof rawCustomer === "object" && "id" in rawCustomer) {
    return {
      id: (rawCustomer.id as string) ?? receivable.customer_id,
      business_name:
        (rawCustomer.business_name as string | null) ?? "Cliente desconocido",
      fantasy_name: (rawCustomer.fantasy_name as string | null) ?? null,
      city: (rawCustomer.city as string | null) ?? null,
    };
  }

  return {
    id: receivable.customer_id,
    business_name: "Cliente desconocido",
    fantasy_name: null,
  };
}

function hasSaleData(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  return (
    "invoice_number" in raw ||
    "sale_date" in raw ||
    "dispatched_at" in raw ||
    "sale_number" in raw
  );
}

function normalizeSaleInfo(
  receivable: ReceivableWithRelations
): ReceivableAccount["sale"] {
  const rawSale = Array.isArray(receivable.sale)
    ? receivable.sale[0]
    : receivable.sale;

  if (!hasSaleData(rawSale)) {
    return null;
  }

  return {
    invoice_number: (rawSale.invoice_number as string | null) ?? null,
    sale_date: (rawSale.sale_date as string | null) ?? null,
    dispatched_at: (rawSale.dispatched_at as string | null) ?? null,
    sale_number: normalizeOptionalNumber(
      rawSale.sale_number as number | null | undefined
    ),
    sub_total: normalizeOptionalMoney(
      rawSale.sub_total as number | null | undefined
    ),
    global_discount_amount: normalizeOptionalMoney(
      rawSale.global_discount_amount as number | null | undefined
    ),
    remittance_number: (rawSale.remittance_number as string | null) ?? null,
  };
}

function isCancelledSale(sale: ReceivableWithRelations["sale"]): boolean {
  const rawSale = Array.isArray(sale) ? sale[0] : sale;
  return rawSale?.status === "CANCELLED";
}

function normalizeSupplierNameFromProduct(
  product: ProductWithSupplierRaw | ProductWithSupplierRaw[] | null | undefined
): string | null {
  const normalizedProduct = Array.isArray(product) ? product[0] : product;

  if (!normalizedProduct) {
    return null;
  }

  const rawSupplier = Array.isArray(normalizedProduct.supplier)
    ? normalizedProduct.supplier[0]
    : normalizedProduct.supplier;

  if (rawSupplier && typeof rawSupplier === "object" && "name" in rawSupplier) {
    return (rawSupplier.name as string | null) ?? null;
  }

  return null;
}

function normalizeOptionalNumber(
  value: number | null | undefined
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return Number(value);
}

function normalizeOptionalMoney(
  value: number | null | undefined
): number | null {
  const normalizedValue = normalizeOptionalNumber(value);

  if (normalizedValue === null) {
    return null;
  }

  return truncateMoney(normalizedValue);
}

function normalizeOptionalNonNegativeMoney(
  value: number | null | undefined
): number | null {
  const normalizedValue = normalizeOptionalNumber(value);

  if (normalizedValue === null) {
    return null;
  }

  return truncateMoney(Math.max(0, normalizedValue));
}

function deriveDiscountPercentage(
  item: SaleItemRaw | PurchaseItemRaw
): number | null {
  let rawDiscountPercentage: number | null | undefined = null;

  if ("discount_percentage" in item) {
    rawDiscountPercentage = item.discount_percentage;
  } else if ("discount_precentage" in item) {
    rawDiscountPercentage = item.discount_precentage;
  }

  return normalizeOptionalNumber(rawDiscountPercentage);
}

function deriveSubtotalCrudo(
  subtotal: number | null,
  discountAmount: number | null,
  discountPercentage: number | null
): number | null {
  if (subtotal === null) {
    return null;
  }

  if (discountAmount !== null && Number.isFinite(discountAmount)) {
    return truncateMoney(subtotal + discountAmount);
  }

  const hasValidDiscountPercentage =
    discountPercentage !== null &&
    Number.isFinite(discountPercentage) &&
    discountPercentage > 0 &&
    discountPercentage < 100;

  if (hasValidDiscountPercentage) {
    return truncateMoney(subtotal / (1 - discountPercentage / 100));
  }

  return subtotal;
}

function deriveItemQuantities(item: SaleItemRaw | PurchaseItemRaw): {
  units: number | null;
  kilograms: number | null;
  subtotal: number | null;
  subtotalCrudo: number | null;
} {
  const product = Array.isArray(item.product) ? item.product[0] : item.product;
  const unitOfMeasure = product?.unit_of_measure ?? "UN";
  const units = normalizeOptionalNumber(item.quantity);
  const kilograms = normalizeOptionalNumber(item.unit_quantity);
  const subtotal = normalizeOptionalMoney(item.subtotal);
  const discountAmount = normalizeOptionalNonNegativeMoney(
    item.discount_amount
  );
  const discountPercentage = deriveDiscountPercentage(item);
  const subtotalCrudo = deriveSubtotalCrudo(
    subtotal,
    discountAmount,
    discountPercentage
  );

  if (unitOfMeasure === "UN") {
    return {
      units,
      kilograms: null,
      subtotal,
      subtotalCrudo,
    };
  }

  return {
    units,
    kilograms,
    subtotal,
    subtotalCrudo,
  };
}

function mapItemToCollectionItem(
  item: SaleItemRaw | PurchaseItemRaw
): CollectionExportItem {
  const product = Array.isArray(item.product) ? item.product[0] : item.product;
  const quantities = deriveItemQuantities(item);
  return {
    productId:
      (item.product_id as string | null) ??
      (product?.id as string | null) ??
      null,
    productName: (product?.name as string | null) ?? null,
    supplierName: normalizeSupplierNameFromProduct(product ?? null),
    supplierId: (product?.supplier_id as string | null) ?? null,
    units: quantities.units,
    kilograms: quantities.kilograms,
    subtotal: quantities.subtotal,
    subtotalCrudo: quantities.subtotalCrudo,
  };
}

function normalizeSaleItems(
  receivable: ReceivableWithRelations
): ReceivableAccount["items"] {
  const rawSale = Array.isArray(receivable.sale)
    ? receivable.sale[0]
    : receivable.sale;
  const rawItems =
    rawSale && typeof rawSale === "object" && "items" in rawSale
      ? (rawSale.items as SaleItemRaw[] | null)
      : null;

  if (!rawItems?.length) {
    return [];
  }

  return rawItems.map((item) => mapItemToCollectionItem(item));
}

function normalizeSupplier(
  payable: PayableWithRelations
): PayableAccount["supplier"] {
  const rawSupplier = Array.isArray(payable.supplier)
    ? payable.supplier[0]
    : payable.supplier;

  const supplierId =
    (rawSupplier?.id as string | undefined) ?? payable.supplier_id ?? "";

  if (
    rawSupplier &&
    typeof rawSupplier === "object" &&
    "name" in rawSupplier &&
    rawSupplier.name
  ) {
    return {
      id: supplierId,
      name: rawSupplier.name as string,
    };
  }

  return {
    id: supplierId,
    name: "Sin asignar",
  };
}

function normalizePurchaseItems(
  payable: PayableWithRelations
): PayableAccount["items"] {
  const rawPurchase = Array.isArray(payable.purchase)
    ? payable.purchase[0]
    : payable.purchase;
  const rawItems =
    rawPurchase && typeof rawPurchase === "object" && "items" in rawPurchase
      ? (rawPurchase.items as PurchaseItemRaw[] | null)
      : null;

  if (!rawItems?.length) {
    return [];
  }

  return rawItems.map((item) => mapItemToCollectionItem(item));
}

function normalizePurchase(
  payable: PayableWithRelations
): PayableAccount["purchase"] {
  const rawPurchase = Array.isArray(payable.purchase)
    ? payable.purchase[0]
    : payable.purchase;

  if (
    rawPurchase &&
    typeof rawPurchase === "object" &&
    ("purchase_number" in rawPurchase || "purchase_date" in rawPurchase)
  ) {
    return {
      purchase_number: (rawPurchase.purchase_number as number | null) ?? null,
      purchase_date: (rawPurchase.purchase_date as string | null) ?? null,
      total_amount:
        rawPurchase.total_amount !== undefined &&
        rawPurchase.total_amount !== null
          ? truncateMoney(Number(rawPurchase.total_amount))
          : null,
    };
  }

  return null;
}

type SellerInfo = { id: string; name?: string | null; email?: string | null };

async function buildSellersByUserId(
  orgSlug: string,
  accessContext: CollectionsAccessContext
): Promise<Map<string, SellerInfo>> {
  const map = new Map<string, SellerInfo>();
  if (accessContext.scope !== "all") {
    return map;
  }
  try {
    const members = await getOrganizationMembersWithUsersAdmin(orgSlug);
    for (const member of members) {
      if (!member.user_id) {
        continue;
      }
      map.set(member.user_id, {
        id: member.user_id,
        name: member.user?.name,
        email: member.user?.email,
      });
    }
  } catch {
    // Non-critical: seller names won't be available
  }
  return map;
}

async function fetchHistoricalSupplierMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  receivables: ReceivableWithRelations[]
): Promise<Map<string, { id: string; name: string }>> {
  const ids = new Set<string>();

  for (const row of receivables) {
    const rawSale = Array.isArray(row.sale) ? row.sale[0] : row.sale;
    if (rawSale?.supplier_id) {
      ids.add(rawSale.supplier_id);
    }
    const rawItems = rawSale?.items as SaleItemRaw[] | null | undefined;
    if (rawItems?.length) {
      for (const sid of uniqueSupplierIdsFromItems(rawItems)) {
        ids.add(sid);
      }
    }
  }

  const supplierIds = [...ids];
  const supplierMap = new Map<string, { id: string; name: string }>();
  if (supplierIds.length > 0) {
    const { data: supplierData } = await supabase
      .from("suppliers")
      .select("id, name")
      .in("id", supplierIds);
    for (const s of supplierData ?? []) {
      supplierMap.set(s.id, s);
    }
  }
  return supplierMap;
}

type SaleItemWithSaleId = SaleItemRaw & { sales_order_id: string };

type ItemsEnrichmentData = {
  itemsBySaleId: Map<string, SaleItemWithSaleId[]>;
  supplierMap: Map<string, { id: string; name: string }>;
};

function buildItemsEnrichmentData(itemsData: unknown[]): ItemsEnrichmentData {
  const supplierMap = new Map<string, { id: string; name: string }>();
  const itemsBySaleId = new Map<string, SaleItemWithSaleId[]>();

  for (const raw of itemsData as SaleItemWithSaleId[]) {
    const sid = raw.sales_order_id;
    const group = itemsBySaleId.get(sid);
    if (group) {
      group.push(raw);
    } else {
      itemsBySaleId.set(sid, [raw]);
    }

    const product = Array.isArray(raw.product) ? raw.product[0] : raw.product;
    if (product?.supplier_id) {
      const rawSupplier = Array.isArray(product.supplier)
        ? product.supplier[0]
        : product.supplier;
      if (rawSupplier?.id && !supplierMap.has(rawSupplier.id)) {
        supplierMap.set(rawSupplier.id, {
          id: rawSupplier.id,
          name: (rawSupplier.name as string) || "Proveedor",
        });
      }
    }
  }

  return { itemsBySaleId, supplierMap };
}

function uniqueSupplierIdsFromItems(items: SaleItemRaw[]): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    const product = Array.isArray(item.product)
      ? item.product[0]
      : item.product;
    if (product?.supplier_id) {
      ids.add(product.supplier_id);
    }
  }
  return [...ids];
}

function deriveSingleSupplierFromItems(
  items: SaleItemRaw[],
  supplierMap: Map<string, { id: string; name: string }>
): { id: string; name: string } | null {
  const supplierIds = uniqueSupplierIdsFromItems(items);
  if (supplierIds.length !== 1) {
    return null;
  }
  const derivedId = supplierIds[0];
  return supplierMap.get(derivedId) ?? { id: derivedId, name: "Proveedor" };
}

function applyItemEnrichment(
  receivable: ReceivableAccount,
  rawItems: SaleItemRaw[],
  supplierMap: Map<string, { id: string; name: string }>
): void {
  if (rawItems.length > 0) {
    receivable.items = rawItems.map((item) => mapItemToCollectionItem(item));
  }

  if (!receivable.supplier) {
    receivable.supplier =
      deriveSingleSupplierFromItems(rawItems, supplierMap) ?? undefined;
  }
}

async function enrichReceivablesWithItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  receivables: ReceivableAccount[]
): Promise<void> {
  const salesOrderIds = [
    ...new Set(receivables.map((r) => r.sales_order_id).filter(Boolean)),
  ];

  if (salesOrderIds.length === 0) {
    return;
  }

  const CHUNK_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < salesOrderIds.length; i += CHUNK_SIZE) {
    chunks.push(salesOrderIds.slice(i, i + CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("sales_order_items")
        .select(
          `
      sales_order_id,
      quantity,
      unit_quantity,
      subtotal,
      discount_amount,
      discount_percentage,
      product_id,
      product:products(
        id,
        name,
        unit_of_measure,
        supplier_id,
        supplier:suppliers(id, name)
      )
    `
        )
        .in("sales_order_id", chunk)
    )
  );

  const itemsData = results.flatMap((r) => r.data ?? []);
  const firstError = results.find((r) => r.error);
  if (firstError?.error) {
    throw new Error(
      `Error obteniendo items de ventas: ${firstError.error.message}`
    );
  }

  if (!itemsData?.length) {
    return;
  }

  const { itemsBySaleId, supplierMap } = buildItemsEnrichmentData(itemsData);

  for (const receivable of receivables) {
    const rawItems = itemsBySaleId.get(receivable.sales_order_id) ?? [];
    applyItemEnrichment(receivable, rawItems, supplierMap);
  }
}

async function fetchLastReceivablePaymentDates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  receivableIds: string[]
): Promise<Map<string, string | null>> {
  const lastPaymentDatesMap = new Map<string, string | null>();
  if (receivableIds.length > 0) {
    const { data: paymentsData } = await supabase
      .from("receivable_payments")
      .select("account_receivable_id, payment_date")
      .in("account_receivable_id", receivableIds)
      .order("payment_date", { ascending: false });
    if (paymentsData) {
      for (const payment of paymentsData) {
        const receivableId = payment.account_receivable_id;
        if (!lastPaymentDatesMap.has(receivableId)) {
          lastPaymentDatesMap.set(receivableId, payment.payment_date);
        }
      }
    }
  }
  return lastPaymentDatesMap;
}

function deriveSupplierFromRawSale(
  rawSale: unknown,
  supplierMap: Map<string, { id: string; name: string }>
): { id: string; name: string } | null {
  const rawItems = (rawSale as Record<string, unknown> | null)?.items as
    | SaleItemRaw[]
    | null
    | undefined;

  if (!rawItems?.length) {
    return null;
  }

  return deriveSingleSupplierFromItems(rawItems, supplierMap);
}

function mapReceivableAccount(
  row: ReceivableWithRelations,
  lastPaymentDatesMap: Map<string, string | null>,
  supplierMap: Map<string, { id: string; name: string }>,
  sellersByUserId: Map<string, SellerInfo>
): ReceivableAccount {
  const total = truncateMoney(Number(row.total_amount ?? 0));
  const pending = truncateMoney(Math.max(0, Number(row.pending_balance ?? 0)));
  const status = deriveStatus(total, pending);
  const lastPaymentDate = row.id
    ? (lastPaymentDatesMap.get(row.id) ?? null)
    : null;
  const saleUserId = getSaleUserId(row.sale);
  const seller = saleUserId
    ? (sellersByUserId.get(saleUserId) ?? { id: saleUserId })
    : null;
  const rawSale = Array.isArray(row.sale) ? row.sale[0] : row.sale;
  let supplier = rawSale?.supplier_id
    ? (supplierMap.get(rawSale.supplier_id) ?? null)
    : null;

  if (!supplier) {
    supplier = deriveSupplierFromRawSale(rawSale, supplierMap);
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    sales_order_id: row.sales_order_id,
    total_amount: total,
    pending_balance: pending,
    due_date: row.due_date,
    status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_payment_date: lastPaymentDate,
    customer: normalizeCustomer(row),
    sale: normalizeSaleInfo(row),
    seller,
    supplier,
    items: normalizeSaleItems(row),
    type: "receivable",
  };
}

const RECEIVABLES_SELECT = `
  *,
  customer:customers(id, business_name, fantasy_name, city),
  sale:sales_orders(
    status,
    user_id,
    supplier_id,
    invoice_number,
    sale_date,
    dispatched_at,
    sale_number,
    sub_total,
    global_discount_amount,
    remittance_number
  )
`;

export async function getReceivablesByOrgSlug(
  orgSlug: string,
  options: CollectionsQueryOptions = {}
): Promise<ReceivableAccount[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext =
    options.accessContext ??
    (await resolveCollectionsAccessContext(supabase, orgSlug));

  const { data, error } = await supabase
    .from("accounts_receivable")
    .select(RECEIVABLES_SELECT)
    .eq("organization_id", org.id)
    .order("due_date", { ascending: true });

  if (error) {
    throw new Error(
      `Error obteniendo cuentas por cobrar: ${error.message ?? "desconocido"}`
    );
  }

  if (!data) {
    return [];
  }

  const validReceivables = (
    data as unknown as ReceivableWithRelations[]
  ).filter(
    (row) =>
      !isCancelledSale(row.sale) && canAccessReceivable(row, accessContext)
  );

  const [supplierMap, sellersByUserId] = await Promise.all([
    fetchHistoricalSupplierMap(supabase, validReceivables),
    buildSellersByUserId(orgSlug, accessContext),
  ]);

  const receivableIds = validReceivables
    .map((row) => row.id)
    .filter((id): id is string => id !== null && id !== undefined);

  const lastPaymentDatesMap = await fetchLastReceivablePaymentDates(
    supabase,
    receivableIds
  );

  const mapped = validReceivables.map((row) =>
    mapReceivableAccount(row, lastPaymentDatesMap, supplierMap, sellersByUserId)
  );

  await enrichReceivablesWithItems(supabase, mapped);

  return mapped;
}

type ReceivableExportRow = {
  receivable_id: string;
  sales_order_id: string;
  invoice_number: string | null;
  sale_number: number | null;
  sale_date: string | null;
  dispatched_at: string | null;
  customer_name: string;
  status: CollectionAccountStatus;
  total_amount: number;
  pending_balance: number;
  subtotal: number;
};

function calculateReceivableSubtotal(sale: ReceivableAccount["sale"]): number {
  const base = Number(sale?.sub_total ?? 0);
  const discount = Number(sale?.global_discount_amount ?? 0);
  const safeBase = Number.isFinite(base) ? base : 0;
  const safeDiscount = Number.isFinite(discount) ? discount : 0;

  return truncateMoney(safeBase - safeDiscount);
}

export async function exportReceivablesService(
  orgSlug: string
): Promise<ReceivableExportRow[]> {
  const receivables = await getReceivablesByOrgSlug(orgSlug);

  return receivables.map((receivable) => ({
    receivable_id: receivable.id,
    sales_order_id: receivable.sales_order_id,
    invoice_number: receivable.sale?.invoice_number ?? null,
    sale_number: receivable.sale?.sale_number ?? null,
    sale_date: receivable.sale?.sale_date ?? null,
    dispatched_at: receivable.sale?.dispatched_at ?? null,
    customer_name:
      receivable.customer.fantasy_name ||
      receivable.customer.business_name ||
      "Cliente desconocido",
    status: receivable.status,
    total_amount: truncateMoney(Number(receivable.total_amount ?? 0)),
    pending_balance: truncateMoney(Number(receivable.pending_balance ?? 0)),
    subtotal: calculateReceivableSubtotal(receivable.sale),
  }));
}

const PAYABLES_SELECT = `
  id,
  organization_id,
  supplier_id,
  purchase_order_id,
  total_amount,
  pending_balance,
  due_date,
  status,
  created_at,
  supplier:suppliers(id, name),
  purchase:purchase_orders(
    purchase_number,
    purchase_date,
    total_amount
  )
`;

export async function getPayablesByOrgSlug(
  orgSlug: string,
  options: CollectionsQueryOptions = {}
): Promise<PayableAccount[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext =
    options.accessContext ??
    (await resolveCollectionsAccessContext(supabase, orgSlug));

  // A scope "own" does not have a meaningful notion for payables, so we hide
  // this dataset unless the role can view all collections.
  if (accessContext.scope !== "all") {
    return [];
  }

  const { data, error } = await supabase
    .from("accounts_payable" as never)
    .select(PAYABLES_SELECT)
    .eq("organization_id", org.id)
    .order("due_date", { ascending: true });

  if (error) {
    throw new Error(
      `Error obteniendo cuentas por pagar: ${error.message ?? "desconocido"}`
    );
  }

  if (!data) {
    return [];
  }

  const payablesData = data as unknown as PayableWithRelations[];
  const payableIds = payablesData
    .map((row) => row.id)
    .filter((id): id is string => id !== null && id !== undefined);

  const lastPaymentDatesMap = await fetchLastPayablePaymentDates(
    supabase,
    payableIds
  );

  return payablesData.map((row) => mapPayableAccount(row, lastPaymentDatesMap));
}

export async function getCollectionsData(orgSlug: string) {
  const supabase = await createClient();
  const accessContext = await resolveCollectionsAccessContext(
    supabase,
    orgSlug
  );

  const [receivables, payables] = await Promise.all([
    getReceivablesByOrgSlug(orgSlug, { accessContext }),
    getPayablesByOrgSlug(orgSlug, { accessContext }),
  ]);

  return { receivables, payables };
}

type DirectSaleMetricsRow = {
  sale_date: string | null;
  total_amount: number | null;
  payments?: Array<{
    amount?: number | null;
    payment_method?: string | null;
  }> | null;
};

export async function getDirectSalesCollectionsMetrics(
  orgSlug: string
): Promise<DirectSalesCollectionsMetrics | null> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const { data: permissionsData, error: permissionsError } = await supabase.rpc(
    "get_user_org_permissions_by_slug",
    {
      target_org_slug: orgSlug,
    }
  );

  if (permissionsError) {
    console.warn(
      `No se pudieron obtener permisos para métricas de venta directa: ${permissionsError.message}`
    );
    return null;
  }

  const permissions = (permissionsData ?? []) as string[];

  if (!canReadCollectionsMetrics(permissions)) {
    return null;
  }

  const range = getCurrentMonthRangeBuenosAires();

  if (!range) {
    return {
      currentMonthSalesCount: 0,
      currentMonthTotalAmount: 0,
      currentMonthAverageTicket: 0,
      currentMonthCashAmount: 0,
    };
  }

  const { data, error } = await supabase
    .from("pos_sales")
    .select(
      `
        sale_date,
        total_amount,
        payments:pos_payments(amount, payment_method)
      `
    )
    .eq("organization_id", org.id)
    .order("sale_date", { ascending: false });

  if (error) {
    throw new Error(
      `No se pudieron obtener métricas de venta directa: ${error.message}`
    );
  }

  const monthlySales = ((data ?? []) as DirectSaleMetricsRow[]).filter(
    (sale) => {
      if (!sale.sale_date) {
        return false;
      }

      const saleDate = sale.sale_date.split("T")[0];
      return saleDate >= range.startDate && saleDate <= range.endDate;
    }
  );

  const currentMonthSalesCount = monthlySales.length;
  const currentMonthTotalAmount = truncateMoney(
    monthlySales.reduce((sum, sale) => sum + Number(sale.total_amount ?? 0), 0)
  );

  const currentMonthAverageTicket =
    currentMonthSalesCount > 0
      ? truncateMoney(currentMonthTotalAmount / currentMonthSalesCount)
      : 0;

  const currentMonthCashAmount = truncateMoney(
    monthlySales.reduce((sum, sale) => {
      const cashForSale = (sale.payments ?? [])
        .filter((payment) =>
          isPosCashPaymentMethod(String(payment.payment_method))
        )
        .reduce((saleSum, payment) => saleSum + Number(payment.amount ?? 0), 0);

      return sum + cashForSale;
    }, 0)
  );

  return {
    currentMonthSalesCount,
    currentMonthTotalAmount,
    currentMonthAverageTicket,
    currentMonthCashAmount,
  };
}

// Helper functions for processBulkPayment
function calculateDistributions(
  pendingAccounts: Array<{
    id: string;
    total_amount: number;
    pending_balance: number;
    due_date: string;
    sale?: {
      invoice_number?: string | null;
      remittance_number?: string | null;
      sale_number?: number | null;
    } | null;
  }>,
  totalAmount: number
) {
  let remainingAmount = truncateMoney(totalAmount);
  const distributions: BulkPaymentDistribution[] = [];
  const accountsToUpdate: Array<{
    id: string;
    newBalance: number;
    newStatus: CollectionAccountStatus;
  }> = [];
  const paymentsToInsert: Array<{
    account_receivable_id: string;
    amount: number;
  }> = [];

  for (const account of pendingAccounts) {
    if (remainingAmount <= 0) {
      break;
    }

    const pendingBalance = truncateMoney(Number(account.pending_balance ?? 0));
    const totalAccountAmount = truncateMoney(Number(account.total_amount ?? 0));
    const appliedAmount = truncateMoney(
      Math.min(remainingAmount, pendingBalance)
    );
    const newBalance = truncateMoney(
      Math.max(0, pendingBalance - appliedAmount)
    );
    const newStatus = deriveStatus(totalAccountAmount, newBalance);

    const sale = Array.isArray(account.sale) ? account.sale[0] : account.sale;

    distributions.push({
      accountId: account.id,
      invoiceNumber: sale?.invoice_number ?? null,
      remittanceNumber: sale?.remittance_number ?? null,
      saleNumber: sale?.sale_number ?? null,
      dueDate: account.due_date,
      totalAmount: totalAccountAmount,
      pendingBalance,
      appliedAmount,
      newBalance,
      newStatus,
    });

    accountsToUpdate.push({
      id: account.id,
      newBalance,
      newStatus,
    });

    paymentsToInsert.push({
      account_receivable_id: account.id,
      amount: appliedAmount,
    });

    remainingAmount = truncateMoney(remainingAmount - appliedAmount);
  }

  return {
    distributions,
    accountsToUpdate,
    paymentsToInsert,
    appliedAmount: truncateMoney(totalAmount - remainingAmount),
    creditBalance: truncateMoney(remainingAmount),
  };
}

async function fetchCommissionRates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sellerIds: string[],
  priceListIds: string[],
  orgId: string
): Promise<{
  baseRateMap: Map<string, number>;
  extraRateMap: Map<string, number>;
}> {
  const [baseRatesRes, extraRatesRes] = await Promise.all([
    sellerIds.length > 0
      ? supabase
          .from("organization_members")
          .select("user_id, base_commission_rate")
          .in("user_id", sellerIds)
          .eq("organization_id", orgId)
      : { data: [] },
    priceListIds.length > 0
      ? supabase
          .from("sales_price_lists")
          .select("id, extra_commission_rate")
          .in("id", priceListIds)
      : { data: [] },
  ]);

  const baseRateMap = new Map(
    (baseRatesRes.data ?? []).map((m) => [
      m.user_id,
      m.base_commission_rate ?? 0,
    ])
  );
  const extraRateMap = new Map(
    (extraRatesRes.data ?? []).map((pl) => [
      pl.id,
      pl.extra_commission_rate ?? 0,
    ])
  );

  return { baseRateMap, extraRateMap };
}

function buildCommissionRows(params: {
  orgId: string;
  insertedPayments: Array<{
    id: string;
    account_receivable_id: string;
    amount: number;
  }>;
  accounts: Array<{ id: string; sales_order_id: string }>;
  saleMap: Map<string, { user_id: string; sales_price_list_id: string | null }>;
  baseRateMap: Map<string, number>;
  extraRateMap: Map<string, number>;
}): Array<{
  organization_id: string;
  user_id: string;
  sales_order_id: string;
  receivable_payment_id: string;
  sales_price_list_id: string | null;
  base_commission_rate: number;
  extra_commission_rate: number;
  commission_amount: number;
  paid_amount: number;
}> {
  const {
    orgId,
    insertedPayments,
    accounts,
    saleMap,
    baseRateMap,
    extraRateMap,
  } = params;
  const result: Array<{
    organization_id: string;
    user_id: string;
    sales_order_id: string;
    receivable_payment_id: string;
    sales_price_list_id: string | null;
    base_commission_rate: number;
    extra_commission_rate: number;
    commission_amount: number;
    paid_amount: number;
  }> = [];

  for (const payment of insertedPayments) {
    const account = accounts.find(
      (a) => a.id === payment.account_receivable_id
    );
    if (!account) {
      continue;
    }

    const sale = saleMap.get(account.sales_order_id);
    if (!sale?.user_id) {
      continue;
    }

    const baseRate = baseRateMap.get(sale.user_id) ?? 0;
    const extraRate = sale.sales_price_list_id
      ? (extraRateMap.get(sale.sales_price_list_id) ?? 0)
      : 0;
    const rate = baseRate + extraRate;

    if (rate <= 0) {
      continue;
    }

    const commissionAmount = truncateMoney((payment.amount * rate) / 100);

    result.push({
      organization_id: orgId,
      user_id: sale.user_id,
      sales_order_id: account.sales_order_id,
      receivable_payment_id: payment.id,
      sales_price_list_id: sale.sales_price_list_id ?? null,
      base_commission_rate: baseRate,
      extra_commission_rate: extraRate,
      commission_amount: commissionAmount,
      paid_amount: payment.amount,
    });
  }

  return result;
}

export async function generateCommissions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  insertedPayments: Array<{
    id: string;
    account_receivable_id: string;
    amount: number;
  }>
): Promise<void> {
  const accountIds = insertedPayments.map((p) => p.account_receivable_id);

  const { data: accounts } = await supabase
    .from("accounts_receivable")
    .select("id, sales_order_id")
    .in("id", accountIds)
    .eq("organization_id", orgId);

  if (!accounts || accounts.length === 0) {
    return;
  }

  const saleIds = [
    ...new Set(accounts.map((a) => a.sales_order_id).filter(Boolean)),
  ] as string[];

  if (saleIds.length === 0) {
    return;
  }

  const { data: sales } = await supabase
    .from("sales_orders")
    .select("id, user_id, sales_price_list_id")
    .in("id", saleIds)
    .eq("organization_id", orgId);

  if (!sales || sales.length === 0) {
    return;
  }

  const saleMap = new Map(sales.map((s) => [s.id, s]));
  const sellerIds = [...new Set(sales.map((s) => s.user_id))];
  const priceListIds = [
    ...new Set(sales.map((s) => s.sales_price_list_id).filter(Boolean)),
  ] as string[];

  const { baseRateMap, extraRateMap } = await fetchCommissionRates(
    supabase,
    sellerIds,
    priceListIds,
    orgId
  );

  const commissionRows = buildCommissionRows({
    orgId,
    insertedPayments,
    accounts,
    saleMap,
    baseRateMap,
    extraRateMap,
  });

  if (commissionRows.length > 0) {
    const { error } = await supabase.from("commissions").insert(commissionRows);

    if (error) {
      throw new Error(`Error generating commissions: ${error.message}`);
    }
  }
}

function insertBulkPayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    orgId: string;
    paymentsToInsert: Array<{ account_receivable_id: string; amount: number }>;
    paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
    paymentDateValue: string;
    sanitizedReference: string | null;
    sanitizedNotes: string | null;
  }
) {
  const {
    orgId,
    paymentsToInsert,
    paymentMethodValue,
    paymentDateValue,
    sanitizedReference,
    sanitizedNotes,
  } = params;

  return supabase
    .from("receivable_payments")
    .insert(
      paymentsToInsert.map((p) => ({
        organization_id: orgId,
        account_receivable_id: p.account_receivable_id,
        amount: truncateMoney(p.amount),
        payment_method: paymentMethodValue,
        payment_date: paymentDateValue,
        reference_number: sanitizedReference,
        notes: sanitizedNotes,
      }))
    )
    .select("id, account_receivable_id, amount");
}

async function updateReceivablesStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  accountsToUpdate: Array<{
    id: string;
    newBalance: number;
    newStatus: CollectionAccountStatus;
  }>
) {
  const statusMap: Record<
    CollectionAccountStatus,
    Database["public"]["Enums"]["receivable_status"]
  > = {
    PAID: "PAID",
    PARTIAL: "PARTIALLY_PAID",
    PENDING: "PENDING",
  };

  for (const update of accountsToUpdate) {
    const { error } = await supabase
      .from("accounts_receivable")
      .update({
        pending_balance: truncateMoney(update.newBalance),
        status: statusMap[update.newStatus],
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id)
      .eq("organization_id", orgId);

    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Error al actualizar saldos: ${message}`);
    }
  }
}

async function rollbackBulkPayments(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  paymentsToInsert: Array<{ account_receivable_id: string; amount: number }>;
  paymentDateValue: string;
  paymentMethodValue: Database["public"]["Enums"]["payment_method_type"];
}) {
  const {
    supabase,
    orgId,
    paymentsToInsert,
    paymentDateValue,
    paymentMethodValue,
  } = options;

  await supabase
    .from("receivable_payments")
    .delete()
    .eq("organization_id", orgId)
    .in(
      "account_receivable_id",
      paymentsToInsert.map((p) => p.account_receivable_id)
    )
    .eq("payment_date", paymentDateValue)
    .eq("payment_method", paymentMethodValue);
}

async function saveCreditBalance(options: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  customerId: string;
  creditBalance: number;
  notes: string | null;
  supplierId?: string | null;
}) {
  const { supabase, orgId, customerId, creditBalance, notes, supplierId } =
    options;

  const creditNotes = notes
    ? `Crédito generado por pago masivo. ${notes}`
    : "Crédito generado por pago masivo";

  const { error } = await supabase.from("customer_credits").insert({
    organization_id: orgId,
    customer_id: customerId,
    amount: truncateMoney(creditBalance),
    remaining_amount: truncateMoney(creditBalance),
    source_payment_id: null,
    notes: creditNotes,
    supplier_id: supplierId ?? null,
  });

  if (error) {
    console.error("Error al guardar crédito:", error);
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: borderline, refactor in follow-up
export async function processBulkPayment(
  input: BulkPaymentInput
): Promise<BulkPaymentResult> {
  const {
    orgSlug,
    customerId,
    totalAmount,
    paymentMethod,
    paymentDate,
    referenceNumber,
    notes,
  } = input;

  const normalizedTotalAmount = truncateMoney(totalAmount);

  if (normalizedTotalAmount <= 0) {
    return {
      success: false,
      error: "El monto debe ser mayor a cero",
      code: "invalid_amount",
    };
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return {
      success: false,
      error: "Organización no encontrada",
      code: "organization_not_found",
    };
  }

  const supabase = await createClient();

  // Get pending receivables for customer, ordered by due date (FIFO)
  const { data: pendingAccounts, error: fetchError } = await supabase
    .from("accounts_receivable")
    .select(`
      id,
      sales_order_id,
      total_amount,
      pending_balance,
      due_date,
      sale:sales_orders(status, invoice_number, remittance_number, sale_number)
    `)
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .in("status", ["PENDING", "PARTIALLY_PAID"])
    .gt("pending_balance", 0)
    .order("due_date", { ascending: true });

  if (fetchError) {
    return {
      success: false,
      error: `Error al obtener cuentas pendientes: ${fetchError.message}`,
    };
  }

  const validPendingAccounts = (pendingAccounts ?? []).filter(
    (account) =>
      !isCancelledSale(account.sale as ReceivableWithRelations["sale"])
  );

  if (validPendingAccounts.length === 0) {
    return {
      success: false,
      error: "No hay cuentas pendientes para este cliente",
      code: "no_pending_accounts",
    };
  }

  // Calculate distribution (FIFO)
  const {
    distributions,
    accountsToUpdate,
    paymentsToInsert,
    appliedAmount,
    creditBalance,
  } = calculateDistributions(validPendingAccounts, normalizedTotalAmount);

  // Payment method mapping
  const paymentMethodMap: Record<
    string,
    Database["public"]["Enums"]["payment_method_type"] | string
  > = {
    efectivo: "efectivo",
    transferencia: "transferencia",
    cheque: "cheque",
    tarjeta_de_credito: "tarjeta de credito",
    tarjeta_de_debito: "tarjeta de debito",
    deposito: "deposito",
    "e-cheq": "e-cheq",
  };

  const paymentMethodValue = (paymentMethodMap[paymentMethod] ??
    "efectivo") as Database["public"]["Enums"]["payment_method_type"];
  const paymentDateValue =
    paymentDate ?? new Date().toISOString().split("T")[0];
  const sanitizedReference = referenceNumber?.trim() || null;
  const sanitizedNotes = notes?.trim() || null;

  // Insert payments
  const { data: insertedPayments, error: paymentsError } =
    await insertBulkPayments(supabase, {
      orgId: org.id,
      paymentsToInsert,
      paymentMethodValue,
      paymentDateValue,
      sanitizedReference,
      sanitizedNotes,
    });

  if (paymentsError) {
    return {
      success: false,
      error: `Error al registrar pagos: ${paymentsError.message}`,
    };
  }

  // Update receivables status and generate commissions
  try {
    await updateReceivablesStatus(supabase, org.id, accountsToUpdate);

    if (
      insertedPayments &&
      insertedPayments.length > 0 &&
      org.commissions_enabled
    ) {
      await generateCommissions(supabase, org.id, insertedPayments);
    }
  } catch (error) {
    // Rollback: delete all inserted payments
    await rollbackBulkPayments({
      supabase,
      orgId: org.id,
      paymentsToInsert,
      paymentDateValue,
      paymentMethodValue,
    });

    const errorMessage =
      error instanceof Error ? error.message : "Error desconocido";
    return {
      success: false,
      error: `Error al actualizar saldos: ${errorMessage}`,
    };
  }

  // If there's a credit balance, store it in customer_credits table
  if (creditBalance > 0) {
    await saveCreditBalance({
      supabase,
      orgId: org.id,
      customerId,
      creditBalance,
      notes: sanitizedNotes,
    });
  }

  return {
    success: true,
    appliedAmount,
    creditBalance,
    affectedAccounts: distributions.length,
    distributions,
  };
}

export async function calculateBulkPaymentDistribution(
  orgSlug: string,
  customerId: string,
  totalAmount: number
): Promise<BulkPaymentDistribution[]> {
  const normalizedTotalAmount = truncateMoney(totalAmount);

  if (normalizedTotalAmount <= 0) {
    return [];
  }

  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data: pendingAccounts, error } = await supabase
    .from("accounts_receivable")
    .select(`
      id,
      sales_order_id,
      total_amount,
      pending_balance,
      due_date,
      sale:sales_orders(status, invoice_number, remittance_number, sale_number)
    `)
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .in("status", ["PENDING", "PARTIALLY_PAID"])
    .gt("pending_balance", 0)
    .order("due_date", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener cuentas: ${error.message}`);
  }

  const validPendingAccounts = (pendingAccounts ?? []).filter(
    (account) =>
      !isCancelledSale(account.sale as ReceivableWithRelations["sale"])
  );

  if (validPendingAccounts.length === 0) {
    return [];
  }

  let remainingAmount = normalizedTotalAmount;
  const distributions: BulkPaymentDistribution[] = [];

  for (const account of validPendingAccounts) {
    if (remainingAmount <= 0) {
      break;
    }

    const pendingBalance = truncateMoney(Number(account.pending_balance ?? 0));
    const totalAccountAmount = truncateMoney(Number(account.total_amount ?? 0));
    const appliedAmount = truncateMoney(
      Math.min(remainingAmount, pendingBalance)
    );
    const newBalance = truncateMoney(
      Math.max(0, pendingBalance - appliedAmount)
    );
    const newStatus = deriveStatus(totalAccountAmount, newBalance);

    const sale = Array.isArray(account.sale) ? account.sale[0] : account.sale;

    distributions.push({
      accountId: account.id,
      invoiceNumber: sale?.invoice_number ?? null,
      saleNumber: sale?.sale_number ?? null,
      remittanceNumber: sale?.remittance_number ?? null,
      dueDate: account.due_date,
      totalAmount: totalAccountAmount,
      pendingBalance,
      appliedAmount,
      newBalance,
      newStatus,
    });

    remainingAmount = truncateMoney(remainingAmount - appliedAmount);
  }

  return distributions;
}

/**
 * Get customer credit balance
 */
export async function getCustomerCreditBalance(
  orgSlug: string,
  customerId: string,
  supplierId?: string
): Promise<number> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return 0;
  }

  const supabase = await createClient();

  let query = supabase
    .from("customer_credits")
    .select("remaining_amount")
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .gt("remaining_amount", 0);

  if (supplierId) {
    query = query.eq("supplier_id", supplierId);
  }

  const { data, error } = await query;

  if (error || !data) {
    return 0;
  }

  return data.reduce(
    (sum, credit) =>
      truncateMoney(sum + truncateMoney(Number(credit.remaining_amount))),
    0
  );
}

export type CustomerCreditBreakdown = {
  total: number;
  bySupplier: CreditBreakdownEntry[];
};

export async function getCustomerCreditBreakdown(
  orgSlug: string,
  customerId: string
): Promise<CustomerCreditBreakdown> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return { total: 0, bySupplier: [] };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_credits")
    .select("remaining_amount, supplier_id, suppliers(name)")
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .gt("remaining_amount", 0);

  if (error || !data) {
    return { total: 0, bySupplier: [] };
  }

  const bySupplierMap = new Map<string, CreditBreakdownEntry>();

  for (const row of data) {
    const supplierId = row.supplier_id as string | null;
    const key = supplierId ?? "__null__";
    const existing = bySupplierMap.get(key);

    const amount = truncateMoney(Number(row.remaining_amount ?? 0));

    if (existing) {
      existing.amount = truncateMoney(existing.amount + amount);
    } else {
      const supplierName =
        (row.suppliers as { name: string } | null)?.name ?? "Sin clasificar";

      bySupplierMap.set(key, {
        supplierId,
        supplierName,
        amount,
      });
    }
  }

  const bySupplier = Array.from(bySupplierMap.values());
  const total = bySupplier.reduce(
    (sum, entry) => truncateMoney(sum + entry.amount),
    0
  );

  return { total, bySupplier };
}

export type CustomerCreditEntry = {
  customerId: string;
  name: string;
  fantasyName: string | null;
  creditBalance: number;
};

/**
 * Derives the supplier associated with a receivable's sale for credit attribution.
 * Returns the supplier ID if all sale items belong to the same supplier, null otherwise.
 */
export async function deriveReceivableCreditSupplier(
  orgSlug: string,
  receivableId: string
): Promise<string | null> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return null;
  }

  const supabase = await createClient();

  const { data: detail } = await supabase
    .from("accounts_receivable")
    .select("sales_order_id")
    .eq("id", receivableId)
    .eq("organization_id", org.id)
    .single();

  if (!detail?.sales_order_id) {
    return null;
  }

  const { data: orderItems } = await supabase
    .from("sales_order_items")
    .select("product_id, products!inner(supplier_id)")
    .eq("sales_order_id", detail.sales_order_id)
    .not("product_id", "is", null);

  if (!orderItems?.length) {
    return null;
  }

  const supplierIds = new Set<string>();
  for (const item of orderItems) {
    const product = item.products as unknown as {
      supplier_id: string | null;
    } | null;
    if (product?.supplier_id) {
      supplierIds.add(product.supplier_id);
    }
  }

  return supplierIds.size === 1 ? [...supplierIds][0] : null;
}

type LightReceivableRow = {
  id: string;
  pending_balance: number;
  total_amount: number;
  due_date: string;
  created_at: string | null;
  customer: {
    id?: string | null;
    business_name: string | null;
    fantasy_name: string | null;
  } | null;
  sale: { status: string | null; user_id: string | null } | null;
};

type LightPayableRow = {
  id: string;
  pending_balance: number;
  total_amount: number;
  due_date: string;
  created_at: string | null;
  supplier: { id?: string | null; name: string | null } | null;
};

function sortReceivables(
  rows: LightReceivableRow[],
  sort: { id: string; desc: boolean }[]
): void {
  for (const s of sort) {
    if (s.id === "due_date") {
      rows.sort((a, b) =>
        s.desc
          ? (b.due_date ?? "").localeCompare(a.due_date ?? "")
          : (a.due_date ?? "").localeCompare(b.due_date ?? "")
      );
    } else if (s.id === "customer") {
      rows.sort((a, b) => {
        const nameA = (
          a.customer?.fantasy_name ||
          a.customer?.business_name ||
          ""
        ).toLowerCase();
        const nameB = (
          b.customer?.fantasy_name ||
          b.customer?.business_name ||
          ""
        ).toLowerCase();
        return s.desc ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      });
    } else if (s.id === "pending_balance" || s.id === "total_amount") {
      rows.sort((a, b) => {
        const valA = a[s.id as keyof LightReceivableRow] as number;
        const valB = b[s.id as keyof LightReceivableRow] as number;
        return s.desc ? valB - valA : valA - valB;
      });
    } else if (s.id === "created_at") {
      rows.sort((a, b) => {
        const aDate = a.created_at ?? "";
        const bDate = b.created_at ?? "";
        return s.desc ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
      });
    }
  }
}

function sortPayables(
  rows: LightPayableRow[],
  sort: { id: string; desc: boolean }[]
): void {
  for (const s of sort) {
    if (s.id === "due_date") {
      rows.sort((a, b) =>
        s.desc
          ? (b.due_date ?? "").localeCompare(a.due_date ?? "")
          : (a.due_date ?? "").localeCompare(b.due_date ?? "")
      );
    } else if (s.id === "supplier") {
      rows.sort((a, b) => {
        const nameA = (a.supplier?.name ?? "").toLowerCase();
        const nameB = (b.supplier?.name ?? "").toLowerCase();
        return s.desc ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      });
    } else if (s.id === "pending_balance" || s.id === "total_amount") {
      rows.sort((a, b) => {
        const valA = a[s.id as keyof LightPayableRow] as number;
        const valB = b[s.id as keyof LightPayableRow] as number;
        return s.desc ? valB - valA : valA - valB;
      });
    } else if (s.id === "created_at") {
      rows.sort((a, b) => {
        const aDate = a.created_at ?? "";
        const bDate = b.created_at ?? "";
        return s.desc ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
      });
    }
  }
}

async function enrichReceivablesByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
  accessContext: CollectionsAccessContext,
  orgSlug: string
): Promise<ReceivableAccount[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data } = await supabase
    .from("accounts_receivable")
    .select(RECEIVABLES_SELECT)
    .in("id", ids);

  if (!data) {
    return [];
  }

  const rows = data as unknown as ReceivableWithRelations[];
  const [supplierMap, sellersByUserId] = await Promise.all([
    fetchHistoricalSupplierMap(supabase, rows),
    buildSellersByUserId(orgSlug, accessContext),
  ]);

  const lastPaymentDatesMap = await fetchLastReceivablePaymentDates(
    supabase,
    ids
  );

  const mapped = rows.map((row) =>
    mapReceivableAccount(row, lastPaymentDatesMap, supplierMap, sellersByUserId)
  );

  await enrichReceivablesWithItems(supabase, mapped);

  return mapped;
}

async function enrichPayablesByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<PayableAccount[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data } = await supabase
    .from("accounts_payable" as never)
    .select(PAYABLES_SELECT)
    .in("id", ids);

  if (!data) {
    return [];
  }

  const rows = data as unknown as PayableWithRelations[];
  const payableIds = ids;

  const lastPaymentDatesMap = await fetchLastPayablePaymentDates(
    supabase,
    payableIds
  );

  return rows.map((row) => mapPayableAccount(row, lastPaymentDatesMap));
}

function filterByDateField<T extends Record<string, unknown>>(
  visible: T[],
  field: keyof T,
  range?: { from?: string; to?: string }
): T[] {
  if (!(range?.from || range?.to)) {
    return visible;
  }
  return visible.filter((r) => {
    const value = r[field] as string | null | undefined;
    if (!value) {
      return false;
    }
    if (range.from && value < range.from) {
      return false;
    }
    if (range.to && value > range.to) {
      return false;
    }
    return true;
  });
}

function filterByStatus<
  T extends { total_amount: number | null; pending_balance: number | null },
>(visible: T[], statusFilter: string[]): T[] {
  return visible.filter((r) => {
    const total = Number(r.total_amount ?? 0);
    const pending = Number(r.pending_balance ?? 0);
    if (pending <= 0) {
      return statusFilter.includes("PAID");
    }
    if (pending < total) {
      return statusFilter.includes("PARTIAL");
    }
    return statusFilter.includes("PENDING");
  });
}

export async function getReceivablesPaginated(
  orgSlug: string,
  params: ReceivablesPaginatedParams
): Promise<PaginatedResult<ReceivableAccount>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));

  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
    };
  }

  const accessContext = await resolveCollectionsAccessContext(
    supabase,
    orgSlug
  );

  let query = supabase.from("accounts_receivable").select(
    `
      id,
      pending_balance,
      total_amount,
      due_date,
      created_at,
      customer:customers(id, business_name, fantasy_name),
      sale:sales_orders(status, user_id)
    `
  );

  if (params.search) {
    query = query.ilike("customers.fantasy_name", `%${params.search}%`);
  }
  if (params.customerIds?.length) {
    query = query.in("customer_id", params.customerIds);
  }
  if (params.customerId) {
    query = query.eq("customer_id", params.customerId);
  }

  query = query.eq("organization_id", org.id);

  const { data: lightRows, error } = await query;

  if (error) {
    throw error;
  }

  let visible = (lightRows ?? []).filter(
    (r) =>
      !isCancelledSale(r.sale as ReceivableWithRelations["sale"]) &&
      canAccessReceivable(
        r as unknown as ReceivableWithRelations,
        accessContext
      )
  );

  visible = filterByDateField(
    visible,
    "created_at",
    params.createdAt
  ) as typeof visible;
  visible = filterByDateField(
    visible,
    "due_date",
    params.dueDate
  ) as typeof visible;

  if (params.sellerIds && params.sellerIds.length > 0) {
    const ids = new Set(params.sellerIds);
    visible = visible.filter((r) => {
      const sale = Array.isArray(r.sale) ? r.sale[0] : r.sale;
      return ids.has((sale as { user_id?: string | null })?.user_id ?? "");
    });
  }

  if (params.statusFilter && params.statusFilter.length > 0) {
    visible = filterByStatus(visible, params.statusFilter);
  }

  if (params.sort && params.sort.length > 0) {
    sortReceivables(visible, params.sort);
  } else {
    visible.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  }

  const totalCount = visible.length;
  const from = (page - 1) * pageSize;
  const pageIds = visible.slice(from, from + pageSize).map((r) => r.id);

  const data = await enrichReceivablesByIds(
    supabase,
    pageIds,
    accessContext,
    orgSlug
  );

  return { data, totalCount, page, pageSize };
}

export async function getPayablesPaginated(
  orgSlug: string,
  params: PayablesPaginatedParams
): Promise<PaginatedResult<PayableAccount>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));

  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
    };
  }

  const accessContext = await resolveCollectionsAccessContext(
    supabase,
    orgSlug
  );

  if (accessContext.scope !== "all") {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
    };
  }

  let query = supabase.from("accounts_payable" as never).select(
    `
      id,
      pending_balance,
      total_amount,
      due_date,
      created_at,
      supplier:suppliers(id, name)
    `
  );

  if (params.search) {
    query = query.ilike("suppliers.name", `%${params.search}%`);
  }
  if (params.supplierIds?.length) {
    query = query.in("supplier_id", params.supplierIds);
  }
  if (params.supplierId) {
    query = query.eq("supplier_id", params.supplierId);
  }

  query = query.eq("organization_id", org.id);

  const { data: lightRows, error } = await query;

  if (error) {
    throw error;
  }

  let visible = (lightRows ?? []) as LightPayableRow[];

  visible = filterByDateField(
    visible,
    "created_at",
    params.createdAt
  ) as typeof visible;
  visible = filterByDateField(
    visible,
    "due_date",
    params.dueDate
  ) as typeof visible;

  if (params.statusFilter && params.statusFilter.length > 0) {
    visible = filterByStatus(visible, params.statusFilter);
  }

  if (params.sort && params.sort.length > 0) {
    sortPayables(visible, params.sort);
  } else {
    visible.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  }

  const totalCount = visible.length;
  const from = (page - 1) * pageSize;
  const pageIds = visible.slice(from, from + pageSize).map((r) => r.id);

  const data = await enrichPayablesByIds(supabase, pageIds);

  return { data, totalCount, page, pageSize };
}

export async function getReceivablesMetrics(
  orgSlug: string
): Promise<ReceivablesMetrics> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return { pendingReceivables: 0, collected: 0, overdueReceivables: 0 };
  }

  const accessContext = await resolveCollectionsAccessContext(
    supabase,
    orgSlug
  );

  const { data: lightRows, error } = await supabase
    .from("accounts_receivable")
    .select(
      `
      id,
      pending_balance,
      total_amount,
      due_date,
      sale:sales_orders(status, user_id)
    `
    )
    .eq("organization_id", org.id);

  if (error) {
    console.error("Error fetching receivables metrics:", error.message);
    return { pendingReceivables: 0, collected: 0, overdueReceivables: 0 };
  }

  const visible = (lightRows ?? []).filter(
    (r) =>
      !isCancelledSale(r.sale as ReceivableWithRelations["sale"]) &&
      canAccessReceivable(
        r as unknown as ReceivableWithRelations,
        accessContext
      )
  );

  const today = new Date();
  let pendingReceivables = 0;
  let collected = 0;
  let overdueReceivables = 0;

  for (const r of visible) {
    const total = truncateMoney(Number(r.total_amount ?? 0));
    const pending = truncateMoney(Math.max(0, Number(r.pending_balance ?? 0)));
    pendingReceivables += pending;
    collected += total - pending;

    if (pending > 0 && r.due_date) {
      const due = new Date(r.due_date.split("T")[0]);
      if (due.getTime() < today.getTime()) {
        overdueReceivables += pending;
      }
    }
  }

  return {
    pendingReceivables: truncateMoney(pendingReceivables),
    collected,
    overdueReceivables: truncateMoney(overdueReceivables),
  };
}

export async function getPayablesMetrics(
  orgSlug: string
): Promise<PayablesMetrics> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return { pendingPayables: 0, overduePayables: 0 };
  }

  const accessContext = await resolveCollectionsAccessContext(
    supabase,
    orgSlug
  );

  if (accessContext.scope !== "all") {
    return { pendingPayables: 0, overduePayables: 0 };
  }

  const { data: lightRows, error } = await supabase
    .from("accounts_payable" as never)
    .select("id, pending_balance, due_date")
    .eq("organization_id", org.id);

  if (error) {
    console.error("Error fetching payables metrics:", error.message);
    return { pendingPayables: 0, overduePayables: 0 };
  }

  const today = new Date();
  let pendingPayables = 0;
  let overduePayables = 0;

  for (const r of (lightRows ?? []) as Array<{
    pending_balance: number;
    due_date: string;
  }>) {
    const pending = truncateMoney(Math.max(0, Number(r.pending_balance ?? 0)));
    pendingPayables += pending;

    if (pending > 0 && r.due_date) {
      const due = new Date(r.due_date.split("T")[0]);
      if (due.getTime() < today.getTime()) {
        overduePayables += pending;
      }
    }
  }

  return {
    pendingPayables: truncateMoney(pendingPayables),
    overduePayables: truncateMoney(overduePayables),
  };
}

/**
 * Returns customers that have remaining credit but no pending AR (credit-only customers).
 */
export async function getCreditOnlyCustomers(
  orgSlug: string,
  receivableCustomerIds: Set<string>
): Promise<CustomerCreditEntry[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data: credits, error } = await supabase
    .from("customer_credits")
    .select("customer_id, remaining_amount")
    .eq("organization_id", org.id)
    .gt("remaining_amount", 0);

  if (error || !credits?.length) {
    return [];
  }

  const customerIds = [
    ...new Set(credits.map((c) => c.customer_id).filter(Boolean)),
  ];

  const { data: customers } = await supabase
    .from("customers")
    .select("id, fantasy_name, business_name")
    .in("id", customerIds);

  const customerMap = new Map((customers ?? []).map((c) => [c.id, c]));

  const creditByCustomer = new Map<string, CustomerCreditEntry>();
  for (const row of credits) {
    if (!row.customer_id || receivableCustomerIds.has(row.customer_id)) {
      continue;
    }
    const customer = customerMap.get(row.customer_id);
    const amount = truncateMoney(Number(row.remaining_amount ?? 0));
    const existing = creditByCustomer.get(row.customer_id);
    if (existing) {
      existing.creditBalance = truncateMoney(existing.creditBalance + amount);
    } else {
      creditByCustomer.set(row.customer_id, {
        customerId: row.customer_id,
        name: customer?.fantasy_name ?? customer?.business_name ?? "Cliente",
        fantasyName: customer?.fantasy_name ?? null,
        creditBalance: amount,
      });
    }
  }

  return Array.from(creditByCustomer.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/**
 * Get customer credits with details
 */
export async function getCustomerCredits(
  orgSlug: string,
  customerId: string,
  supplierId?: string
): Promise<CustomerCredit[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  let query = supabase
    .from("customer_credits")
    .select("*")
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .gt("remaining_amount", 0)
    .order("created_at", { ascending: true });

  if (supplierId) {
    query = query.eq("supplier_id", supplierId);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map((credit) => ({
    ...credit,
    amount: truncateMoney(Number(credit.amount ?? 0)),
    remaining_amount: truncateMoney(Number(credit.remaining_amount ?? 0)),
  }));
}

export async function getAllReceivablesForExport(
  orgSlug: string
): Promise<ReceivableAccount[]> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  const accessContext = await resolveCollectionsAccessContext(
    supabase,
    orgSlug
  );

  const { data: lightRows, error } = await supabase
    .from("accounts_receivable")
    .select(
      `
      id,
      pending_balance,
      total_amount,
      due_date,
      created_at,
      customer:customers(id, business_name, fantasy_name),
      sale:sales_orders(status, user_id)
    `
    )
    .eq("organization_id", org.id)
    .limit(10_000);

  if (error) {
    console.error("Error fetching receivables for export:", error.message);
    return [];
  }

  const visible = (lightRows ?? []).filter(
    (r) =>
      !isCancelledSale(r.sale as ReceivableWithRelations["sale"]) &&
      canAccessReceivable(
        r as unknown as ReceivableWithRelations,
        accessContext
      )
  );

  const ids = visible.map((r) => r.id);

  if (ids.length === 0) {
    return [];
  }

  return enrichReceivablesByIds(supabase, ids, accessContext, orgSlug);
}

export async function getAllPayablesForExport(
  orgSlug: string
): Promise<PayableAccount[]> {
  const supabase = await createClient();
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  const accessContext = await resolveCollectionsAccessContext(
    supabase,
    orgSlug
  );

  if (accessContext.scope !== "all") {
    return [];
  }

  const { data: lightRows, error } = await supabase
    .from("accounts_payable" as never)
    .select(
      `
      id,
      pending_balance,
      total_amount,
      due_date,
      created_at,
      supplier:suppliers(id, name)
    `
    )
    .eq("organization_id", org.id)
    .limit(10_000);

  if (error) {
    console.error("Error fetching payables for export:", error.message);
    return [];
  }

  const visible = (lightRows ?? []) as LightPayableRow[];
  const ids = visible.map((r) => r.id);

  if (ids.length === 0) {
    return [];
  }

  return enrichPayablesByIds(supabase, ids);
}
