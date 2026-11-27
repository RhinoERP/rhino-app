"use client";

import { captureException } from "@sentry/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function PurchaseHistoryError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  useEffect(() => {
    captureException(error);
  }, [error]);
  return (
    <main className="space-y-4">
      <h1 className="font-heading text-2xl">Compras históricas</h1>
      <p>No pudimos completar la consulta. Intentá nuevamente.</p>
      <div className="flex gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <Button asChild variant="outline">
          <Link href={`/org/${orgSlug}/compras/historicas`}>
            Limpiar filtros
          </Link>
        </Button>
      </div>
    </main>
  );
}
