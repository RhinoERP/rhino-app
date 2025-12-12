"use client";

import {
  BuildingIcon,
  CalendarBlankIcon,
  ListBulletsIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PriceList } from "@/modules/price-lists/types";

type PriceListInfoCardProps = {
  createdAt: string;
  orgSlug: string;
  priceList: PriceList;
  updatedAt: string | null;
};

function getPriceListStatus(
  priceList: PriceList
): "active" | "future" | "expired" {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const validFrom = new Date(priceList.valid_from);
  validFrom.setHours(0, 0, 0, 0);

  const validUntil = priceList.valid_until
    ? new Date(priceList.valid_until)
    : null;

  if (validUntil) {
    validUntil.setHours(0, 0, 0, 0);
  }

  if (now < validFrom) {
    return "future";
  }

  if (validUntil && now > validUntil) {
    return "expired";
  }

  return "active";
}

export function PriceListInfoCard({
  createdAt,
  priceList,
  updatedAt,
}: PriceListInfoCardProps) {
  const status = getPriceListStatus(priceList);
  const validFrom = format(new Date(priceList.valid_from), "dd/MM/yyyy", {
    locale: es,
  });
  const validUntil = priceList.valid_until
    ? format(new Date(priceList.valid_until), "dd/MM/yyyy", { locale: es })
    : "Indefinida";

  const getStatusBadge = () => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            Activa
          </Badge>
        );
      case "future":
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
            Futura
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
            Vencida
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="sticky top-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-lg">Lista de Precios</CardTitle>
          <CardDescription>Información general</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Nombre
            </p>
            <p className="font-medium text-sm">{priceList.name}</p>
          </div>

          {priceList.supplier_name && (
            <div>
              <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Proveedor
              </p>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                <span>{priceList.supplier_name}</span>
              </div>
            </div>
          )}

          <div>
            <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Estado
            </p>
            <div className="mt-1">{getStatusBadge()}</div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Vigencia
          </p>

          <div className="flex items-center gap-2 text-sm">
            <CalendarBlankIcon className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">Desde: {validFrom}</p>
              <p className="text-muted-foreground">Hasta: {validUntil}</p>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Información del sistema
          </p>

          <div className="flex items-center gap-2 text-sm">
            <ListBulletsIcon className="h-4 w-4 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">
                Creada el {createdAt}
              </p>
              {updatedAt && (
                <p className="text-muted-foreground text-xs">
                  Última actualización: {updatedAt}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
