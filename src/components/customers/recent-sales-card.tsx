"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileText, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { CustomerSale } from "@/modules/customers/types";
import { INVOICE_TYPE_LABELS } from "@/modules/sales/invoice-type-utils";

type RecentSalesCardProps = {
  orgSlug: string;
  sales: CustomerSale[];
};

const statusLabels: Record<
  CustomerSale["status"],
  { label: string; className: string }
> = {
  DRAFT: { label: "Borrador", className: "text-gray-600 bg-gray-50" },
  CONFIRMED: { label: "Confirmado", className: "text-blue-600 bg-blue-50" },
  DISPATCH: { label: "Despachado", className: "text-amber-600 bg-amber-50" },
  DELIVERED: {
    label: "Entregado",
    className: "text-emerald-600 bg-emerald-50",
  },
  CANCELLED: { label: "Cancelado", className: "text-red-600 bg-red-50" },
  INCOMPLETE: {
    label: "Incompleta",
    className: "text-yellow-600 bg-yellow-50",
  },
};

const invoiceTypeLabels: Record<CustomerSale["invoice_type"], string> = {
  ...INVOICE_TYPE_LABELS,
  NOTA_DE_VENTA: "Nota de Venta",
};

export function RecentSalesCard({ orgSlug, sales }: RecentSalesCardProps) {
  if (sales.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="flex items-center gap-2 border-b p-4">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Ventas recientes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileText className="h-6 w-6" />
          </div>
          <p className="text-sm">Este cliente no tiene ventas registradas</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex items-center gap-2 border-b p-4">
        <ShoppingCart className="h-5 w-5 text-muted-foreground" />
        <CardTitle className="text-base">Ventas recientes</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {sales.map((sale) => {
            const statusInfo = statusLabels[sale.status];
            return (
              <Link
                className="block p-4 transition-colors hover:bg-muted/50"
                href={`/org/${orgSlug}/ventas/${sale.id}`}
                key={sale.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">
                        Venta #{sale.sale_number ?? "S/N"}
                      </p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-medium text-xs ${statusInfo.className}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {format(new Date(sale.sale_date), "PPP", { locale: es })}
                      {sale.invoice_number && (
                        <span className="ml-2">
                          • {invoiceTypeLabels[sale.invoice_type]}{" "}
                          {sale.invoice_number}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">
                      {formatCurrency(sale.total_amount)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
