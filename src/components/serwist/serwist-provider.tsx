"use client";

import { captureException } from "@sentry/nextjs";
import {
  SerwistProvider as BaseSerwistProvider,
  useSerwist,
} from "@serwist/turbopack/react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { toast } from "sonner";
import { trackPwaEvent } from "@/lib/pwa-telemetry";

function UpdateLifecycle() {
  const { serwist } = useSerwist();

  useEffect(() => {
    if (!serwist) {
      return;
    }

    const showUpdateToast = () => {
      trackPwaEvent("pwa.service_worker_waiting");
      toast("Nueva version disponible", {
        description: "Actualiza cuando hayas terminado lo que estas haciendo.",
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: "Actualizar",
          onClick: () => {
            trackPwaEvent("pwa.update_accepted");
            serwist.messageSkipWaiting();
          },
        },
      });
    };
    const reloadWhenControlling = () => {
      trackPwaEvent("pwa.service_worker_controlling");
      window.location.reload();
    };

    serwist.addEventListener("waiting", showUpdateToast);
    serwist.addEventListener("controlling", reloadWhenControlling);
    navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => {
        if (registration?.waiting) {
          showUpdateToast();
        }
      })
      .catch((error) => {
        captureException(error, {
          tags: { feature: "pwa-registration" },
        });
        trackPwaEvent("pwa.service_worker_register_failed");
      });

    return () => {
      serwist.removeEventListener("waiting", showUpdateToast);
      serwist.removeEventListener("controlling", reloadWhenControlling);
    };
  }, [serwist]);

  return null;
}

export function SerwistProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  return (
    <BaseSerwistProvider
      cacheOnNavigation={false}
      disable={!enabled}
      reloadOnOnline={false}
      swUrl="/serwist/sw.js"
    >
      {children}
      {enabled && <UpdateLifecycle />}
    </BaseSerwistProvider>
  );
}
