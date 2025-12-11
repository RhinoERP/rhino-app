"use client";

import {
  CalendarBlankIcon,
  EnvelopeIcon,
  MapPinIcon,
  PhoneIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";

type SupplierInfoCardProps = {
  createdAt: string;
  mapsLink: string | null;
  orgSlug: string;
  supplier: Supplier;
  updatedAt: string | null;
};

export function SupplierInfoCard({
  createdAt,
  mapsLink,
  orgSlug,
  supplier,
  updatedAt,
}: SupplierInfoCardProps) {
  const router = useRouter();

  return (
    <Card className="sticky top-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-lg">Proveedor</CardTitle>
          <CardDescription>Información y contacto</CardDescription>
        </div>
        <AddSupplierDialog
          onUpdated={() => router.refresh()}
          orgSlug={orgSlug}
          supplier={supplier}
          trigger={
            <Button size="sm" variant="outline">
              Editar
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Nombre legal
            </p>
            <p className="font-medium text-sm">{supplier.name}</p>
            <p className="text-muted-foreground text-sm">
              {supplier.cuit ? `CUIT ${supplier.cuit}` : "CUIT no informado"}
            </p>
          </div>

          {supplier.payment_terms && (
            <div>
              <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Condiciones de pago
              </p>
              <p className="mt-1 text-sm">{supplier.payment_terms}</p>
            </div>
          )}

          {supplier.notes && (
            <div>
              <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Notas
              </p>
              <p className="mt-1 text-sm">{supplier.notes}</p>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Contacto
          </p>

          {supplier.email ? (
            <div className="flex items-center gap-2 text-sm">
              <EnvelopeIcon className="h-4 w-4 text-muted-foreground" />
              <a
                className="text-primary hover:underline"
                href={`mailto:${supplier.email}`}
              >
                {supplier.email}
              </a>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Email no informado</p>
          )}

          {supplier.phone ? (
            <div className="flex items-center gap-2 text-sm">
              <PhoneIcon className="h-4 w-4 text-muted-foreground" />
              <a
                className="text-primary hover:underline"
                href={`tel:${supplier.phone}`}
              >
                {supplier.phone}
              </a>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Teléfono no informado
            </p>
          )}

          {supplier.contact_name && (
            <div className="flex items-center gap-2 text-sm">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span>{supplier.contact_name}</span>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Domicilio
          </p>
          {supplier.address ? (
            <div className="flex items-start gap-2 text-sm">
              <MapPinIcon className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <p>{supplier.address}</p>
                {mapsLink && (
                  <a
                    className="text-primary text-sm hover:underline"
                    href={mapsLink}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Buscar en Google Maps
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Dirección no informada
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <CalendarBlankIcon className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                Proveedor desde
              </p>
              <p className="text-sm">{createdAt}</p>
            </div>
          </div>

          {updatedAt && (
            <div className="flex items-start gap-2">
              <CalendarBlankIcon className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                  Última modificación
                </p>
                <p className="text-sm">{updatedAt}</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
