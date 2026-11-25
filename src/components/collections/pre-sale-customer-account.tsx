"use client";

import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCustomerOpenReceivablesAction } from "@/modules/collections/actions/get-customer-open-receivables.action";
import {
  openReceivablesCsv,
  summarizeOpenReceivables,
} from "@/modules/collections/utils/customer-open-receivables";

function todayInArgentina() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function CustomerOpenReceivablesSection({
  orgSlug,
  customerId,
  canReadCollections,
  compact = false,
}: {
  orgSlug: string;
  customerId: string;
  canReadCollections: boolean;
  compact?: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["pre-sale-customer-account", orgSlug, customerId],
    queryFn: () => getCustomerOpenReceivablesAction(orgSlug, customerId),
    enabled: Boolean(customerId && canReadCollections),
    retry: false,
    staleTime: 30_000,
  });
  if (!customerId) {
    return null;
  }

  const totals = summarizeOpenReceivables(data ?? [], todayInArgentina());

  async function downloadPendingInvoices() {
    setExporting(true);
    try {
      // Fetch again with server-side permission/scope checks, never trust cached rows.
      const accounts = await getCustomerOpenReceivablesAction(
        orgSlug,
        customerId
      );
      const blob = new Blob(["\ufeff", openReceivablesCsv(accounts)], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `facturas-pendientes-${customerId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudieron exportar las facturas pendientes");
    } finally {
      setExporting(false);
    }
  }

  let content: ReactNode;
  if (!canReadCollections) {
    content = (
      <p className="text-muted-foreground text-sm">
        No tenés permiso de lectura de cobranzas para consultar esta cuenta.
      </p>
    );
  } else if (isPending) {
    content = <output>Consultando facturas pendientes...</output>;
  } else if (isError) {
    content = (
      <div className="space-y-2">
        <p role="alert">No se pudo consultar la cuenta corriente.</p>
        <Button onClick={() => refetch()} type="button" variant="outline">
          Reintentar
        </Button>
      </div>
    );
  } else if (data?.length) {
    content = (
      <>
        {totals.map((total) => (
          <div
            className={cn(
              "grid gap-2 rounded-md border p-3 text-sm",
              compact ? "grid-cols-1" : "grid-cols-3"
            )}
            key={total.currency}
          >
            <div>
              <p className="text-muted-foreground">
                Pendiente ({total.currency})
              </p>
              <p className="font-semibold">
                {formatCurrency(total.total, total.currency)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Vencido</p>
              <p className="font-semibold text-destructive">
                {formatCurrency(total.overdue, total.currency)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">No vencido</p>
              <p className="font-semibold">
                {formatCurrency(total.notOverdue, total.currency)}
              </p>
            </div>
          </div>
        ))}
        <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
          {data.map((account) => (
            <li
              className="flex flex-wrap items-center justify-between gap-1 p-3 text-sm"
              key={account.id}
            >
              <span>
                {account.invoiceNumber ||
                  (account.saleNumber
                    ? `Venta ${account.saleNumber}`
                    : "Comprobante sin número")}
              </span>
              <span className="text-muted-foreground">
                Vence {account.dueDate.slice(0, 10)}
              </span>
              <strong>
                {formatCurrency(account.pendingBalance, account.currency)}
              </strong>
            </li>
          ))}
        </ul>
        <Button
          disabled={exporting}
          onClick={downloadPendingInvoices}
          type="button"
          variant="outline"
        >
          {exporting ? "Exportando..." : "Exportar facturas pendientes (CSV)"}
        </Button>
      </>
    );
  } else {
    content = (
      <p className="text-muted-foreground text-sm">
        No hay facturas pendientes visibles para tu usuario.
      </p>
    );
  }

  return <div className="space-y-4">{content}</div>;
}

export function PreSaleCustomerAccount({
  orgSlug,
  customerId,
  canReadCollections,
}: {
  orgSlug: string;
  customerId: string;
  canReadCollections: boolean;
}) {
  if (!customerId) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuenta corriente del cliente</CardTitle>
        <CardDescription>
          Facturas pendientes visibles para tu usuario. Los saldos a favor no se
          descuentan de estos importes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CustomerOpenReceivablesSection
          canReadCollections={canReadCollections}
          customerId={customerId}
          orgSlug={orgSlug}
        />
      </CardContent>
    </Card>
  );
}
