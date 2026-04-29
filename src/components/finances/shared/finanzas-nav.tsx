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
  ];

  return (
    <nav className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const isActive =
          tab.href === `/org/${orgSlug}/finanzas`
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        return (
          <Link
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              isActive
                ? "border-primary border-b-2 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
