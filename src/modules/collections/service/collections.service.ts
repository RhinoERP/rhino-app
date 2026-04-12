import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationMembersWithUsersAdmin } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Database } from "@/types/supabase";
import type {
  BulkPaymentDistribution,
  BulkPaymentInput,
  BulkPaymentResult,
  CollectionAccountStatus,
  CustomerCredit,
  PayableAccount,
  ReceivableAccount,
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
        invoice_number?: string | null;
        sale_date?: string | null;
        sale_number?: number | null;
        sub_total?: number | null;
        global_discount_amount?: number | null;
        remittance_number?: string | null;
        items?: SaleItemRaw[] | null;
      }
    | Array<{
        status?: Database["public"]["Enums"]["order_status"] | null;
        user_id?: string | null;
        invoice_number?: string | null;
        sale_date?: string | null;
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
  supplier?:
    | {
        name?: string | null;
      }
    | {
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
  return "invoice_number" in raw || "sale_date" in raw || "sale_number" in raw;
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

  return rawItems.map((item) => {
    const product = Array.isArray(item.product)
      ? item.product[0]
      : item.product;
    const quantities = deriveItemQuantities(item);
    return {
      productId:
        (item.product_id as string | null) ??
        (product?.id as string | null) ??
        null,
      productName: (product?.name as string | null) ?? null,
      supplierName: normalizeSupplierNameFromProduct(product),
      units: quantities.units,
      kilograms: quantities.kilograms,
      subtotal: quantities.subtotal,
      subtotalCrudo: quantities.subtotalCrudo,
    };
  });
}

function normalizeSupplier(
  payable: PayableWithRelations
): PayableAccount["supplier"] {
  const rawSupplier = Array.isArray(payable.supplier)
    ? payable.supplier[0]
    : payable.supplier;

  if (rawSupplier && typeof rawSupplier === "object" && "id" in rawSupplier) {
    return {
      id: (rawSupplier.id as string) ?? payable.supplier_id,
      name: (rawSupplier.name as string | null) ?? "Proveedor desconocido",
    };
  }

  return {
    id: payable.supplier_id,
    name: "Proveedor desconocido",
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

  return rawItems.map((item) => {
    const product = Array.isArray(item.product)
      ? item.product[0]
      : item.product;
    const quantities = deriveItemQuantities(item);
    return {
      productId:
        (item.product_id as string | null) ??
        (product?.id as string | null) ??
        null,
      productName: (product?.name as string | null) ?? null,
      supplierName: normalizeSupplierNameFromProduct(product),
      units: quantities.units,
      kilograms: quantities.kilograms,
      subtotal: quantities.subtotal,
      subtotalCrudo: quantities.subtotalCrudo,
    };
  });
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
    .select(
      `
        *,
        customer:customers(id, business_name, fantasy_name, city),
        sale:sales_orders(
          status,
          user_id,
          invoice_number,
          sale_date,
          sale_number,
          sub_total,
          global_discount_amount,
          remittance_number,
          items:sales_order_items(
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
              supplier:suppliers(name)
            )
          )
        )
      `
    )
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

  // Get receivable IDs to fetch last payment dates
  const receivableIds = validReceivables
    .map((row) => row.id)
    .filter((id): id is string => id !== null && id !== undefined);

  // Fetch last payment dates for all receivables
  const lastPaymentDatesMap = new Map<string, string | null>();
  if (receivableIds.length > 0) {
    const { data: paymentsData } = await supabase
      .from("receivable_payments")
      .select("account_receivable_id, payment_date")
      .in("account_receivable_id", receivableIds)
      .order("payment_date", { ascending: false });

    if (paymentsData) {
      // Group by receivable_id and get the latest payment_date
      for (const payment of paymentsData) {
        const receivableId = payment.account_receivable_id;
        if (!lastPaymentDatesMap.has(receivableId)) {
          lastPaymentDatesMap.set(receivableId, payment.payment_date);
        }
      }
    }
  }

  const sellersByUserId = await buildSellersByUserId(orgSlug, accessContext);

  return validReceivables.map((row) => {
    const total = truncateMoney(Number(row.total_amount ?? 0));
    const pending = truncateMoney(
      Math.max(0, Number(row.pending_balance ?? 0))
    );
    const status = deriveStatus(total, pending);
    const lastPaymentDate = row.id
      ? (lastPaymentDatesMap.get(row.id) ?? null)
      : null;
    const saleUserId = getSaleUserId(row.sale);
    const seller = saleUserId
      ? (sellersByUserId.get(saleUserId) ?? { id: saleUserId })
      : null;

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
      items: normalizeSaleItems(row),
      type: "receivable",
    };
  });
}

type ReceivableExportRow = {
  receivable_id: string;
  sales_order_id: string;
  invoice_number: string | null;
  sale_number: number | null;
  sale_date: string | null;
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
    .select(
      `
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
          total_amount,
          items:purchase_order_items(
            quantity,
            unit_quantity,
            subtotal,
            discount_amount,
            discount_precentage,
            product_id,
            product:products(
              id,
              name,
              unit_of_measure,
              supplier:suppliers(name)
            )
          )
        )
      `
    )
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

// Helper functions for processBulkPayment
function calculateDistributions(
  pendingAccounts: Array<{
    id: string;
    total_amount: number;
    pending_balance: number;
    due_date: string;
    sale?: {
      invoice_number?: string | null;
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

  return supabase.from("receivable_payments").insert(
    paymentsToInsert.map((p) => ({
      organization_id: orgId,
      account_receivable_id: p.account_receivable_id,
      amount: truncateMoney(p.amount),
      payment_method: paymentMethodValue,
      payment_date: paymentDateValue,
      reference_number: sanitizedReference,
      notes: sanitizedNotes,
    }))
  );
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
}) {
  const { supabase, orgId, customerId, creditBalance, notes } = options;

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
  });

  if (error) {
    console.error("Error al guardar crédito:", error);
  }
}

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
      sale:sales_orders(status, invoice_number, sale_number)
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
    Database["public"]["Enums"]["payment_method_type"]
  > = {
    efectivo: "efectivo",
    transferencia: "transferencia",
    cheque: "cheque",
    tarjeta_de_credito: "tarjeta de credito",
    tarjeta_de_debito: "tarjeta de debito",
  };

  const paymentMethodValue = paymentMethodMap[paymentMethod] ?? "efectivo";
  const paymentDateValue =
    paymentDate ?? new Date().toISOString().split("T")[0];
  const sanitizedReference = referenceNumber?.trim() || null;
  const sanitizedNotes = notes?.trim() || null;

  // Insert payments
  const { error: paymentsError } = await insertBulkPayments(supabase, {
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

  // Update receivables status
  try {
    await updateReceivablesStatus(supabase, org.id, accountsToUpdate);
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
      sale:sales_orders(status, invoice_number, sale_number)
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
  customerId: string
): Promise<number> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return 0;
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_credits")
    .select("remaining_amount")
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .gt("remaining_amount", 0);

  if (error || !data) {
    return 0;
  }

  return data.reduce(
    (sum, credit) =>
      truncateMoney(sum + truncateMoney(Number(credit.remaining_amount))),
    0
  );
}

/**
 * Get customer credits with details
 */
export async function getCustomerCredits(
  orgSlug: string,
  customerId: string
): Promise<CustomerCredit[]> {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org?.id) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_credits")
    .select("*")
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .gt("remaining_amount", 0)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((credit) => ({
    ...credit,
    amount: truncateMoney(Number(credit.amount ?? 0)),
    remaining_amount: truncateMoney(Number(credit.remaining_amount ?? 0)),
  }));
}
