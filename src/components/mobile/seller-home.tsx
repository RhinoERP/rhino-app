"use client";

import {
  ChartLine,
  ClipboardText,
  Package,
  Receipt,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SellerMobileHomeProps = {
  orgSlug: string;
  userName?: string;
  wholesaleEnabled: boolean;
  posEnabled: boolean;
  productionEnabled: boolean;
  canManageSales: boolean;
};

export function SellerMobileHome({
  orgSlug,
  userName,
  wholesaleEnabled,
  posEnabled,
  productionEnabled,
  canManageSales,
}: SellerMobileHomeProps) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

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
      offlineHref: "/~offline/preventa",
      variant: "secondary" as const,
      description: "Registrar una nueva venta",
      requiresWholesale: true,
      requiresPos: false,
      requiresNoProduction: true,
    },
    {
      icon: ChartLine,
      label: "Mis ventas",
      href: `/org/${orgSlug}/ventas`,
      offlineHref: "/~offline",
      variant: "secondary" as const,
      description: "Ver historial de ventas",
      requiresWholesale: true,
      requiresPos: false,
      requiresNoProduction: false,
    },
    ...(canManageSales
      ? [
          {
            icon: ClipboardText,
            label: "Cotizaciones",
            href: `/org/${orgSlug}/solicitudes-venta`,
            offlineHref: "/~offline/cotizaciones",
            variant: "secondary" as const,
            description: "Mis cotizaciones y cotizador competitivo",
            requiresWholesale: false,
            requiresPos: false,
            requiresNoProduction: false,
          },
        ]
      : []),
    {
      icon: Receipt,
      label: "Venta directa",
      href: `/org/${orgSlug}/venta-directa/nueva`,
      offlineHref: "/~offline",
      variant: "secondary" as const,
      description: "Registrar una venta de mostrador",
      requiresWholesale: false,
      requiresPos: true,
      requiresNoProduction: false,
    },
    {
      icon: Package,
      label: "Consultar Stock",
      href: `/org/${orgSlug}/stock`,
      offlineHref: "/~offline/datos",
      variant: "secondary" as const,
      description: "Ver productos disponibles",
      requiresWholesale: false,
      requiresPos: false,
      requiresNoProduction: false,
    },
  ].filter((button) => {
    if (button.requiresWholesale && !wholesaleEnabled) {
      return false;
    }
    if (button.requiresPos && !posEnabled) {
      return false;
    }
    if (button.requiresNoProduction && productionEnabled) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-6">
      <div className="mx-auto max-w-md space-y-8 pt-8 pb-24">
        {/* Greeting Header */}
        <div className="text-center">
          <h1 className="font-bold text-3xl tracking-tight">{greeting}</h1>
          <p className="mt-2 text-muted-foreground">¿Qué deseas hacer hoy?</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4">
          {actionButtons.map((button) => {
            const Icon = button.icon;
            const card = (
              <Card className="overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]">
                <CardContent className="p-0">
                  <Button
                    className="h-auto w-full flex-col gap-3 rounded-none py-8"
                    size="lg"
                    variant={button.variant}
                  >
                    <Icon className="size-10" weight="duotone" />
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
            );

            if (!online) {
              return (
                <a href={button.offlineHref} key={button.href}>
                  {card}
                </a>
              );
            }

            return (
              <Link href={button.href} key={button.href}>
                {card}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
