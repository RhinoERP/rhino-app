"use client";

import {
  ChartLine,
  ClipboardText,
  Package,
  SignOut,
  Users,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { secureLogout } from "@/lib/auth/secure-logout";

type BottomNavProps = {
  orgSlug: string;
  wholesaleEnabled: boolean;
  canManageSales: boolean;
};

export function BottomNav({
  orgSlug,
  wholesaleEnabled,
  canManageSales,
}: BottomNavProps) {
  const pathname = usePathname();
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

  const navItems = [
    {
      icon: ChartLine,
      label: "Ventas",
      href: `/org/${orgSlug}/ventas`,
      offlineHref: "/~offline",
      isActive: pathname.includes("/ventas"),
      requiresWholesale: true,
    },
    {
      icon: ClipboardText,
      label: "Cotizaciones",
      href: `/org/${orgSlug}/solicitudes-venta`,
      offlineHref: "/~offline/cotizaciones",
      isActive:
        pathname.includes("/solicitudes-venta") ||
        pathname === "/~offline/cotizaciones",
      requiresWholesale: false,
      requiresSalesManagement: true,
    },
    {
      icon: Package,
      label: "Stock",
      href: `/org/${orgSlug}/stock`,
      offlineHref: "/~offline/datos",
      isActive: pathname.includes("/stock"),
      requiresWholesale: false,
    },
    {
      icon: Users,
      label: "Clientes",
      href: `/org/${orgSlug}/clientes`,
      offlineHref: "/~offline/datos",
      isActive: pathname.includes("/clientes"),
      requiresWholesale: false,
    },
  ].filter(
    (item) =>
      (!item.requiresWholesale || wholesaleEnabled) &&
      (!item.requiresSalesManagement || canManageSales)
  );

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 md:hidden">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          if (!online && "offlineHref" in item) {
            return (
              <a
                className={`flex flex-1 flex-col items-center gap-1 py-3 transition-colors ${
                  item.isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                href={item.offlineHref}
                key={item.href}
              >
                <Icon
                  className="size-6"
                  weight={item.isActive ? "fill" : "regular"}
                />
                <span className="text-xs">{item.label}</span>
              </a>
            );
          }
          return (
            <Link
              className={`flex flex-1 flex-col items-center gap-1 py-3 transition-colors ${
                item.isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              href={item.href}
              key={item.href}
            >
              <Icon
                className="size-6"
                weight={item.isActive ? "fill" : "regular"}
              />
              <span className="text-xs">{item.label}</span>
            </Link>
          );
        })}
        <button
          className="flex flex-1 flex-col items-center gap-1 py-3 text-muted-foreground transition-colors hover:text-foreground"
          onClick={secureLogout}
          type="button"
        >
          <SignOut className="size-6" weight="regular" />
          <span className="text-xs">Salir</span>
        </button>
      </div>
    </nav>
  );
}
