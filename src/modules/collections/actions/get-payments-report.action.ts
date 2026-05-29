"use server";

import { truncateMoney } from "@/lib/decimal";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export type PaymentReportEntry = {
  paymentDate: string;
  customerName: string;
  sellerName: string | null;
  supplierName: string | null;
  saleNumber: number | null;
  invoiceNumber: string | null;
  remittanceNumber: string | null;
  amount: number;
};

type GetPaymentsReportInput = {
  orgSlug: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
};

type RawPayment = {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  account_receivable: {
    sales_order_id: string;
    customer_id: string;
  };
};

type SaleInfo = {
  sale_number: number | null;
  invoice_number: string | null;
  remittance_number: string | null;
  invoice_type: string | null;
  user_id: string | null;
  customer: {
    id: string;
    fantasy_name: string | null;
    business_name: string;
  };
};

function buildCustomerName(customer?: SaleInfo["customer"]): string {
  if (!customer) {
    return "—";
  }
  const { fantasy_name, business_name } = customer;
  if (fantasy_name && business_name && fantasy_name !== business_name) {
    return `${fantasy_name} (${business_name})`;
  }
  return fantasy_name || business_name || "—";
}

async function fetchSupplierNamesBySale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  saleIds: string[]
): Promise<Map<string, string>> {
  const supplierNamesBySale = new Map<string, string>();

  const { data: items } = await supabase
    .from("sales_order_items")
    .select(
      `
        sales_order_id,
        product:products!inner(
          supplier:suppliers(name)
        )
      `
    )
    .in("sales_order_id", saleIds);

  if (!items) {
    return supplierNamesBySale;
  }

  const namesBySale = new Map<string, Set<string>>();
  for (const item of items) {
    const saleId = item.sales_order_id as string;
    const product = item.product as unknown as {
      supplier: { name: string | null } | null;
    } | null;
    const name = product?.supplier?.name ?? null;
    if (!name) {
      continue;
    }
    if (!namesBySale.has(saleId)) {
      namesBySale.set(saleId, new Set());
    }
    const entry = namesBySale.get(saleId);
    if (entry) {
      entry.add(name);
    }
  }

  for (const [saleId, names] of namesBySale) {
    const unique = [...names];
    supplierNamesBySale.set(
      saleId,
      unique.length === 1 ? (unique[0] as string) : "Varios"
    );
  }

  return supplierNamesBySale;
}

async function fetchSellerMap(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) {
    return map;
  }

  try {
    const adminClient = createAdminClient();

    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await adminClient.auth.admin.getUserById(uid);
        if (data?.user) {
          const name =
            (data.user.user_metadata?.full_name as string | undefined) ??
            data.user.email ??
            uid;
          map.set(uid, name);
        }
      })
    );
  } catch {
    // Non-critical: seller names will use IDs
  }

  return map;
}

function buildEntries(
  payments: RawPayment[],
  salesMap: Map<string, SaleInfo>,
  supplierNamesBySale: Map<string, string>,
  sellerMap: Map<string, string>
): PaymentReportEntry[] {
  return payments.map((p) => {
    const sale = salesMap.get(p.account_receivable.sales_order_id);
    const customerName = buildCustomerName(sale?.customer);

    return {
      paymentDate: p.payment_date,
      customerName,
      sellerName: sale?.user_id ? (sellerMap.get(sale.user_id) ?? null) : null,
      supplierName:
        supplierNamesBySale.get(p.account_receivable.sales_order_id) ?? null,
      saleNumber: sale?.sale_number ?? null,
      invoiceNumber: sale?.invoice_number ?? null,
      remittanceNumber: sale?.remittance_number ?? null,
      amount: truncateMoney(Number(p.amount)),
    };
  });
}

export async function getPaymentsReportAction({
  orgSlug,
  customerId,
  dateFrom,
  dateTo,
}: GetPaymentsReportInput): Promise<{
  data: PaymentReportEntry[] | null;
  error: string | null;
}> {
  try {
    const org = await getOrganizationBySlug(orgSlug);
    if (!org) {
      return { data: null, error: "Organización no encontrada" };
    }

    const supabase = await createClient();

    let query = supabase
      .from("receivable_payments")
      .select(
        "id, amount, payment_method, payment_date, reference_number, notes, account_receivable:accounts_receivable!inner(sales_order_id, customer_id)"
      )
      .eq("organization_id", org.id)
      .order("payment_date", { ascending: false });

    if (customerId) {
      query = query.eq("account_receivable.customer_id", customerId);
    }

    if (dateFrom) {
      query = query.gte("payment_date", dateFrom);
    }

    if (dateTo) {
      query = query.lte("payment_date", dateTo);
    }

    const { data: rawPayments, error: paymentsError } = await query;

    if (paymentsError) {
      return { data: null, error: paymentsError.message };
    }

    if (!rawPayments || rawPayments.length === 0) {
      return { data: [], error: null };
    }

    const payments = rawPayments as unknown as RawPayment[];

    const saleIds = [
      ...new Set(payments.map((p) => p.account_receivable.sales_order_id)),
    ];

    const { data: sales } = await supabase
      .from("sales_orders")
      .select(
        `
        id, sale_number, invoice_number, remittance_number, invoice_type, user_id,
        customer:customers!inner(id, fantasy_name, business_name)
      `
      )
      .in("id", saleIds);

    const salesMap = new Map<string, SaleInfo>();
    for (const s of sales ?? []) {
      salesMap.set(s.id as string, {
        sale_number: s.sale_number as number | null,
        invoice_number: s.invoice_number as string | null,
        remittance_number: s.remittance_number as string | null,
        invoice_type: s.invoice_type as string | null,
        user_id: s.user_id as string | null,
        customer: s.customer as unknown as SaleInfo["customer"],
      });
    }

    const supplierNamesBySale = await fetchSupplierNamesBySale(
      supabase,
      saleIds
    );

    const userIds = [
      ...new Set(
        [...salesMap.values()].map((s) => s.user_id).filter(Boolean) as string[]
      ),
    ];
    const sellerMap = await fetchSellerMap(userIds);

    const entries = buildEntries(
      payments,
      salesMap,
      supplierNamesBySale,
      sellerMap
    );

    return { data: entries, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
