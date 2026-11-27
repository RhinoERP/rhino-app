"use client";

import {
  ChartLine,
  ClipboardText,
  MapPin,
  Package,
  Receipt,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { NavigationFeedbackLink } from "@/components/layout/navigation-feedback-link";
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
      description: "Ver historial de ventas",
      requiresWholesale: true,
      requiresPos: false,
      requiresNoProduction: false,
    },
    ...(canManageSales
      ? [
          {
            icon: ChartLine,
            label: "Mi progreso",
            href: `/org/${orgSlug}/mi-progreso`,
            description: "Avance, metas, cotizaciones y visitas",
            requiresWholesale: false,
            requiresPos: false,
            requiresNoProduction: false,
          },
        ]
      : []),
    ...(canManageSales
      ? [
          {
            icon: MapPin,
            label: "Mis visitas",
            href: `/org/${orgSlug}/visitas`,
            description: "Lista diaria y llegada al cliente",
            requiresWholesale: false,
            requiresPos: false,
            requiresNoProduction: false,
          },
          {
            icon: ClipboardText,
            label: "Cotizaciones",
            href: `/org/${orgSlug}/solicitudes-venta`,
            offlineHref: "/~offline/cotizaciones",
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
            const unavailableOffline = !(online || button.offlineHref);
            const card = (
              <Card
                className={`overflow-hidden transition-all ${unavailableOffline ? "opacity-50" : "hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"}`}
              >
                <CardContent className="flex min-h-28 flex-col items-center justify-center gap-2 bg-secondary p-4 text-center text-secondary-foreground">
                  <Icon className="size-8" weight="duotone" />
                  <span className="font-semibold text-base">
                    {button.label}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {unavailableOffline
                      ? "Disponible con conexión"
                      : button.description}
                  </span>
                </CardContent>
              </Card>
            );

            if (!online) {
              if (!button.offlineHref) {
                return <div key={button.href}>{card}</div>;
              }
              return (
                <NavigationFeedbackLink
                  className="block"
                  href={button.offlineHref}
                  key={button.href}
                  pendingClassName="rounded-xl bg-secondary/95 text-secondary-foreground"
                  pendingLabel={`Abriendo ${button.label}…`}
                >
                  {card}
                </NavigationFeedbackLink>
              );
            }

            return (
              <NavigationFeedbackLink
                className="block"
                href={button.href}
                key={button.href}
                pendingClassName="rounded-xl bg-secondary/95 text-secondary-foreground"
                pendingLabel={`Abriendo ${button.label}…`}
              >
                {card}
              </NavigationFeedbackLink>
            );
          })}
        </div>
      </div>
    </div>
  );
}
