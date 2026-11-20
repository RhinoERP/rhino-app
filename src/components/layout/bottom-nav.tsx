"use client";

import {
  ChartLine,
  ClipboardText,
  House,
  type Icon,
  MapPin,
  Users,
} from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PendingLink } from "./pending-link";

type BottomNavProps = {
  orgSlug: string;
  wholesaleEnabled: boolean;
  canManageSales: boolean;
};

type BottomNavItem = {
  icon: Icon;
  label: string;
  href: string;
  offlineHref?: string;
  isActive: boolean;
};

function BottomNavLink({
  item,
  online,
}: {
  item: BottomNavItem;
  online: boolean;
}) {
  const NavIcon = item.icon;
  const className = `flex flex-1 flex-col items-center gap-1 py-3 transition-colors ${
    item.isActive
      ? "text-primary"
      : "text-muted-foreground hover:text-foreground"
  }`;
  const contents = (
    <>
      <NavIcon className="size-6" weight={item.isActive ? "fill" : "regular"} />
      <span className="max-w-full truncate px-1 text-[10px] sm:text-xs">
        {item.label}
      </span>
    </>
  );

  if (!online) {
    if (!item.offlineHref) {
      return (
        <span
          aria-disabled="true"
          className="flex flex-1 flex-col items-center gap-1 py-3 text-muted-foreground/50"
          title="Visitas requiere conexión"
        >
          {contents}
        </span>
      );
    }
    return (
      <a
        aria-current={item.isActive ? "page" : undefined}
        className={className}
        href={item.offlineHref}
      >
        {contents}
      </a>
    );
  }

  return (
    <PendingLink
      aria-current={item.isActive ? "page" : undefined}
      className={className}
      href={item.href}
      pendingLabel="Abriendo…"
    >
      {contents}
    </PendingLink>
  );
}

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
      icon: House,
      label: "Inicio",
      href: `/org/${orgSlug}`,
      offlineHref: "/~offline",
      isActive: pathname === `/org/${orgSlug}` || pathname === "/~offline",
      requiresWholesale: false,
    },
    {
      icon: ChartLine,
      label: "Ventas",
      href: `/org/${orgSlug}/ventas`,
      offlineHref: "/~offline/preventa",
      isActive:
        pathname.startsWith(`/org/${orgSlug}/ventas`) ||
        pathname === "/~offline/preventa",
      requiresWholesale: true,
    },
    {
      icon: MapPin,
      label: "Visitas",
      href: `/org/${orgSlug}/visitas`,
      isActive: pathname.startsWith(`/org/${orgSlug}/visitas`),
      requiresWholesale: false,
      requiresSalesManagement: true,
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
    <nav
      aria-label="Navegación principal móvil"
      className="fixed right-0 bottom-0 left-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/60 md:hidden"
    >
      <div className="flex items-center justify-around">
        {navItems.map((item) => (
          <BottomNavLink item={item} key={item.href} online={online} />
        ))}
      </div>
    </nav>
  );
}
