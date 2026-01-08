"use client";

import { ChartLine, Package, Receipt } from "@phosphor-icons/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SellerMobileHomeProps = {
  orgSlug: string;
  userName?: string;
};

export function SellerMobileHome({ orgSlug, userName }: SellerMobileHomeProps) {
  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return "Buenos días";
    }
    if (hour < 20) {
      return "Buenas tardes";
    }
    return "Buenas noches";
  };

  const greeting = userName ? `${getGreeting()}, ${userName}` : getGreeting();

  const actionButtons = [
    {
      icon: Receipt,
      label: "Nueva preventa",
      href: `/org/${orgSlug}/preventa/nueva`,
      variant: "secondary" as const,
      description: "Registrar una nueva venta",
    },
    {
      icon: ChartLine,
      label: "Mis ventas",
      href: `/org/${orgSlug}/ventas`,
      variant: "secondary" as const,
      description: "Ver historial de ventas",
    },
    {
      icon: Package,
      label: "Consultar Stock",
      href: `/org/${orgSlug}/stock`,
      variant: "secondary" as const,
      description: "Ver productos disponibles",
    },
  ];

  return (
    <div className="min-h-screen bg-linear-to-b from-background to-muted/20 p-6">
      <div className="mx-auto max-w-md space-y-8 pt-8">
        {/* Greeting Header */}
        <div className="text-center">
          <h1 className="font-bold text-3xl tracking-tight">{greeting}</h1>
          <p className="mt-2 text-muted-foreground">¿Qué deseas hacer hoy?</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4">
          {actionButtons.map((button) => {
            const Icon = button.icon;
            return (
              <Link href={button.href} key={button.href}>
                <Card className="transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]">
                  <CardContent className="p-6">
                    <Button
                      className="h-auto w-full flex-col gap-3 py-6"
                      size="lg"
                      variant={button.variant}
                    >
                      <Icon className="size-8" weight="duotone" />
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-lg">
                          {button.label}
                        </span>
                        <span className="font-normal text-muted-foreground text-xs">
                          {button.description}
                        </span>
                      </div>
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
