import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CollectionsSectionNav({
  orgSlug,
  currentAccounts,
  mercadoLibre,
  active,
}: {
  orgSlug: string;
  currentAccounts: boolean;
  mercadoLibre: boolean;
  active: "currentAccounts" | "mercadoLibre";
}) {
  return (
    <nav aria-label="Secciones de Cobranzas" className="flex flex-wrap gap-2">
      {currentAccounts && (
        <Button
          asChild
          variant={active === "currentAccounts" ? "default" : "outline"}
        >
          <Link
            aria-current={active === "currentAccounts" ? "page" : undefined}
            href={`/org/${orgSlug}/cobranzas`}
          >
            Cuentas corrientes
          </Link>
        </Button>
      )}
      {mercadoLibre && (
        <Button
          asChild
          variant={active === "mercadoLibre" ? "default" : "outline"}
        >
          <Link
            aria-current={active === "mercadoLibre" ? "page" : undefined}
            href={`/org/${orgSlug}/cobranzas/mercado-libre`}
          >
            Cobros Meli
          </Link>
        </Button>
      )}
    </nav>
  );
}
