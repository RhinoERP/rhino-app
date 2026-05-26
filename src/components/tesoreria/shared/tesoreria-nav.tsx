"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TesoreriaNavProps = {
  orgSlug: string;
};

export function TesoreriaNav({ orgSlug }: TesoreriaNavProps) {
  const pathname = usePathname();

  const tabs = [
    {
      label: "Movimientos bancarios",
      href: `/org/${orgSlug}/tesoreria`,
    },
    {
      label: "Control de cheques",
      href: `/org/${orgSlug}/tesoreria/cheques`,
    },
  ];

  return (
    <div className="inline-flex items-center rounded-lg bg-muted p-1">
      {tabs.map((tab) => {
        const isActive =
          tab.href === `/org/${orgSlug}/tesoreria`
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
