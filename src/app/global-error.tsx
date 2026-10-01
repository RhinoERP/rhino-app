"use client";

import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main className="flex min-h-dvh items-center justify-center p-6 text-center">
          <div>
            <h1 className="font-semibold text-2xl">Algo salio mal</h1>
            <p className="mt-2 text-muted-foreground">
              Recarga la aplicacion para volver a intentarlo.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
