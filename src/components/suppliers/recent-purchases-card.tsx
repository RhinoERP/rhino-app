"use client";

import { FileTextIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { SupplierPurchase } from "@/modules/suppliers/types";

type RecentPurchasesCardProps = {
  orgSlug: string;
  purchases: SupplierPurchase[];
};

const statusLabels: Record<
  SupplierPurchase["status"],
  { label: string; className: string }
> = {
  ORDERED: { label: "Pedido", className: "text-blue-600 bg-blue-50" },
  IN_TRANSIT: { label: "En Tránsito", className: "text-amber-600 bg-amber-50" },
  RECEIVED: { label: "Recibido", className: "text-emerald-600 bg-emerald-50" },
  CANCELLED: { label: "Cancelado", className: "text-red-600 bg-red-50" },
};

export function RecentPurchasesCard({
  orgSlug,
  purchases,
}: RecentPurchasesCardProps) {
  if (purchases.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="flex items-center gap-2 border-b p-4">
          <FileTextIcon
            className="h-5 w-5 text-muted-foreground"
            weight="bold"
          />
          <CardTitle className="text-base">Compras recientes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileTextIcon className="h-6 w-6" weight="bold" />
          </div>
          <p className="text-sm">Este proveedor no tiene compras registradas</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex items-center gap-2 border-b p-4">
        <FileTextIcon className="h-5 w-5 text-muted-foreground" weight="bold" />
        <CardTitle className="text-base">Compras recientes</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {purchases.map((purchase) => {
            const statusInfo = statusLabels[purchase.status];
            return (
              <Link
                className="block p-4 transition-colors hover:bg-muted/50"
                href={`/org/${orgSlug}/compras/${purchase.id}`}
                key={purchase.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">
                        Compra #{purchase.purchase_number ?? "S/N"}
                      </p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 font-medium text-xs ${statusInfo.className}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {format(new Date(purchase.purchase_date), "PPP", {
                        locale: es,
                      })}
                      {purchase.delivery_date && (
                        <span className="ml-2">
                          • Entrega:{" "}
                          {format(new Date(purchase.delivery_date), "PPP", {
                            locale: es,
                          })}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">
                      {formatCurrency(purchase.total_amount)}
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
