"use client";

import { Button } from "@/components/ui/button";

export default function CustomersPageError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-lg border p-6 text-center">
      <h1 className="font-heading text-xl">
        No se pudieron cargar los clientes
      </h1>
      <p className="text-muted-foreground text-sm">
        Verificá la conexión e intentá nuevamente. No se modificaron tus datos.
      </p>
      <Button onClick={reset} type="button">
        Reintentar
      </Button>
    </div>
  );
}
