"use client";

import { ClockClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, useTransition } from "react";
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
import { formatCurrency, formatDateOnly } from "@/lib/format";
import {
  getSupplierPaymentsAction,
  type SupplierPaymentEntry,
} from "@/modules/collections/actions/get-supplier-payments.action";

type SupplierTransactionsDialogProps = {
  orgSlug: string;
  supplierId: string;
  supplierName: string;
  trigger?: React.ReactNode;
};

type GroupedPayment = {
  id: string;
  totalAmount: number;
  payment_method: SupplierPaymentEntry["payment_method"];
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
  isBulk: boolean;
  count: number;
  items: SupplierPaymentEntry[];
};

const getPaymentLabel = (payment: SupplierPaymentEntry) => {
  if (payment.purchase_number !== null) {
    return `Compra N° ${String(payment.purchase_number).padStart(6, "0")}`;
  }
  if (payment.purchase_order_id) {
    return `Orden ${payment.purchase_order_id.slice(0, 6)}`;
  }
  if (payment.account_payable_id) {
    return `Cuenta ${payment.account_payable_id.slice(0, 6)}`;
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

const getGroupPaymentDate = (items: SupplierPaymentEntry[]) => {
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

const getBulkPurchasesList = (items: SupplierPaymentEntry[]) => {
  if (!items.length) {
    return "";
  }
  const labels = items.map((item) => getPaymentLabel(item));
  const uniqueLabels = Array.from(new Set(labels));
  return uniqueLabels.join(", ");
};

const getFallbackKey = (payment: SupplierPaymentEntry) =>
  [
    payment.created_at ?? "",
    payment.payment_date,
    payment.payment_method,
    payment.reference_number ?? "",
    payment.notes ?? "",
    payment.account_payable_id ?? "",
  ].join("|");

const countFallbackKeys = (payments: SupplierPaymentEntry[]) => {
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
  payment: SupplierPaymentEntry,
  fallbackKey: string,
  shouldGroupFallback: boolean
) => {
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
  payment: SupplierPaymentEntry,
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

const groupSupplierPayments = (payments: SupplierPaymentEntry[]) => {
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

export function SupplierTransactionsDialog({
  orgSlug,
  supplierId,
  supplierName,
  trigger,
}: SupplierTransactionsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<SupplierPaymentEntry[] | null>(null);

  useEffect(() => {
    if (!open || payments) {
      return;
    }

    startTransition(async () => {
      const result = await getSupplierPaymentsAction({
        orgSlug,
        supplierId,
      });

      if (!result.success) {
        setError(result.error ?? "No se pudo obtener los pagos");
        return;
      }

      setPayments(result.data ?? []);
    });
  }, [open, orgSlug, payments, supplierId]);

  const groupedPayments = useMemo<GroupedPayment[]>(() => {
    if (!payments?.length) {
      return [];
    }
    return groupSupplierPayments(payments);
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
          <DialogTitle>Transacciones del proveedor</DialogTitle>
          <DialogDescription>{supplierName}</DialogDescription>
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
              const bulkPurchasesList = payment.isBulk
                ? getBulkPurchasesList(payment.items)
                : "";
              return (
                <div className="rounded-md border p-3 text-sm" key={payment.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{label}</p>
                      {bulkPurchasesList ? (
                        <p className="text-muted-foreground text-xs">
                          Compras: {bulkPurchasesList}
                        </p>
                      ) : null}
                      <p className="text-muted-foreground text-xs">
                        Fecha de pago: {formatDateOnly(paymentDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-xs">
                        Método:{" "}
                        {formatPaymentMethodLabel(
                          payment.items[0].payment_method
                        )}
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
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
