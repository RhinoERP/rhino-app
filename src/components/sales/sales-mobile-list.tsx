"use client";

import {
  CheckCircle,
  ShoppingBag,
  Truck,
  XCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";

type SalesMobileCardProps = {
  sale: SalesOrderWithCustomer;
  orgSlug: string;
};

function SalesMobileCard({ sale, orgSlug }: SalesMobileCardProps) {
  const href = `/org/${orgSlug}/ventas/${sale.id}`;
  const customerName =
    sale.customer?.fantasy_name || sale.customer?.business_name || "N/A";

  const statusConfig = {
    DRAFT: {
      label: "Preventa",
      variant: "secondary" as const,
      color: "text-amber-600",
      icon: undefined,
    },
    CONFIRMED: {
      label: "Confirmada",
      variant: "default" as const,
      color: "text-blue-600",
      icon: <CheckCircle className="size-3" weight="fill" />,
    },
    DISPATCH: {
      label: "Despachada",
      variant: "default" as const,
      color: "text-orange-600",
      icon: <Truck className="size-3" weight="fill" />,
    },
    DELIVERED: {
      label: "Entregada",
      variant: "default" as const,
      color: "text-green-600",
      icon: <CheckCircle className="size-3" weight="fill" />,
    },
    CANCELLED: {
      label: "Cancelada",
      variant: "destructive" as const,
      color: "text-red-600",
      icon: <XCircle className="size-3" weight="fill" />,
    },
  };

  const config = statusConfig[sale.status];
  const saleDate = sale.sale_date
    ? new Date(sale.sale_date).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
      })
    : "Sin fecha";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header: Customer & Date */}
          <div className="flex items-start justify-between gap-2">
            <Link
              className="block flex-1 font-semibold leading-tight transition-colors hover:text-primary"
              href={href}
            >
              <span className="wrap-break-word whitespace-normal">
                {customerName}
              </span>
            </Link>
            <span className="shrink-0 text-muted-foreground text-xs">
              {saleDate}
            </span>
          </div>

          {/* Amount - Highlighted */}
          <div className="rounded-md bg-primary/10 px-3 py-2">
            <div className="text-muted-foreground text-xs">Monto Total</div>
            <div className="font-bold text-primary text-xl tabular-nums">
              $
              {(sale.total_amount ?? 0).toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>

          {/* Footer: Status & Details */}
          <div className="flex items-center justify-between">
            <Badge className="text-xs" variant={config.variant}>
              {config.icon && <span className="mr-1">{config.icon}</span>}
              {config.label}
            </Badge>
            <Link
              className="font-medium text-primary text-sm hover:underline"
              href={href}
            >
              Ver detalles →
            </Link>
          </div>

          {/* Additional Info */}
          {sale.remittance_number && (
            <div className="text-muted-foreground text-xs">
              Remito: {sale.remittance_number}
            </div>
          )}
          {sale.seller?.name && (
            <div className="text-muted-foreground text-xs">
              Vendedor: {sale.seller.name}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type SalesMobileListProps = {
  sales: SalesOrderWithCustomer[];
  orgSlug: string;
  emptyMessage?: string;
};

export function SalesMobileList({
  sales,
  orgSlug,
  emptyMessage = "No hay ventas para mostrar",
}: SalesMobileListProps) {
  if (sales.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingBag className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin ventas</EmptyTitle>
            <EmptyDescription>{emptyMessage}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sales.map((sale) => (
        <SalesMobileCard key={sale.id} orgSlug={orgSlug} sale={sale} />
      ))}
    </div>
  );
}
