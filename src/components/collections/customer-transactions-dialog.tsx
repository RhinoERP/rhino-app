"use client";

import { ClockClockwiseIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { downloadPdfFromBase64 } from "@/lib/download-pdf";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { downloadReceiptAction } from "@/modules/collections/actions/download-receipt.action";
import {
  type CustomerPaymentEntry,
  getCustomerPaymentsAction,
} from "@/modules/collections/actions/get-customer-payments.action";

type CustomerTransactionsDialogProps = {
  orgSlug: string;
  customerId: string;
  customerName: string;
  trigger?: React.ReactNode;
};

type GroupedPayment = {
  id: string;
  totalAmount: number;
  payment_method: CustomerPaymentEntry["payment_method"];
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
  isBulk: boolean;
  count: number;
  items: CustomerPaymentEntry[];
};

const getPaymentLabel = (payment: CustomerPaymentEntry) => {
  if (payment.sale_number !== null) {
    return `Venta N° ${payment.sale_number}`;
  }
  if (payment.invoice_number) {
    return `Factura ${payment.invoice_number}`;
  }
  if (payment.account_receivable_id) {
    return `Cuenta ${payment.account_receivable_id.slice(0, 6)}`;
  }
  if (payment.source === "credit") {
    return "Crédito aplicado (histórico)";
  }
  return "Pago";
};

const formatPaymentMethodLabel = (method: string | null) => {
  if (!method) {
    return "—";
  }
  const normalized = method.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "—";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getPaymentMethodLabel = (payment: CustomerPaymentEntry) => {
  if (payment.source === "credit") {
    return "Crédito en cuenta";
  }
  return formatPaymentMethodLabel(payment.payment_method);
};

const getGroupPaymentDate = (items: CustomerPaymentEntry[]) => {
  let latest: string | null = null;
  for (const item of items) {
    if (!item.payment_date) {
      continue;
    }
    if (!latest) {
      latest = item.payment_date;
      continue;
    }
    const currentTs = new Date(item.payment_date).getTime();
    const latestTs = new Date(latest).getTime();
    if (currentTs > latestTs) {
      latest = item.payment_date;
    }
  }
  return latest ?? "";
};

const getBulkSalesList = (items: CustomerPaymentEntry[]) => {
  if (!items.length) {
    return "";
  }
  const labels = items.map((item) => getPaymentLabel(item));
  const uniqueLabels = Array.from(new Set(labels));
  return uniqueLabels.join(", ");
};

const getFallbackKey = (payment: CustomerPaymentEntry) =>
  [
    payment.created_at ?? "",
    payment.payment_date,
    payment.payment_method,
    payment.reference_number ?? "",
    payment.notes ?? "",
    payment.source,
  ].join("|");

const countFallbackKeys = (payments: CustomerPaymentEntry[]) => {
  const map = new Map<string, number>();
  for (const payment of payments) {
    if (payment.payment_group_id) {
      continue;
    }
    const key = getFallbackKey(payment);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
};

const resolveGroupKey = (
  payment: CustomerPaymentEntry,
  fallbackKey: string,
  shouldGroupFallback: boolean
) => {
  if (payment.source === "credit") {
    return {
      key: `credit:${payment.id}`,
      isBulk: false,
    };
  }
  if (payment.payment_group_id) {
    return {
      key: `group:${payment.payment_group_id}`,
      isBulk: true,
    };
  }
  if (shouldGroupFallback) {
    return {
      key: `bulk:${fallbackKey}`,
      isBulk: true,
    };
  }
  return {
    key: `single:${payment.id}`,
    isBulk: false,
  };
};

const addPaymentToGroup = (
  map: Map<string, GroupedPayment>,
  payment: CustomerPaymentEntry,
  key: string,
  isBulk: boolean
) => {
  const existing = map.get(key);
  const group =
    existing ??
    ({
      id: key,
      totalAmount: 0,
      payment_method: payment.payment_method,
      payment_date: payment.payment_date,
      reference_number: payment.reference_number,
      notes: payment.notes,
      created_at: payment.created_at,
      isBulk,
      count: 0,
      items: [],
    } satisfies GroupedPayment);

  group.totalAmount += payment.amount;
  group.count += 1;
  group.items.push(payment);
  map.set(key, group);
};

const groupCustomerPayments = (payments: CustomerPaymentEntry[]) => {
  const fallbackKeyCount = countFallbackKeys(payments);
  const map = new Map<string, GroupedPayment>();

  for (const payment of payments) {
    const fallbackKey = getFallbackKey(payment);
    const shouldGroupFallback = (fallbackKeyCount.get(fallbackKey) ?? 0) > 1;
    const { key, isBulk } = resolveGroupKey(
      payment,
      fallbackKey,
      shouldGroupFallback
    );
    addPaymentToGroup(map, payment, key, isBulk);
  }

  return Array.from(map.values()).sort((a, b) => {
    const dateA = new Date(a.payment_date).getTime();
    const dateB = new Date(b.payment_date).getTime();
    return dateB - dateA;
  });
};

export function CustomerTransactionsDialog({
  orgSlug,
  customerId,
  customerName,
  trigger,
}: CustomerTransactionsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<CustomerPaymentEntry[] | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<
    string | null
  >(null);

  const handleReceiptClick = async (payment: CustomerPaymentEntry) => {
    setDownloadingReceiptId(payment.id);

    try {
      const result = await downloadReceiptAction(orgSlug, payment.id);

      if (!result.success) {
        toast.error(result.error ?? "No se pudo descargar el recibo");
        return;
      }

      downloadPdfFromBase64(result.pdfBase64, result.filename);
      toast.success("Recibo descargado correctamente");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo descargar el recibo"
      );
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  useEffect(() => {
    if (!open || payments) {
      return;
    }

    startTransition(async () => {
      const result = await getCustomerPaymentsAction({
        orgSlug,
        customerId,
      });

      if (!result.success) {
        setError(result.error ?? "No se pudo obtener los pagos");
        return;
      }

      setPayments(result.data ?? []);
    });
  }, [customerId, open, orgSlug, payments]);

  const groupedPayments = useMemo<GroupedPayment[]>(() => {
    if (!payments?.length) {
      return [];
    }
    return groupCustomerPayments(payments);
  }, [payments]);

  const empty = useMemo(() => !payments || payments.length === 0, [payments]);

  return (
    <Dialog
      modal
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setError(null);
          return;
        }
        setPayments(null);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            className="h-8"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            size="sm"
            variant="outline"
          >
            Ver transacciones
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        onPointerDownOutside={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
      >
        <DialogHeader>
          <DialogTitle>Transacciones del cliente</DialogTitle>
          <DialogDescription>{customerName}</DialogDescription>
        </DialogHeader>
        <Separator />
        {isPending && (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
            <ClockClockwiseIcon
              className="h-5 w-5 animate-spin"
              weight="duotone"
            />
            <p className="text-sm">Cargando transacciones...</p>
          </div>
        )}
        {!isPending && error && (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-destructive">
            <p className="text-sm">No se pudo obtener las transacciones.</p>
            <p className="text-xs">{error}</p>
            <Button
              onClick={() => {
                setError(null);
                setPayments(null);
                setOpen(true);
              }}
              size="sm"
              variant="outline"
            >
              Reintentar
            </Button>
          </div>
        )}
        {!(isPending || error) && empty && (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
            <ClockClockwiseIcon className="h-5 w-5" weight="duotone" />
            <p className="text-sm">Sin pagos registrados aún.</p>
            <p className="text-xs">
              Los movimientos aparecerán aquí cuando registres pagos.
            </p>
          </div>
        )}
        {!(isPending || error || empty) && (
          <div className="space-y-3">
            {groupedPayments.map((payment) => {
              const label = payment.isBulk
                ? "Pago masivo"
                : getPaymentLabel(payment.items[0]);
              const paymentDate = getGroupPaymentDate(payment.items);
              const bulkSalesList = payment.isBulk
                ? getBulkSalesList(payment.items)
                : "";
              return (
                <div className="rounded-md border p-3 text-sm" key={payment.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{label}</p>
                      {bulkSalesList ? (
                        <p className="text-muted-foreground text-xs">
                          Ventas: {bulkSalesList}
                        </p>
                      ) : null}
                      <p className="text-muted-foreground text-xs">
                        Fecha de pago: {formatDateOnly(paymentDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-xs">
                        Método: {getPaymentMethodLabel(payment.items[0])}
                      </p>
                      <p className="font-semibold">
                        {formatCurrency(payment.totalAmount)}
                      </p>
                    </div>
                  </div>
                  {(payment.reference_number || payment.notes) && (
                    <div className="mt-2 text-muted-foreground text-xs">
                      {payment.reference_number ? (
                        <p>Referencia: {payment.reference_number}</p>
                      ) : null}
                      {payment.notes ? <p>Notas: {payment.notes}</p> : null}
                    </div>
                  )}
                  {payment.items.some((item) => item.source === "payment") && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {payment.items
                        .filter((item) => item.source === "payment")
                        .map((item) => (
                          <Button
                            disabled={downloadingReceiptId === item.id}
                            key={`receipt-${item.id}`}
                            onClick={() => handleReceiptClick(item)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {downloadingReceiptId === item.id ? (
                              <Spinner className="size-4" />
                            ) : (
                              <DownloadSimpleIcon className="h-3.5 w-3.5" />
                            )}
                            {item.receipt_number
                              ? `Recibo ${item.receipt_number}`
                              : "Generar recibo"}
                          </Button>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
