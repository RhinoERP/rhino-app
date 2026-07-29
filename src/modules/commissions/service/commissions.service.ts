import { truncateMoney } from "@/lib/decimal";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  CommissionMetrics,
  CommissionSale,
  CommissionSeller,
  CommissionsPaginatedParams,
  PaginatedResult,
} from "../types";

function getMonthRange(month?: string): {
  monthStart: string;
  monthEnd: string;
} {
  const now = new Date();
  const monthStart = month
    ? `${month}-01`
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const [year, monthNum] = monthStart.split("-");
  const endDay = String(new Date(Number(year), Number(monthNum), 0).getDate());
  const monthEnd = `${monthStart.split("-").slice(0, 2).join("-")}-${endDay}`;
  return { monthStart, monthEnd };
}

function sortSellers(
  sellers: CommissionSeller[],
  params: CommissionsPaginatedParams
): CommissionSeller[] {
  const sorted = [...sellers];
  if (params.sort && params.sort.length > 0) {
    const s = params.sort[0];
    const byName = s.id === "sellerName";
    sorted.sort((a, b) => {
      if (byName) {
        return s.desc
          ? b.sellerName.localeCompare(a.sellerName)
          : a.sellerName.localeCompare(b.sellerName);
      }
      return s.desc
        ? b.totalCommission - a.totalCommission
        : a.totalCommission - b.totalCommission;
    });
  } else {
    sorted.sort((a, b) => b.totalCommission - a.totalCommission);
  }
  return sorted;
}

type CommissionRow = {
  id: string;
  user_id: string;
  sales_order_id: string;
  base_commission_rate: number;
  extra_commission_rate: number;
  commission_amount: number;
  paid_amount: number;
  created_at: string;
  sale:
    | {
        sale_number?: number | null;
        invoice_number?: string | null;
        sub_total?: number | null;
        dispatched_at?: string | null;
        customer_id?: string | null;
      }
    | Array<{
        sale_number?: number | null;
        invoice_number?: string | null;
        sub_total?: number | null;
        dispatched_at?: string | null;
        customer_id?: string | null;
      }>
    | null;
};

async function fetchSellerNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[],
  orgId: string
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();

  if (userIds.length === 0) {
    return nameMap;
  }

  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, user:users(name, email)")
    .in("user_id", userIds)
    .eq("organization_id", orgId);

  for (const m of members ?? []) {
    const userData = Array.isArray(m.user) ? m.user[0] : m.user;
    nameMap.set(m.user_id, userData?.name || userData?.email || m.user_id);
  }

  return nameMap;
}

async function fetchSaleCustomerNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  saleIds: string[],
  orgId: string
): Promise<Map<string, string>> {
  const customerMap = new Map<string, string>();

  if (saleIds.length === 0) {
    return customerMap;
  }

  const { data: sales } = await supabase
    .from("sales_orders")
    .select("id, customer_id, customers(id, fantasy_name, business_name)")
    .in("id", saleIds)
    .eq("organization_id", orgId);

  for (const s of sales ?? []) {
    const cust = Array.isArray(s.customers) ? s.customers[0] : s.customers;
    customerMap.set(s.id, cust?.fantasy_name || cust?.business_name || "");
  }

  return customerMap;
}

async function fetchSellerBaseRates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[],
  orgId: string
): Promise<Map<string, number>> {
  const baseRateMap = new Map<string, number>();

  if (userIds.length === 0) {
    return baseRateMap;
  }

  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, base_commission_rate")
    .in("user_id", userIds)
    .eq("organization_id", orgId);

  for (const m of members ?? []) {
    baseRateMap.set(m.user_id, m.base_commission_rate ?? 0);
  }

  return baseRateMap;
}

function buildCommissionSellers(
  commissionRows: CommissionRow[],
  nameMap: Map<string, string>,
  baseRateMap: Map<string, number>,
  customerMap: Map<string, string>
): Map<string, CommissionSeller> {
  const sellerMap = new Map<string, CommissionSeller>();

  for (const row of commissionRows) {
    if (!sellerMap.has(row.user_id)) {
      sellerMap.set(row.user_id, {
        userId: row.user_id,
        sellerName: nameMap.get(row.user_id) || row.user_id,
        baseCommissionRate: baseRateMap.get(row.user_id) ?? 0,
        saleCount: 0,
        totalSubtotal: 0,
        totalCommission: 0,
        sales: [],
      });
    }

    const seller = sellerMap.get(row.user_id);
    if (!seller) {
      continue;
    }

    const saleData = Array.isArray(row.sale) ? row.sale[0] : row.sale;

    const commissionSale: CommissionSale = {
      id: row.id,
      saleNumber: saleData?.sale_number ?? null,
      customerName: customerMap.get(row.sales_order_id) || "",
      invoiceNumber: saleData?.invoice_number ?? null,
      dispatchedAt: saleData?.dispatched_at ?? null,
      subTotal: saleData?.sub_total ?? 0,
      commissionRate: row.base_commission_rate + row.extra_commission_rate,
      commissionAmount: row.commission_amount,
      paidAmount: row.paid_amount,
    };

    seller.sales.push(commissionSale);
    seller.saleCount += 1;
    seller.totalSubtotal = truncateMoney(
      seller.totalSubtotal + (saleData?.sub_total ?? 0)
    );
    seller.totalCommission = truncateMoney(
      seller.totalCommission + row.commission_amount
    );
  }

  return sellerMap;
}

export async function getCommissionsPaginated(
  orgSlug: string,
  params: CommissionsPaginatedParams
): Promise<PaginatedResult<CommissionSeller>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return { data: [], totalCount: 0, page, pageSize };
  }

  const supabase = await createClient();
  const { monthStart, monthEnd } = getMonthRange(params.month);

  let query = supabase
    .from("commissions")
    .select(
      `id, user_id, sales_order_id, base_commission_rate, extra_commission_rate,
       commission_amount, paid_amount, created_at,
       sale:sales_orders(sale_number, invoice_number, sub_total, dispatched_at, customer_id)`
    )
    .eq("organization_id", org.id)
    .gte("created_at", monthStart)
    .lte("created_at", `${monthEnd}T23:59:59`)
    .order("created_at", { ascending: false });

  if (params.sellerId) {
    query = query.eq("user_id", params.sellerId);
  }

  const { data: commissionRows, error } = await query;

  if (error || !commissionRows) {
    throw new Error(
      `Error fetching commissions: ${error?.message ?? "No data"}`
    );
  }

  const userIds = [...new Set(commissionRows.map((c) => c.user_id))];
  const saleIds = [...new Set(commissionRows.map((c) => c.sales_order_id))];

  const [nameMap, customerMap, baseRateMap] = await Promise.all([
    fetchSellerNames(supabase, userIds, org.id),
    fetchSaleCustomerNames(supabase, saleIds, org.id),
    fetchSellerBaseRates(supabase, userIds, org.id),
  ]);

  const sellerMap = buildCommissionSellers(
    commissionRows as CommissionRow[],
    nameMap,
    baseRateMap,
    customerMap
  );

  let sellers = Array.from(sellerMap.values());

  if (params.search) {
    const term = params.search.toLowerCase();
    sellers = sellers.filter((s) => s.sellerName.toLowerCase().includes(term));
  }

  const sorted = sortSellers(sellers, params);

  const totalCount = sorted.length;
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  return { data: paginated, totalCount, page, pageSize };
}

export async function getCommissionMetrics(
  orgSlug: string,
  month?: string
): Promise<CommissionMetrics> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      totalSellers: 0,
      totalSales: 0,
      totalCommission: 0,
      averageCommission: 0,
    };
  }

  const { monthStart, monthEnd } = getMonthRange(month);

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("commissions")
    .select("user_id, commission_amount")
    .eq("organization_id", org.id)
    .gte("created_at", monthStart)
    .lte("created_at", `${monthEnd}T23:59:59`);

  if (error || !data) {
    return {
      totalSellers: 0,
      totalSales: 0,
      totalCommission: 0,
      averageCommission: 0,
    };
  }

  const sellerSet = new Set(data.map((c) => c.user_id));
  const totalSales = data.length;
  const totalCommission = truncateMoney(
    data.reduce((sum, c) => sum + c.commission_amount, 0)
  );
  const averageCommission =
    sellerSet.size > 0 ? truncateMoney(totalCommission / sellerSet.size) : 0;

  return {
    totalSellers: sellerSet.size,
    totalSales,
    totalCommission,
    averageCommission,
  };
}

export async function getAllCommissionsForExport(
  orgSlug: string,
  month?: string
): Promise<CommissionSeller[]> {
  const result = await getCommissionsPaginated(orgSlug, {
    page: 1,
    pageSize: 10_000,
    month,
  });

  return result.data;
}
