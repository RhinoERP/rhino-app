"use client";

import { Phone, UsersIcon } from "@phosphor-icons/react";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { Customer } from "@/modules/customers/types";

type CustomerMobileCardProps = {
  customer: Customer;
  orgSlug: string;
};

function CustomerMobileCard({ customer, orgSlug }: CustomerMobileCardProps) {
  const displayName = customer.fantasy_name || customer.business_name;
  const secondaryName = customer.fantasy_name ? customer.business_name : null;
  const href = `/org/${orgSlug}/clientes/${customer.id}`;
  const hasPhone = customer.phone && customer.phone.trim().length > 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Header: Name */}
          <div>
            <Link
              className="block font-semibold text-lg leading-tight transition-colors hover:text-primary"
              href={href}
            >
              <span className="wrap-break-word whitespace-normal">
                {displayName}
              </span>
            </Link>
            {secondaryName && (
              <div className="mt-1 text-muted-foreground text-sm">
                <Building2 className="mr-1 inline-block size-3" />
                {secondaryName}
              </div>
            )}
          </div>

          {/* Contact Info & Actions */}
          <div className="flex flex-col gap-3">
            {/* Phone with Call Button */}
            {hasPhone ? (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="text-muted-foreground text-xs">Teléfono</div>
                  <div className="font-medium tabular-nums">
                    {customer.phone}
                  </div>
                </div>
                <Button
                  asChild
                  className="shrink-0"
                  size="sm"
                  variant="default"
                >
                  <a href={`tel:${customer.phone}`}>
                    <Phone className="mr-1.5 size-4" weight="fill" />
                    Llamar
                  </a>
                </Button>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">
                <Phone className="mr-1 inline-block size-4" />
                Sin teléfono
              </div>
            )}

            {/* CUIT */}
            {customer.cuit && (
              <div>
                <div className="text-muted-foreground text-xs">CUIT</div>
                <div className="font-mono text-sm">{customer.cuit}</div>
              </div>
            )}
          </div>

          {/* Footer: Status & Detail Link */}
          <div className="flex items-center justify-between">
            <Badge
              className="text-xs"
              variant={customer.is_active ? "default" : "secondary"}
            >
              {customer.is_active ? "Activo" : "Inactivo"}
            </Badge>
            <Button asChild size="sm" variant="ghost">
              <Link href={href}>Ver detalles →</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type CustomersMobileListProps = {
  customers: Customer[];
  orgSlug: string;
  EmptyStateAction?: React.ReactNode;
};

export function CustomersMobileList({
  customers,
  orgSlug,
  EmptyStateAction,
}: CustomersMobileListProps) {
  if (customers.length === 0) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>No hay clientes</EmptyTitle>
            <EmptyDescription>
              Aún no has agregado ningún cliente a esta organización.
            </EmptyDescription>
          </EmptyHeader>
          {EmptyStateAction && <EmptyContent>{EmptyStateAction}</EmptyContent>}
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {customers.map((customer) => (
        <CustomerMobileCard
          customer={customer}
          key={customer.id}
          orgSlug={orgSlug}
        />
      ))}
    </div>
  );
}
