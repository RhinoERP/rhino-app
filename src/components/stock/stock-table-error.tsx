"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function StockTableError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section className="space-y-3 rounded-md border p-4">
      <p className="text-destructive text-sm" role="alert">
        No se pudo cargar el listado de productos. Los indicadores se consultan
        por separado.
      </p>
      <Button
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        size="sm"
        variant="outline"
      >
        {pending ? "Actualizando..." : "Reintentar productos"}
      </Button>
    </section>
  );
}
