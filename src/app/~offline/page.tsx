"use client";

import { ArrowClockwiseIcon, WifiSlashIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { trackPwaEvent } from "@/lib/pwa-telemetry";
import { getActiveSellerSnapshot } from "@/modules/offline/storage/offline-db";

export default function OfflinePage() {
  const [online, setOnline] = useState(false);
  const [hasOfflineData, setHasOfflineData] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    getActiveSellerSnapshot()
      .then((snapshot) => setHasOfflineData(Boolean(snapshot)))
      .catch(() => setHasOfflineData(false));
    trackPwaEvent("pwa.offline_fallback_shown");
    const updateStatus = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  const retry = () => {
    trackPwaEvent("pwa.offline_fallback_retry");
    window.location.reload();
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <section className="w-full max-w-sm text-center">
        <Image
          alt="Rhinos"
          className="mx-auto mb-8"
          height={88}
          priority
          src="/icons/pwa-192x192.png"
          width={88}
        />
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <WifiSlashIcon className="size-7" />
        </div>
        <h1 className="font-semibold text-2xl">Sin conexion</h1>
        <p className="mt-3 text-muted-foreground text-sm leading-6">
          No pudimos conectar con Rhinos. Si preparaste tus datos previamente,
          podés consultar clientes y productos guardados en este dispositivo.
        </p>
        <p className="mt-3 text-sm">
          Estado: {online ? "conexion detectada" : "sin red"}
        </p>
        <Button className="mt-6 w-full" onClick={retry}>
          <ArrowClockwiseIcon />
          Reintentar
        </Button>
        {hasOfflineData && (
          <Button asChild className="mt-3 w-full" variant="outline">
            <a href="/~offline/datos">Consultar datos offline</a>
          </Button>
        )}
      </section>
    </main>
  );
}
