import { truncateMoney } from "@/lib/decimal";
import type { createClient } from "@/lib/supabase/server";
import { getSupplierCommissionRateMap } from "./supplier-commission-rates.service";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type InsertedPayment = {
  id: string;
  account_receivable_id: string;
  amount: number;
};

type SaleForCommission = {
  id: string;
  user_id: string;
  sales_price_list_id: string | null;
  price_level_id: string | null;
};

type CommissionInsertRow = {
  organization_id: string;
  user_id: string;
  sales_order_id: string;
  receivable_payment_id: string;
  sales_price_list_id: string | null;
  base_commission_rate: number;
  extra_commission_rate: number;
  supplier_commission_rate: number;
  commission_amount: number;
  paid_amount: number;
};

/**
 * Lee las tasas de comisión:
 * - base_commission_rate por vendedor (organization_members).
 * - delta del nivel de lista (price_levels.extra_commission_rate) por price_level_id.
 */
async function fetchCommissionRates(
  supabase: SupabaseClient,
  sellerIds: string[],
  priceLevelIds: string[],
  orgId: string
): Promise<{
  baseRateMap: Map<string, number>;
  extraRateMap: Map<string, number>;
}> {
  const [baseRatesRes, extraRatesRes] = (await Promise.all([
    sellerIds.length > 0
      ? supabase
          .from("organization_members")
          .select("user_id, base_commission_rate")
          .in("user_id", sellerIds)
          .eq("organization_id", orgId)
      : { data: [] },
    priceLevelIds.length > 0
      ? supabase
          .from("price_levels")
          .select("id, extra_commission_rate")
          .in("id", priceLevelIds)
      : { data: [] },
  ])) as [
    { data: { user_id: string; base_commission_rate: number | null }[] | null },
    { data: { id: string; extra_commission_rate: number | null }[] | null },
  ];

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
  insertedPayments: InsertedPayment[];
  accounts: Array<{ id: string; sales_order_id: string }>;
  saleMap: Map<string, SaleForCommission>;
  baseRateMap: Map<string, number>;
  extraRateMap: Map<string, number>;
  supplierRateMap: Map<string, number>;
  supplierBySale: Map<string, string>;
}): CommissionInsertRow[] {
  const {
    orgId,
    insertedPayments,
    accounts,
    saleMap,
    baseRateMap,
    extraRateMap,
    supplierRateMap,
    supplierBySale,
  } = params;
  const result: CommissionInsertRow[] = [];

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
    const extraRate = sale.price_level_id
      ? (extraRateMap.get(sale.price_level_id) ?? 0)
      : 0;
    const supplierId = supplierBySale.get(account.sales_order_id);
    const supplierRate = supplierId
      ? (supplierRateMap.get(`${sale.user_id}|${supplierId}`) ?? 0)
      : 0;
    const rate = baseRate + extraRate + supplierRate;

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
      supplier_commission_rate: supplierRate,
      commission_amount: commissionAmount,
      paid_amount: payment.amount,
    });
  }

  return result;
}

/**
 * Resuelve el proveedor de cada venta en UNA query (items → products.supplier_id).
 * Si una venta no tiene proveedor o tiene varios, se omite (tasa por proveedor = 0).
 */
async function fetchSaleSuppliers(
  supabase: SupabaseClient,
  saleIds: string[]
): Promise<Map<string, string>> {
  const supplierBySale = new Map<string, string>();

  if (saleIds.length === 0) {
    return supplierBySale;
  }

  const { data: saleItems } = (await supabase
    .from("sales_order_items")
    .select("sales_order_id, products!inner(supplier_id)")
    .in("sales_order_id", saleIds)
    .not("product_id", "is", null)) as {
    data: Array<{
      sales_order_id: string;
      products: { supplier_id: string | null } | null;
    }> | null;
  };

  const suppliersBySale = new Map<string, Set<string>>();
  for (const item of saleItems ?? []) {
    const supplierId = item.products?.supplier_id;
    if (!supplierId) {
      continue;
    }
    const set = suppliersBySale.get(item.sales_order_id) ?? new Set<string>();
    set.add(supplierId);
    suppliersBySale.set(item.sales_order_id, set);
  }

  for (const [saleId, suppliers] of suppliersBySale.entries()) {
    if (suppliers.size === 1) {
      supplierBySale.set(saleId, [...suppliers][0]);
    }
  }

  return supplierBySale;
}

/**
 * Genera las comisiones correspondientes a una o más pagos aplicados a ventas.
 * - Una fila por pago (comisión sobre lo cobrado).
 * - Tasa = base del vendedor + delta del nivel de lista + tasa vendedor × proveedor.
 */
export async function generateCommissions(
  supabase: SupabaseClient,
  orgId: string,
  insertedPayments: InsertedPayment[]
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

  const { data: sales } = (await supabase
    .from("sales_orders")
    .select("id, user_id, sales_price_list_id, price_level_id")
    .in("id", saleIds)
    .eq("organization_id", orgId)) as {
    data: SaleForCommission[] | null;
  };

  if (!sales || sales.length === 0) {
    return;
  }

  const saleMap = new Map(sales.map((s) => [s.id, s]));
  const sellerIds = [...new Set(sales.map((s) => s.user_id))];
  const priceLevelIds = [
    ...new Set(sales.map((s) => s.price_level_id).filter(Boolean)),
  ] as string[];

  const { baseRateMap, extraRateMap } = await fetchCommissionRates(
    supabase,
    sellerIds,
    priceLevelIds,
    orgId
  );

  // Resolver el proveedor de cada venta en una sola query (sin N+1).
  const supplierBySale = await fetchSaleSuppliers(supabase, saleIds);

  const supplierPairs = sales
    .filter((s) => supplierBySale.has(s.id))
    .map((s) => ({
      seller_id: s.user_id,
      supplier_id: supplierBySale.get(s.id) as string,
    }));

  const supplierRateMap = await getSupplierCommissionRateMap(
    supabase,
    orgId,
    supplierPairs
  );

  const commissionRows = buildCommissionRows({
    orgId,
    insertedPayments,
    accounts,
    saleMap,
    baseRateMap,
    extraRateMap,
    supplierRateMap,
    supplierBySale,
  });

  if (commissionRows.length > 0) {
    const { error } = await supabase.from("commissions").insert(commissionRows);

    if (error) {
      throw new Error(`Error generating commissions: ${error.message}`);
    }
  }
}
