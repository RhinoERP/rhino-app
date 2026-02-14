import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PosSale } from "@/modules/pos-sales/types";

type DirectSalesTableProps = {
  orgSlug: string;
  sales: PosSale[];
};

function resolveCustomerName(sale: PosSale): string {
  if (!sale.customer) {
    return "Consumidor final";
  }

  return sale.customer.fantasy_name || sale.customer.business_name;
}

function formatPaymentMethod(paymentMethod: string): string {
  const normalized = paymentMethod.toLowerCase().trim();

  const labels: Record<string, string> = {
    efectivo: "Efectivo",
    transferencia: "Transferencia",
    cheque: "Cheque",
    "tarjeta de credito": "Tarjeta crédito",
    "tarjeta de debito": "Tarjeta débito",
    tarjeta_credito: "Tarjeta crédito",
    tarjeta_debito: "Tarjeta débito",
    tarjeta_de_credito: "Tarjeta crédito",
    tarjeta_de_debito: "Tarjeta débito",
  };

  return labels[normalized] ?? paymentMethod;
}

function getPaymentSummary(sale: PosSale): string {
  if (!sale.payments.length) {
    return "Sin pago";
  }

  const uniqueMethods = Array.from(
    new Set(
      sale.payments.map((payment) =>
        formatPaymentMethod(String(payment.payment_method))
      )
    )
  );

  return uniqueMethods.join(", ");
}

function getSaleStatusLabel(status: string | null): {
  label: string;
  className: string;
} {
  const normalized = status?.toUpperCase().trim() ?? "COMPLETED";

  if (normalized === "COMPLETED") {
    return {
      label: "Completada",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }

  if (normalized === "CANCELLED") {
    return {
      label: "Cancelada",
      className: "bg-red-50 text-red-700 border-red-200",
    };
  }

  return {
    label: normalized,
    className: "bg-muted text-muted-foreground border-muted",
  };
}

export function DirectSalesTable({ orgSlug, sales }: DirectSalesTableProps) {
  if (sales.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Empty>
            <EmptyContent>
              <EmptyTitle>No hay ventas directas registradas</EmptyTitle>
              <EmptyDescription>
                Crea la primera venta directa para empezar a cobrar en el
                momento.
              </EmptyDescription>
              <Button asChild>
                <Link href={`/org/${orgSlug}/venta-directa/nueva`}>
                  Nueva venta directa
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ventas directas</CardTitle>
        <CardDescription>
          Operaciones de mostrador cobradas en el momento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Ítems</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => {
              const status = getSaleStatusLabel(sale.status);

              return (
                <TableRow key={sale.id}>
                  <TableCell>
                    {sale.sale_date
                      ? formatDate(sale.sale_date, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>{resolveCustomerName(sale)}</TableCell>
                  <TableCell>{sale.receipt_number ?? "—"}</TableCell>
                  <TableCell>
                    {sale.items.length}{" "}
                    {sale.items.length === 1 ? "ítem" : "ítems"}
                  </TableCell>
                  <TableCell>{getPaymentSummary(sale)}</TableCell>
                  <TableCell>
                    <Badge className={status.className} variant="outline">
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(sale.total_amount)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
