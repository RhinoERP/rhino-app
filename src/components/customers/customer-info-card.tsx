"use client";

import {
  CalendarBlankIcon,
  EnvelopeIcon,
  MapPinIcon,
  PhoneIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Customer } from "@/modules/customers/types";

type CustomerInfoCardProps = {
  customer: Customer;
  orgSlug: string;
  createdAt: string;
  updatedAt: string | null;
  mapsLink: string | null;
};

export function CustomerInfoCard({
  customer,
  orgSlug,
  createdAt,
  updatedAt,
  mapsLink,
}: CustomerInfoCardProps) {
  const router = useRouter();

  return (
    <Card className="sticky top-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-lg">Cliente</CardTitle>
          <CardDescription>Información y contacto</CardDescription>
        </div>
        <AddCustomerDialog
          customer={customer}
          onUpdated={() => router.refresh()}
          orgSlug={orgSlug}
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
              Número de cliente
            </p>
            <p className="font-medium text-sm">
              {customer.client_number || "—"}
            </p>
          </div>

          <div>
            <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Razón social
            </p>
            <p className="font-medium text-sm">{customer.business_name}</p>
            {customer.fantasy_name && (
              <p className="text-muted-foreground text-sm">
                {customer.fantasy_name}
              </p>
            )}
          </div>

          <div>
            <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              CUIT
            </p>
            <p className="text-sm">{customer.cuit || "CUIT no informado"}</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Contacto
          </p>

          {customer.email ? (
            <div className="flex items-center gap-2 text-sm">
              <EnvelopeIcon className="h-4 w-4 text-muted-foreground" />
              <a
                className="text-primary hover:underline"
                href={`mailto:${customer.email}`}
              >
                {customer.email}
              </a>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Email no informado</p>
          )}

          {customer.phone ? (
            <div className="flex items-center gap-2 text-sm">
              <PhoneIcon className="h-4 w-4 text-muted-foreground" />
              <a
                className="text-primary hover:underline"
                href={`tel:${customer.phone}`}
              >
                {customer.phone}
              </a>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Teléfono no informado
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Domicilio
          </p>
          {customer.address ? (
            <div className="flex items-start gap-2 text-sm">
              <MapPinIcon className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <p>{customer.address}</p>
                {customer.city && (
                  <p className="text-muted-foreground">{customer.city}</p>
                )}
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
                Cliente desde
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
