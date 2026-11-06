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
import {
  getWaitingWorkerIdentity,
  isSerwistWorkerScript,
  shouldNotifyWaitingWorker,
} from "@/lib/pwa-update";

const NOTIFIED_UPDATE_KEY = "rhinos:pwa-notified-update-worker:v1";

function UpdateLifecycle() {
  const { serwist } = useSerwist();

  useEffect(() => {
    if (!serwist) {
      return;
    }

    let notifiedWorkerIdentity: string | null = null;

    const notifyIfNewWaitingWorker = (serviceWorker?: ServiceWorker | null) => {
      const workerIdentity = getWaitingWorkerIdentity(serviceWorker);
      if (
        !(
          workerIdentity &&
          shouldNotifyWaitingWorker(workerIdentity, notifiedWorkerIdentity)
        )
      ) {
        return;
      }

      let previouslyNotified: string | null = null;
      try {
        previouslyNotified = window.localStorage.getItem(NOTIFIED_UPDATE_KEY);
      } catch {
        // Continue with in-memory de-duplication if storage is unavailable.
      }
      if (workerIdentity === previouslyNotified) {
        notifiedWorkerIdentity = workerIdentity;
        return;
      }
      notifiedWorkerIdentity = workerIdentity;
      try {
        window.localStorage.setItem(NOTIFIED_UPDATE_KEY, workerIdentity);
      } catch {
        // In-memory de-duplication still applies if storage is unavailable.
      }
      trackPwaEvent("pwa.service_worker_waiting");
      toast("Nueva version disponible", {
        description: "Actualiza cuando hayas terminado lo que estas haciendo.",
        duration: Number.POSITIVE_INFINITY,
        id: `pwa-update:${workerIdentity}`,
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
      try {
        window.localStorage.removeItem(NOTIFIED_UPDATE_KEY);
      } catch {
        // The browser lifecycle remains authoritative when storage is blocked.
      }
      window.location.reload();
    };

    const handleWaiting = (event: { sw?: ServiceWorker }) => {
      // Serwist includes the exact worker in its waiting event.
      notifyIfNewWaitingWorker(event.sw);
    };

    serwist.addEventListener("waiting", handleWaiting);
    serwist.addEventListener("controlling", reloadWhenControlling);
    navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => {
        if (
          registration?.waiting &&
          isSerwistWorkerScript(
            registration.waiting.scriptURL,
            window.location.origin
          )
        ) {
          notifyIfNewWaitingWorker(registration.waiting);
        }
      })
      .catch((error) => {
        captureException(error, {
          tags: { feature: "pwa-registration" },
        });
        trackPwaEvent("pwa.service_worker_register_failed");
      });

    return () => {
      serwist.removeEventListener("waiting", handleWaiting);
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
