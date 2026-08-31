"use client";

import {
  CaretDownIcon,
  CaretRightIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { truncateMoney } from "@/lib/decimal";
import { downloadPdfFromBase64 } from "@/lib/download-pdf";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { downloadPaymentInvoiceAction } from "@/modules/collections/actions/download-payment-invoice.action";
import { downloadReceiptAction } from "@/modules/collections/actions/download-receipt.action";
import { getCustomerCreditsDisplayAction } from "@/modules/collections/actions/get-customer-credits-display.action";
import {
  getPaymentHistoryAction,
  type PaymentHistoryEntry,
} from "@/modules/collections/actions/get-payment-history.action";
import type {
  CustomerCreditDisplay,
  CustomerCreditEntry,
} from "@/modules/collections/service/collections.service";
import type {
  PayableAccount,
  ReceivableAccount,
} from "@/modules/collections/types";
import { useCustomerCreditNotes } from "@/modules/credit-notes/hooks/use-credit-notes";
import type { CreditNote } from "@/modules/credit-notes/types";
import { CollectionActionsMenu } from "./collection-actions-menu";
import { CurrentAccountsExportButton } from "./current-accounts-export-button";
import { CustomerBalanceDisplay } from "./customer-balance-display";
import { CustomerTransactionsDialog } from "./customer-transactions-dialog";
import { RegisterPaymentDialog } from "./register-payment-dialog";
import { SupplierBalanceDisplay } from "./supplier-balance-display";
import { SupplierTransactionsDialog } from "./supplier-transactions-dialog";

export type CustomerGroup = {
  id: string;
  name: string;
  fantasyName?: string | null;
  pending: number;
  creditBalance?: number;
  items: Array<{
    id: string;
    organizationId: string;
    label: string;
    dueDate: string;
    lastPaymentDate?: string | null;
    status: ReceivableAccount["status"];
    pending: number;
    total: number;
    currency: string;
    saleNumber?: number | null;
    invoiceNumber?: string | null;
    sellerName?: string | null;
    supplierName?: string | null;
    supplierId?: string | null;
    salesOrderId: string;
  }>;
};

export type SupplierGroup = {
  id: string;
  name: string;
  pending: number;
  items: Array<{
    id: string;
    organizationId: string;
    label: string;
    dueDate: string;
    lastPaymentDate?: string | null;
    status: PayableAccount["status"];
    pending: number;
    total: number;
    currency: string;
  }>;
};

const statusLabels: Record<
  CustomerGroup["items"][number]["status"],
  { label: string; badgeClass: string }
> = {
  PENDING: {
    label: "Pendiente",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  PARTIAL: {
    label: "Parcial",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-800",
  },
  PAID: {
    label: "Pagado",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
};

function deriveSupplierFromItems(
  items: ReceivableAccount["items"],
  accountSupplier?: ReceivableAccount["supplier"]
): string | null {
  if (!items || items.length === 0) {
    return accountSupplier?.name ?? null;
  }
  const names = [...new Set(items.map((i) => i.supplierName).filter(Boolean))];
  if (names.length === 0) {
    return accountSupplier?.name ?? null;
  }
  return names.length === 1 ? (names[0] as string) : "Varios";
}

function groupBalanceByCurrency(
  items: Array<{ currency: string; pending: number }>
): Array<{ currency: string; amount: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.currency, (map.get(item.currency) ?? 0) + (item.pending ?? 0));
  }
  return Array.from(map.entries()).map(([currency, amount]) => ({
    currency,
    amount,
  }));
}

function buildItemFromAccount(account: ReceivableAccount) {
  const saleNumber = account.sale?.sale_number;
  const invoice = account.sale?.invoice_number;
  // Advance invoices have their own fiscal sales_order and number. Keep that
  // document auditable, but describe it from the operational sale it advances.
  let label =
    account.collection_label ?? `Venta ${account.sales_order_id.slice(0, 6)}`;

  if (account.collection_label) {
    label = account.collection_label;
  } else if (saleNumber !== null && saleNumber !== undefined) {
    label = `Venta N° ${saleNumber}`;
  } else if (invoice) {
    label = `Venta ${invoice}`;
  }

  return {
    id: account.id,
    organizationId: account.organization_id,
    label,
    dueDate: account.due_date,
    lastPaymentDate: account.last_payment_date ?? null,
    status: account.status,
    pending: account.pending_balance,
    total: account.total_amount,
    currency: account.currency ?? "ARS",
    saleNumber: account.sale?.sale_number ?? null,
    invoiceNumber: account.sale?.invoice_number ?? null,
    sellerName: account.seller?.name ?? null,
    supplierName: deriveSupplierFromItems(account.items, account.supplier),
    supplierId: account.supplier?.id ?? null,
    salesOrderId: account.sales_order_id,
  };
}

function buildCustomerGroups(
  receivables: ReceivableAccount[]
): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();

  for (const account of receivables) {
    if (account.status === "PAID") {
      continue;
    }

    const existing = map.get(account.customer.id);
    const item = buildItemFromAccount(account);

    if (existing) {
      existing.pending += account.pending_balance;
      existing.items.push(item);
      continue;
    }

    const displayName =
      account.customer.fantasy_name || account.customer.business_name;

    map.set(account.customer.id, {
      id: account.customer.id,
      name: displayName,
      fantasyName: account.customer.fantasy_name,
      pending: account.pending_balance,
      items: [item],
    });
  }

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => {
        const aNumber = a.saleNumber ?? null;
        const bNumber = b.saleNumber ?? null;

        if (aNumber !== null && bNumber !== null) {
          return bNumber - aNumber;
        }
        if (aNumber !== null) {
          return -1;
        }
        if (bNumber !== null) {
          return 1;
        }

        return a.label.localeCompare(b.label);
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildSupplierGroups(payables: PayableAccount[]): SupplierGroup[] {
  const map = new Map<string, SupplierGroup>();

  for (const account of payables) {
    const existing = map.get(account.supplier.id);
    const label =
      account.purchase?.purchase_number !== undefined &&
      account.purchase?.purchase_number !== null
        ? `Compra ${String(account.purchase.purchase_number).padStart(6, "0")}`
        : `Orden ${account.purchase_order_id.slice(0, 6)}`;

    const item = {
      id: account.id,
      organizationId: account.organization_id,
      label,
      dueDate: account.due_date,
      lastPaymentDate: account.last_payment_date ?? null,
      status: account.status,
      pending: account.pending_balance,
      total: account.total_amount,
      currency: account.currency ?? "ARS",
    };

    if (existing) {
      existing.pending += account.pending_balance;
      existing.items.push(item);
      continue;
    }

    map.set(account.supplier.id, {
      id: account.supplier.id,
      name: account.supplier.name,
      pending: account.pending_balance,
      items: [item],
    });
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function SaleRow({
  item,
  group,
  orgSlug,
  type,
  ncs,
  credits,
  payments,
  isSaleExpanded,
  onToggleNcs,
  onEdited,
}: {
  item: CustomerGroup["items"][number];
  group: CustomerGroup;
  orgSlug: string;
  type: "receivable" | "payable";
  ncs: CreditNote[];
  credits: CustomerCreditDisplay[];
  payments: Array<{
    payment: PaymentHistoryEntry;
    isFinal: boolean;
    remaining: number;
  }>;
  isSaleExpanded: boolean;
  onToggleNcs: () => void;
  onEdited: (accountId: string) => void;
}) {
  const statusInfo = statusLabels[item.status] ?? statusLabels.PENDING;
  const hasExpandable =
    ncs.length > 0 || credits.length > 0 || payments.length > 0;
  const isReceivable = type === "receivable";

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <span className="mr-1 inline-flex w-5 shrink-0 items-center justify-center">
            <button
              className="inline-flex cursor-pointer items-center text-muted-foreground hover:text-foreground"
              onClick={onToggleNcs}
              type="button"
            >
              {isSaleExpanded ? (
                <CaretDownIcon className="h-3.5 w-3.5" />
              ) : (
                <CaretRightIcon className="h-3.5 w-3.5" />
              )}
            </button>
          </span>
          {item.label}
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {formatDateOnly(item.dueDate)}
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {item.lastPaymentDate ? formatDateOnly(item.lastPaymentDate) : "—"}
        </TableCell>
        <TableCell className="text-sm">
          <Badge
            className={`rounded-full ${statusInfo.badgeClass}`}
            variant="outline"
          >
            {statusInfo.label}
          </Badge>
        </TableCell>
        {isReceivable && (
          <>
            <TableCell className="text-muted-foreground text-sm">
              {item.sellerName ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {item.supplierName ?? "—"}
            </TableCell>
          </>
        )}
        <TableCell className="text-right text-sm">
          {formatCurrency(item.total, item.currency)}
        </TableCell>
        <TableCell className="text-right font-semibold">
          {formatCurrency(item.pending, item.currency)}
        </TableCell>
        <TableCell className="text-right">
          <CollectionActionsMenu
            accountId={item.id}
            counterpartyId={group.id}
            counterpartyName={group.name}
            currency={item.currency}
            dueDate={item.dueDate}
            orgId={item.organizationId}
            orgSlug={orgSlug}
            pendingBalance={item.pending}
            supplierId={item.supplierId}
            totalAmount={item.total}
            type={type}
          />
        </TableCell>
      </TableRow>
      {isSaleExpanded && !hasExpandable && (
        <TableRow className="bg-muted/30">
          <TableCell
            className="py-2 text-muted-foreground text-xs"
            colSpan={isReceivable ? 9 : 7}
          >
            Sin pagos registrados para esta operación.
          </TableCell>
        </TableRow>
      )}
      {isSaleExpanded &&
        payments.map(({ payment, isFinal, remaining }) => (
          <PaymentSubRow
            accountId={item.id}
            counterpartyId={group.id}
            counterpartyName={group.name}
            currency={item.currency}
            dueDate={item.dueDate}
            isFinal={isFinal}
            key={`payment-${payment.id}`}
            onEdited={() => onEdited(item.id)}
            orgId={item.organizationId}
            orgSlug={orgSlug}
            payment={payment}
            pendingBalance={item.pending}
            remaining={remaining}
            totalAmount={item.total}
            type={type}
          />
        ))}
      {isSaleExpanded &&
        ncs.map((nc) => (
          <NcSubRow currency={item.currency} key={`nc-${nc.id}`} nc={nc} />
        ))}
      {isSaleExpanded &&
        credits.map((credit) => (
          <CreditSubRow
            credit={credit}
            currency={item.currency}
            key={`credit-${credit.id}`}
          />
        ))}
    </>
  );
}

function PaymentSubRow({
  payment,
  isFinal,
  remaining,
  currency = "ARS",
  orgSlug,
  type,
  accountId,
  counterpartyId,
  counterpartyName,
  pendingBalance,
  totalAmount,
  orgId,
  dueDate,
  onEdited,
}: {
  payment: PaymentHistoryEntry;
  isFinal: boolean;
  remaining: number;
  currency?: string;
  orgSlug: string;
  type: "receivable" | "payable";
  accountId: string;
  counterpartyId: string;
  counterpartyName: string;
  pendingBalance: number;
  totalAmount: number;
  orgId?: string;
  dueDate?: string | null;
  onEdited: () => void;
}) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);

    try {
      const result =
        type === "receivable"
          ? await downloadReceiptAction(orgSlug, payment.id)
          : await downloadPaymentInvoiceAction(orgSlug, payment.id);

      if (!result.success) {
        toast.error(
          result.error ??
            (type === "receivable"
              ? "No se pudo descargar el recibo"
              : "No se pudo descargar la factura")
        );
        return;
      }

      downloadPdfFromBase64(result.pdfBase64, result.filename);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo descargar el documento"
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const methodLabel = payment.payment_method.replaceAll("_", " ");
  const isReceivable = type === "receivable";
  const hasDocument = isReceivable || Boolean(payment.invoice_pdf_url);

  return (
    <TableRow className="bg-muted/30">
      <TableCell className="pl-8 text-xs">
        <p className="font-medium text-foreground">Pago</p>
        <p className="text-muted-foreground">{methodLabel}</p>
        {isReceivable && payment.receipt_number ? (
          <p className="text-muted-foreground">
            Recibo {payment.receipt_number}
          </p>
        ) : null}
        {!isReceivable && payment.invoice_filename ? (
          <p className="text-muted-foreground">
            Factura: {payment.invoice_filename}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">—</TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {formatDateOnly(payment.payment_date)}
      </TableCell>
      <TableCell className="text-xs">
        <Badge
          className={
            isFinal
              ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
              : "rounded-full border-blue-200 bg-blue-50 text-blue-800"
          }
          variant="outline"
        >
          {isFinal ? "Total" : "Parcial"}
        </Badge>
      </TableCell>
      {isReceivable ? (
        <>
          <TableCell className="text-xs">—</TableCell>
          <TableCell className="text-xs">—</TableCell>
        </>
      ) : null}
      <TableCell className="text-right text-xs">
        <span className="font-medium text-emerald-600">
          {formatCurrency(payment.amount, currency)}
        </span>
      </TableCell>
      <TableCell className="text-right text-xs">
        {formatCurrency(remaining, currency)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1.5">
          {hasDocument ? (
            <Button
              disabled={isDownloading}
              onClick={handleDownload}
              size="sm"
              type="button"
              variant="outline"
            >
              {isDownloading ? (
                <Spinner className="size-3.5" />
              ) : (
                <DownloadSimpleIcon className="h-3.5 w-3.5" />
              )}
              {isReceivable ? "Recibo" : "Factura"}
            </Button>
          ) : (
            <span className="text-muted-foreground text-xs">Sin factura</span>
          )}
          <RegisterPaymentDialog
            accountId={accountId}
            counterpartyId={counterpartyId}
            counterpartyName={counterpartyName}
            currency={currency}
            dueDate={dueDate}
            existingPayment={{
              id: payment.id,
              amount: payment.amount,
              payment_method: payment.payment_method,
              payment_date: payment.payment_date,
              reference_number: payment.reference_number,
              notes: payment.notes,
            }}
            onCompleted={onEdited}
            orgId={orgId}
            orgSlug={orgSlug}
            pendingBalance={pendingBalance}
            totalAmount={totalAmount}
            trigger={
              <Button size="sm" type="button" variant="outline">
                Editar
              </Button>
            }
            type={type}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

const NC_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  CANCELLED: {
    label: "Cancelada",
    className: "border-gray-200 bg-gray-50 text-gray-500 line-through",
  },
  EXHAUSTED: {
    label: "Agotada",
    className: "border-orange-200 bg-orange-50 text-orange-700",
  },
  CONFIRMED: {
    label: "Confirmada",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

function getNcStatusKey(nc: CreditNote): string {
  if (nc.status === "CANCELLED") {
    return "CANCELLED";
  }
  if ((nc.remainingAmount ?? 0) === 0) {
    return "EXHAUSTED";
  }
  return "CONFIRMED";
}

function NcSubRow({
  nc,
  currency = "ARS",
}: {
  nc: CreditNote;
  currency?: string;
}) {
  const statusKey = getNcStatusKey(nc);
  const statusInfo = NC_STATUS_BADGE[statusKey];
  const isExhausted = statusKey === "EXHAUSTED";

  return (
    <TableRow
      className={isExhausted ? "bg-muted/30 opacity-50" : "bg-muted/30"}
    >
      <TableCell className="pl-8 font-medium text-muted-foreground text-xs">
        NC-{nc.creditNoteNumber ?? nc.id.slice(0, 6)}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {formatDateOnly(nc.issueDate)}
      </TableCell>
      <TableCell className="text-xs">—</TableCell>
      <TableCell className="text-xs">
        <Badge
          className={`rounded-full ${statusInfo.className}`}
          variant="outline"
        >
          {statusInfo.label}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">—</TableCell>
      <TableCell className="text-xs">{nc.supplierName ?? "—"}</TableCell>
      <TableCell className="text-right text-xs">
        <span className="text-red-600">
          -{formatCurrency(nc.amount, currency)}
        </span>
      </TableCell>
      <TableCell className="text-right text-muted-foreground text-xs">
        {nc.status === "CANCELLED"
          ? "—"
          : formatCurrency(nc.remainingAmount ?? 0, currency)}
      </TableCell>
      <TableCell />
    </TableRow>
  );
}

function CustomerNcFetcher({
  orgSlug,
  customerId,
  onData,
}: {
  orgSlug: string;
  customerId: string;
  onData: (ncs: CreditNote[]) => void;
}) {
  const { data } = useCustomerCreditNotes(orgSlug, customerId, true);
  const prevDataRef = useRef(data);

  useEffect(() => {
    if (data && data !== prevDataRef.current) {
      prevDataRef.current = data;
      onData(data);
    }
  }, [data, onData]);

  return null;
}

function CreditSubRow({
  credit,
  currency = "ARS",
}: {
  credit: CustomerCreditDisplay;
  currency?: string;
}) {
  const label = credit.source === "return" ? "Devolución" : "Saldo a favor";
  const isApplied = credit.remainingAmount === 0;

  return (
    <TableRow className={isApplied ? "bg-muted/30 opacity-50" : "bg-muted/30"}>
      <TableCell className="pl-8 font-medium text-muted-foreground text-xs">
        {label}
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {formatDateOnly(credit.createdAt)}
      </TableCell>
      <TableCell className="text-xs">—</TableCell>
      <TableCell className="text-xs">
        <Badge
          className={
            isApplied
              ? "rounded-full border-gray-200 bg-gray-50 text-gray-500"
              : "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
          }
          variant="outline"
        >
          {isApplied ? "Aplicado" : "Acreditado"}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">—</TableCell>
      <TableCell className="text-xs">{credit.supplierName ?? "—"}</TableCell>
      <TableCell className="text-right text-xs">
        <span className="text-red-600">
          -{formatCurrency(credit.amount, currency)}
        </span>
      </TableCell>
      <TableCell className="text-right text-muted-foreground text-xs">
        {isApplied ? "—" : formatCurrency(credit.remainingAmount, currency)}
      </TableCell>
      <TableCell />
    </TableRow>
  );
}

function CustomerCreditFetcher({
  orgSlug,
  customerId,
  onData,
}: {
  orgSlug: string;
  customerId: string;
  onData: (credits: CustomerCreditDisplay[]) => void;
}) {
  const { data } = useQuery({
    queryKey: ["customer-credits-display", orgSlug, customerId],
    queryFn: () => getCustomerCreditsDisplayAction(orgSlug, customerId),
    staleTime: 30_000,
  });
  const prevDataRef = useRef(data);

  useEffect(() => {
    if (data && data !== prevDataRef.current) {
      prevDataRef.current = data;
      onData(data);
    }
  }, [data, onData]);

  return null;
}

function SalePaymentsFetcher({
  orgSlug,
  accountId,
  type,
  onData,
}: {
  orgSlug: string;
  accountId: string;
  type: "receivable" | "payable";
  onData: (payments: PaymentHistoryEntry[]) => void;
}) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    let cancelled = false;

    getPaymentHistoryAction({
      orgSlug,
      accountId,
      type,
    }).then((result) => {
      if (!cancelled && result.success) {
        onDataRef.current(result.data ?? []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [orgSlug, accountId, type]);

  return null;
}

function buildPaymentRows(
  paymentsByAccount: Map<string, PaymentHistoryEntry[]>,
  item: { id: string; status: ReceivableAccount["status"]; total: number }
) {
  const sorted = [...(paymentsByAccount.get(item.id) ?? [])].sort((a, b) =>
    a.payment_date.localeCompare(b.payment_date)
  );

  let cumulative = 0;
  return sorted.map((payment, index) => {
    cumulative = truncateMoney(cumulative + payment.amount);
    const isFinal = item.status === "PAID" && index === sorted.length - 1;
    const remaining = isFinal
      ? 0
      : truncateMoney(Math.max(0, item.total - cumulative));

    return { payment, isFinal, remaining };
  });
}

function GroupList({
  placeholder,
  groups,
  orgSlug,
  type,
}: {
  placeholder: string;
  groups: Array<CustomerGroup | SupplierGroup>;
  orgSlug: string;
  type: "receivable" | "payable";
}) {
  const [query, setQuery] = useState("");
  const [selectedSeller, setSelectedSeller] = useState<string>("all");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [expandedSaleRowIds, setExpandedSaleRowIds] = useState<Set<string>>(
    new Set()
  );
  const [customerNcs, setCustomerNcs] = useState<Map<string, CreditNote[]>>(
    new Map()
  );
  const [customerCredits, setCustomerCredits] = useState<
    Map<string, CustomerCreditDisplay[]>
  >(new Map());
  const [salePayments, setSalePayments] = useState<
    Map<string, PaymentHistoryEntry[]>
  >(new Map());
  const [paymentsVersion, setPaymentsVersion] = useState<Map<string, number>>(
    new Map()
  );
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<string>>(
    new Set()
  );

  const refreshPayments = useCallback((accountId: string) => {
    setSalePayments((prev) => {
      const next = new Map(prev);
      next.delete(accountId);
      return next;
    });
    setPaymentsVersion((prev) => {
      const next = new Map(prev);
      next.set(accountId, (next.get(accountId) ?? 0) + 1);
      return next;
    });
  }, []);

  const toggleSaleRow = useCallback((rowKey: string) => {
    setExpandedSaleRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  }, []);

  const handleCustomerOpenChange = useCallback(
    (customerId: string, open: boolean) => {
      setExpandedCustomerIds((prev) => {
        const next = new Set(prev);
        if (open) {
          next.add(customerId);
        } else {
          next.delete(customerId);
        }
        return next;
      });
    },
    []
  );

  const sellerOptions = useMemo(() => {
    if (type !== "receivable") {
      return [];
    }
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const item of group.items) {
        const customerItem = item as CustomerGroup["items"][number];
        if (
          customerItem.sellerName &&
          (selectedSupplier === "all" ||
            customerItem.supplierName === selectedSupplier)
        ) {
          map.set(customerItem.sellerName, customerItem.sellerName);
        }
      }
    }
    return Array.from(map.keys()).sort();
  }, [groups, type, selectedSupplier]);

  const supplierOptions = useMemo(() => {
    if (type !== "receivable") {
      return [];
    }
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const item of group.items) {
        const customerItem = item as CustomerGroup["items"][number];
        if (
          customerItem.supplierName &&
          (selectedSeller === "all" ||
            customerItem.sellerName === selectedSeller)
        ) {
          map.set(customerItem.supplierName, customerItem.supplierName);
        }
      }
    }
    return Array.from(map.keys()).sort();
  }, [groups, type, selectedSeller]);

  const filtered = useMemo(() => {
    let result = groups;

    if (query.trim()) {
      const lowered = query.toLowerCase();
      result = result.filter((group) =>
        group.name.toLowerCase().includes(lowered)
      );
    }

    if (
      type === "receivable" &&
      (selectedSeller !== "all" || selectedSupplier !== "all")
    ) {
      result = result
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            const customerItem = item as CustomerGroup["items"][number];
            const matchesSeller =
              selectedSeller === "all" ||
              customerItem.sellerName === selectedSeller;
            const matchesSupplier =
              selectedSupplier === "all" ||
              customerItem.supplierName === selectedSupplier;
            return matchesSeller && matchesSupplier;
          }),
        }))
        .filter((group) => group.items.length > 0);
    }

    return result;
  }, [groups, query, type, selectedSeller, selectedSupplier]);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-full sm:w-64"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            value={query}
          />
          {type === "receivable" && sellerOptions.length > 0 && (
            <Select
              onValueChange={(v) => {
                setSelectedSeller(v);
              }}
              value={selectedSeller}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los vendedores</SelectItem>
                {sellerOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {type === "receivable" && supplierOptions.length > 0 && (
            <Select
              onValueChange={(v) => {
                setSelectedSupplier(v);
              }}
              value={selectedSupplier}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                {supplierOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <CurrentAccountsExportButton
          groups={filtered}
          orgSlug={orgSlug}
          type={type}
        />
      </div>

      {type === "receivable" &&
        [...expandedCustomerIds].map((customerId) => (
          <CustomerNcFetcher
            customerId={customerId}
            key={customerId}
            onData={(ncs) =>
              setCustomerNcs((prev) => new Map(prev).set(customerId, ncs))
            }
            orgSlug={orgSlug}
          />
        ))}
      {type === "receivable" &&
        [...expandedCustomerIds].map((customerId) => (
          <CustomerCreditFetcher
            customerId={customerId}
            key={`credit-${customerId}`}
            onData={(credits) =>
              setCustomerCredits((prev) =>
                new Map(prev).set(customerId, credits)
              )
            }
            orgSlug={orgSlug}
          />
        ))}
      {groups
        .flatMap((group) => group.items)
        .filter((item) => {
          const customerItem = item as CustomerGroup["items"][number];
          const expansionKey =
            type === "receivable" ? customerItem.salesOrderId : item.id;
          return expandedSaleRowIds.has(expansionKey);
        })
        .map((item) => (
          <SalePaymentsFetcher
            accountId={item.id}
            key={`payments-${item.id}-${item.pending}-${item.lastPaymentDate ?? ""}-${paymentsVersion.get(item.id) ?? 0}`}
            onData={(payments) =>
              setSalePayments((prev) => new Map(prev).set(item.id, payments))
            }
            orgSlug={orgSlug}
            type={type}
          />
        ))}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card className="flex h-28 items-center justify-center text-muted-foreground text-sm">
            No hay cuentas para mostrar.
          </Card>
        ) : (
          filtered.map((group) => (
            <Collapsible
              className="rounded-md border bg-card px-3 py-2"
              key={group.id}
              onOpenChange={(open) => handleCustomerOpenChange(group.id, open)}
              open={expandedCustomerIds.has(group.id)}
            >
              <div className="flex w-full items-center justify-between gap-3 text-left">
                <div className="space-y-0.5">
                  <p className="font-semibold">{group.name}</p>
                  {"fantasyName" in group && group.fantasyName ? (
                    <p className="text-muted-foreground text-xs">
                      {group.fantasyName}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "movimiento" : "movimientos"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {type === "receivable" ? (
                    <>
                      <CustomerBalanceDisplay
                        byCurrency={groupBalanceByCurrency(group.items)}
                        customerId={group.id}
                        orgSlug={orgSlug}
                      />
                      <CustomerTransactionsDialog
                        customerId={group.id}
                        customerName={group.name}
                        orgSlug={orgSlug}
                        trigger={
                          <Button
                            className="h-8"
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                            size="sm"
                            variant="outline"
                          >
                            Ver transacciones
                          </Button>
                        }
                      />
                    </>
                  ) : (
                    <>
                      <SupplierBalanceDisplay
                        byCurrency={groupBalanceByCurrency(group.items)}
                        orgSlug={orgSlug}
                        supplierId={group.id}
                      />
                      <SupplierTransactionsDialog
                        orgSlug={orgSlug}
                        supplierId={group.id}
                        supplierName={group.name}
                        trigger={
                          <Button
                            className="h-8"
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                            size="sm"
                            variant="outline"
                          >
                            Ver transacciones
                          </Button>
                        }
                      />
                    </>
                  )}
                  <CollapsibleTrigger asChild>
                    <Button className="h-8" size="sm" variant="outline">
                      <CaretDownIcon className="h-3.5 w-3.5" weight="duotone" />
                      Ver detalle
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>
              <CollapsibleContent className="pt-3">
                <Separator className="mb-3" />
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <span className="mr-1 inline-flex w-5 shrink-0" />
                          Documento
                        </TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead>Último pago</TableHead>
                        <TableHead>Estado</TableHead>
                        {type === "receivable" && (
                          <>
                            <TableHead>Vendedor</TableHead>
                            <TableHead>Proveedor</TableHead>
                          </>
                        )}
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Pendiente</TableHead>
                        <TableHead className="w-12 text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item) => {
                        const customerItem =
                          item as CustomerGroup["items"][number];
                        const saleNcs =
                          type === "receivable"
                            ? (customerNcs.get(group.id) ?? []).filter(
                                (nc) =>
                                  nc.salesOrderId === customerItem.salesOrderId
                              )
                            : [];
                        const credits =
                          type === "receivable"
                            ? (customerCredits.get(group.id) ?? []).filter(
                                (c) =>
                                  c.salesOrderId === customerItem.salesOrderId
                              )
                            : [];
                        const expansionKey =
                          type === "receivable"
                            ? customerItem.salesOrderId
                            : item.id;
                        const isSaleExpanded =
                          expandedSaleRowIds.has(expansionKey);

                        const paymentRows = buildPaymentRows(
                          salePayments,
                          customerItem
                        );

                        return (
                          <SaleRow
                            credits={credits}
                            group={group as CustomerGroup}
                            isSaleExpanded={isSaleExpanded}
                            item={customerItem}
                            key={item.id}
                            ncs={saleNcs}
                            onEdited={refreshPayments}
                            onToggleNcs={() => toggleSaleRow(expansionKey)}
                            orgSlug={orgSlug}
                            payments={paymentRows}
                            type={type}
                          />
                        );
                      })}
                      {type === "receivable" &&
                        (() => {
                          const standaloneNcs = (
                            customerNcs.get(group.id) ?? []
                          ).filter(
                            (nc) =>
                              !nc.salesOrderId &&
                              nc.status !== "CANCELLED" &&
                              (nc.remainingAmount ?? 0) > 0
                          );
                          if (standaloneNcs.length === 0) {
                            return null;
                          }
                          return (
                            <>
                              <TableRow className="bg-muted/20 hover:bg-muted/20">
                                <TableCell
                                  className="py-2 text-muted-foreground text-xs"
                                  colSpan={9}
                                >
                                  Notas de crédito sin venta asociada
                                </TableCell>
                              </TableRow>
                              {standaloneNcs.map((nc) => (
                                <NcSubRow
                                  currency={group.items[0]?.currency}
                                  key={`standalone-nc-${nc.id}`}
                                  nc={nc}
                                />
                              ))}
                            </>
                          );
                        })()}
                      {type === "receivable" &&
                        (() => {
                          const standaloneCredits = (
                            customerCredits.get(group.id) ?? []
                          ).filter((c) => !c.salesOrderId);
                          if (standaloneCredits.length === 0) {
                            return null;
                          }
                          return (
                            <>
                              <TableRow className="bg-muted/20 hover:bg-muted/20">
                                <TableCell
                                  className="py-2 text-muted-foreground text-xs"
                                  colSpan={9}
                                >
                                  Créditos a favor sin venta asociada
                                </TableCell>
                              </TableRow>
                              {standaloneCredits.map((credit) => (
                                <CreditSubRow
                                  credit={credit}
                                  currency={group.items[0]?.currency}
                                  key={`standalone-credit-${credit.id}`}
                                />
                              ))}
                            </>
                          );
                        })()}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))
        )}
      </div>
    </section>
  );
}

export function CurrentAccounts({
  receivables,
  payables,
  orgSlug,
  creditOnlyCustomers = [],
}: {
  receivables?: ReceivableAccount[];
  payables?: PayableAccount[];
  orgSlug: string;
  creditOnlyCustomers?: CustomerCreditEntry[];
}) {
  const customerGroups = useMemo(() => {
    const base = buildCustomerGroups(receivables ?? []);
    const merged = new Map(base.map((g) => [g.id, g]));
    for (const entry of creditOnlyCustomers) {
      const existing = merged.get(entry.customerId);
      if (existing) {
        existing.creditBalance =
          (existing.creditBalance ?? 0) + entry.creditBalance;
      } else {
        merged.set(entry.customerId, {
          id: entry.customerId,
          name: entry.name,
          fantasyName: entry.fantasyName,
          pending: 0,
          creditBalance: entry.creditBalance,
          items: [],
        });
      }
    }
    return Array.from(merged.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [receivables, creditOnlyCustomers]);

  const supplierGroups = useMemo(
    () => buildSupplierGroups(payables ?? []),
    [payables]
  );

  if (receivables && !payables) {
    return (
      <div className="space-y-6">
        <GroupList
          groups={customerGroups}
          orgSlug={orgSlug}
          placeholder="Buscar cliente..."
          type="receivable"
        />
      </div>
    );
  }
  if (payables && !receivables) {
    return (
      <GroupList
        groups={supplierGroups}
        orgSlug={orgSlug}
        placeholder="Buscar proveedor..."
        type="payable"
      />
    );
  }

  return (
    <div className="space-y-8">
      <GroupList
        groups={customerGroups}
        orgSlug={orgSlug}
        placeholder="Buscar cliente..."
        type="receivable"
      />
      <GroupList
        groups={supplierGroups}
        orgSlug={orgSlug}
        placeholder="Buscar proveedor..."
        type="payable"
      />
    </div>
  );
}
