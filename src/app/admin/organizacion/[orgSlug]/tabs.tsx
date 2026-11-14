"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { suffix: "", label: "Información" },
  { suffix: "/actividad", label: "Actividad" },
  { suffix: "/ia", label: "IA" },
] as const;

export function OrgDetailTabs({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  const base = `/admin/organizacion/${orgSlug}`;
  const current =
    TABS.find((tab) => tab.suffix && pathname.endsWith(tab.suffix))?.suffix ??
    "";

  return (
    <nav className="mb-6 flex gap-6 border-b">
      {TABS.map((tab) => (
        <Link
          className={`border-b-2 pb-2 font-medium text-sm transition-colors ${
            current === tab.suffix
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          href={`${base}${tab.suffix}`}
          key={tab.label}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
