"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type FinanzasNavProps = {
  orgSlug: string;
};

export function FinanzasNav({ orgSlug }: FinanzasNavProps) {
  const pathname = usePathname();

  const tabs = [
    { label: "Estado de resultados", href: `/org/${orgSlug}/finanzas` },
    { label: "Libro mayor", href: `/org/${orgSlug}/finanzas/libro-mayor` },
    { label: "Gastos operativos", href: `/org/${orgSlug}/finanzas/gastos` },
    { label: "Categorías", href: `/org/${orgSlug}/finanzas/categorias` },
    {
      label: "Aprobación de Pedidos",
      href: `/org/${orgSlug}/finanzas/aprobacion-pedidos`,
    },
  ];

  return (
    <div className="inline-flex items-center rounded-lg bg-muted p-1">
      {tabs.map((tab) => {
        const isActive =
          tab.href === `/org/${orgSlug}/finanzas`
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        return (
          <Link
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-sm transition-all ${
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
