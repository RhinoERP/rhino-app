"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function OrgDetailTabs({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  const isActividad = pathname.endsWith("/actividad");

  return (
    <nav className="mb-6 flex gap-6 border-b">
      <Link
        className={`border-b-2 pb-2 font-medium text-sm transition-colors ${
          isActividad
            ? "border-transparent text-muted-foreground hover:text-foreground"
            : "border-primary text-foreground"
        }`}
        href={`/admin/organizacion/${orgSlug}`}
      >
        Información
      </Link>
      <Link
        className={`border-b-2 pb-2 font-medium text-sm transition-colors ${
          isActividad
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
        href={`/admin/organizacion/${orgSlug}/actividad`}
      >
        Actividad
      </Link>
    </nav>
  );
}
