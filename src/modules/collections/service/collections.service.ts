import { createClient } from "@/lib/supabase/server";
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
      }
    | Array<{
        id?: string | null;
        business_name?: string | null;
        fantasy_name?: string | null;
      }>
    | null;
  sale:
    | {
        invoice_number?: string | null;
        sale_date?: string | null;
        sale_number?: number | null;
        items?: SaleItemRaw[] | null;
      }
    | Array<{
        invoice_number?: string | null;
        sale_date?: string | null;
        sale_number?: number | null;
        items?: SaleItemRaw[] | null;
      }>
    | null;
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
    };
  }

  return {
    id: receivable.customer_id,
    business_name: "Cliente desconocido",
    fantasy_name: null,
  };
}

function normalizeSaleInfo(
  receivable: ReceivableWithRelations
): ReceivableAccount["sale"] {
  const rawSale = Array.isArray(receivable.sale)
    ? receivable.sale[0]
    : receivable.sale;

  if (
    rawSale &&
    typeof rawSale === "object" &&
    ("invoice_number" in rawSale ||
      "sale_date" in rawSale ||
      "sale_number" in rawSale)
  ) {
    return {
      invoice_number: (rawSale.invoice_number as string | null) ?? null,
      sale_date: (rawSale.sale_date as string | null) ?? null,
      sale_number:
        rawSale.sale_number !== undefined && rawSale.sale_number !== null
          ? Number(rawSale.sale_number)
          : null,
    };
  }

  return null;
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

function deriveItemQuantities(item: SaleItemRaw | PurchaseItemRaw): {
  units: number | null;
  kilograms: number | null;
  subtotal: number | null;
} {
  const product = Array.isArray(item.product) ? item.product[0] : item.product;
  const unitOfMeasure = product?.unit_of_measure ?? "UN";
  const quantity = item.quantity ?? null;
  const unitQuantity = item.unit_quantity ?? null;
  const subtotal =
    item.subtotal !== undefined && item.subtotal !== null
      ? Number(item.subtotal)
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
      total_amount: (rawPurchase.total_amount as number | null) ?? null,
    };
  }

  return null;
}

export async function getReceivablesByOrgSlug(
  orgSlug: string
): Promise<ReceivableAccount[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("accounts_receivable")
    .select(
      `
        *,
        customer:customers(id, business_name, fantasy_name),
        sale:sales_orders(
          invoice_number,
          sale_date,
          sale_number,
          items:sales_order_items(
            quantity,
            unit_quantity,
            subtotal,
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

  // Get receivable IDs to fetch last payment dates
  const receivableIds = (data as unknown as ReceivableWithRelations[])
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

  return (data as unknown as ReceivableWithRelations[]).map((row) => {
    const total = Number(row.total_amount ?? 0);
    const pending = Math.max(0, Number(row.pending_balance ?? 0));
    const status = deriveStatus(total, pending);
    const lastPaymentDate = row.id
      ? (lastPaymentDatesMap.get(row.id) ?? null)
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
      items: normalizeSaleItems(row),
      type: "receivable",
    };
  });
}

export async function getPayablesByOrgSlug(
  orgSlug: string
): Promise<PayableAccount[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

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

  // Get payable IDs to fetch last payment dates
  const payableIds = (data as unknown as PayableWithRelations[])
    .map((row) => row.id)
    .filter((id): id is string => id !== null && id !== undefined);

  // Fetch last payment dates for all payables
  const lastPaymentDatesMap = new Map<string, string | null>();
  if (payableIds.length > 0) {
    const { data: paymentsData } = await supabase
      .from("payable_payments" as never)
      .select("account_payable_id, payment_date")
      .in("account_payable_id", payableIds)
      .order("payment_date", { ascending: false });

    const payments = paymentsData as PayablePaymentRow[] | null;

    if (payments) {
      // Group by payable_id and get the latest payment_date
      for (const payment of payments) {
        const payableId = payment.account_payable_id;
        if (!lastPaymentDatesMap.has(payableId)) {
          lastPaymentDatesMap.set(payableId, payment.payment_date);
        }
      }
    }
  }

  return (data as unknown as PayableWithRelations[]).map((row) => {
    const total = Number(row.total_amount ?? 0);
    const pending = Math.max(0, Number(row.pending_balance ?? 0));
    const status = deriveStatus(total, pending);
    const lastPaymentDate = row.id
      ? (lastPaymentDatesMap.get(row.id) ?? null)
      : null;

    const purchase = normalizePurchase(row);
    const purchaseTotal = purchase?.total_amount
      ? Number(purchase.total_amount)
      : null;

    // Validate discrepancy: alert if difference is > 1% and there's a pending balance
    let hasDiscrepancy = false;
    let discrepancyAmount = 0;

    if (purchaseTotal !== null && purchaseTotal > 0 && pending > 0) {
      discrepancyAmount = Math.abs(total - purchaseTotal);
      const discrepancyPercent = (discrepancyAmount / purchaseTotal) * 100;

      if (discrepancyPercent > 1) {
        hasDiscrepancy = true;
      }
    }

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
      hasDiscrepancy,
      discrepancyAmount: hasDiscrepancy ? discrepancyAmount : undefined,
    };
  });
}

export async function getCollectionsData(orgSlug: string) {
  const [receivables, payables] = await Promise.all([
    getReceivablesByOrgSlug(orgSlug),
    getPayablesByOrgSlug(orgSlug),
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
  let remainingAmount = totalAmount;
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

    const pendingBalance = Number(account.pending_balance ?? 0);
    const totalAccountAmount = Number(account.total_amount ?? 0);
    const appliedAmount = Math.min(remainingAmount, pendingBalance);
    const newBalance = Math.max(0, pendingBalance - appliedAmount);
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

    remainingAmount -= appliedAmount;
  }

  return {
    distributions,
    accountsToUpdate,
    paymentsToInsert,
    appliedAmount: totalAmount - remainingAmount,
    creditBalance: remainingAmount,
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
      amount: p.amount,
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
        pending_balance: update.newBalance,
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
    amount: creditBalance,
    remaining_amount: creditBalance,
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

  if (totalAmount <= 0) {
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
      sale:sales_orders(invoice_number, sale_number)
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

  if (!pendingAccounts || pendingAccounts.length === 0) {
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
  } = calculateDistributions(pendingAccounts, totalAmount);

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
  if (totalAmount <= 0) {
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
      sale:sales_orders(invoice_number, sale_number)
    `)
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .in("status", ["PENDING", "PARTIALLY_PAID"])
    .gt("pending_balance", 0)
    .order("due_date", { ascending: true });

  if (error) {
    throw new Error(`Error al obtener cuentas: ${error.message}`);
  }

  if (!pendingAccounts || pendingAccounts.length === 0) {
    return [];
  }

  let remainingAmount = totalAmount;
  const distributions: BulkPaymentDistribution[] = [];

  for (const account of pendingAccounts) {
    if (remainingAmount <= 0) {
      break;
    }

    const pendingBalance = Number(account.pending_balance ?? 0);
    const totalAccountAmount = Number(account.total_amount ?? 0);
    const appliedAmount = Math.min(remainingAmount, pendingBalance);
    const newBalance = Math.max(0, pendingBalance - appliedAmount);
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

    remainingAmount -= appliedAmount;
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

  return data.reduce((sum, credit) => sum + Number(credit.remaining_amount), 0);
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

  return data;
}
