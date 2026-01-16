"use client";

import {
  CalendarBlankIcon,
  EnvelopeIcon,
  MapPinIcon,
  PhoneIcon,
  WhatsappLogo,
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

/**
 * Formats a phone number for WhatsApp URL
 * Removes all non-digit characters and ensures it starts with country code
 */
function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, "");

  // If it doesn't start with country code (assuming Argentina +54), add it
  if (!digitsOnly.startsWith("54") && digitsOnly.length >= 10) {
    return `54${digitsOnly}`;
  }

  return digitsOnly;
}

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

  const whatsappUrl = customer.phone
    ? `https://wa.me/${formatPhoneForWhatsApp(customer.phone)}`
    : null;

  return (
    <Card className="lg:sticky lg:top-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-lg">Información del Cliente</CardTitle>
          <CardDescription>Datos de contacto</CardDescription>
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
        {/* Basic Info */}
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

        {/* Contact - Mobile Optimized with Action Buttons */}
        <div className="space-y-3">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Contacto
          </p>

          {customer.email ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                <EnvelopeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{customer.email}</span>
              </div>
              <Button asChild size="sm" variant="outline">
                <a href={`mailto:${customer.email}`}>Email</a>
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Email no informado</p>
          )}

          {customer.phone ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                <PhoneIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{customer.phone}</span>
              </div>
              <Button
                asChild
                className="bg-[#25D366] hover:bg-[#20BA5A]"
                size="sm"
                variant="default"
              >
                <a
                  href={whatsappUrl ?? "#"}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <WhatsappLogo className="mr-1.5 h-4 w-4" weight="fill" />
                  WhatsApp
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Teléfono no informado
            </p>
          )}
        </div>

        <Separator />

        {/* Address */}
        <div className="space-y-3">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
            Domicilio
          </p>
          {customer.address ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm">
                <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p>{customer.address}</p>
                  {customer.city && (
                    <p className="text-muted-foreground">{customer.city}</p>
                  )}
                </div>
              </div>
              {mapsLink && (
                <Button asChild className="w-full" size="sm" variant="outline">
                  <a href={mapsLink} rel="noreferrer" target="_blank">
                    <MapPinIcon className="mr-2 h-4 w-4" />
                    Abrir en Maps
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Dirección no informada
            </p>
          )}
        </div>

        <Separator className="hidden lg:block" />

        {/* Dates - Hide on mobile to save space */}
        <div className="hidden space-y-4 lg:block">
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
