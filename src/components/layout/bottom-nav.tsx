"use client";

import { ChartLine, Package, SignOut, Users } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type BottomNavProps = {
  orgSlug: string;
};

export function BottomNav({ orgSlug }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const navItems = [
    {
      icon: ChartLine,
      label: "Ventas",
      href: `/org/${orgSlug}/ventas`,
      isActive: pathname.includes("/ventas"),
    },
    {
      icon: Package,
      label: "Stock",
      href: `/org/${orgSlug}/stock`,
      isActive: pathname.includes("/stock"),
    },
    {
      icon: Users,
      label: "Clientes",
      href: `/org/${orgSlug}/clientes`,
      isActive: pathname.includes("/clientes"),
    },
  ];

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 md:hidden">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
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
          onClick={handleLogout}
          type="button"
        >
          <SignOut className="size-6" weight="regular" />
          <span className="text-xs">Salir</span>
        </button>
      </div>
    </nav>
  );
}
