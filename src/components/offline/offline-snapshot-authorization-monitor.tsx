"use client";

import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getActiveSellerSnapshot } from "@/modules/offline/storage/offline-db";
import {
  type OfflineOrganizationPurgedEvent,
  subscribeToOfflineOrganizationPurges,
} from "@/modules/offline/sync/offline-data-events";
import {
  OFFLINE_SNAPSHOT_REFRESH_INTERVAL_MS,
  refreshSellerOfflineSnapshot,
} from "@/modules/offline/sync/offline-snapshot-refresh";

type Identity = {
  organizationId: string;
  orgSlug: string;
  ownerUserId: string;
};

function identityKey(
  identity: Pick<Identity, "organizationId" | "ownerUserId">
) {
  return `${identity.ownerUserId}:${identity.organizationId}`;
}

function isAlreadyPurged(
  identity: Identity,
  pendingPurges: Set<string>
): boolean {
  return pendingPurges.has(identityKey(identity));
}

function shouldSkipValidation(isDisposed: boolean, inFlight: boolean) {
  return isDisposed || inFlight;
}

function LoadingAuthorization() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background">
      <ArrowClockwiseIcon className="size-7 animate-spin text-primary" />
    </main>
  );
}

function AccessRevoked() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <section className="w-full max-w-sm text-center">
        <WarningCircleIcon className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 font-semibold text-xl">Acceso offline revocado</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Se eliminaron los datos offline de esta organización. Volvé a Rhinos
          con conexión para verificar tus permisos y preparar datos nuevos.
        </p>
        <Button asChild className="mt-6 w-full">
          <a href="/">Volver a Rhinos</a>
        </Button>
      </section>
    </main>
  );
}

export function OfflineSnapshotAuthorizationMonitor({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const identityRef = useRef<Identity | null>(null);
  const pendingPurgesRef = useRef(new Set<string>());
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let disposed = false;

    const handlePurged = (event: OfflineOrganizationPurgedEvent) => {
      const key = identityKey(event);
      pendingPurgesRef.current.add(key);
      if (identityRef.current && identityKey(identityRef.current) === key) {
        abortRef.current?.abort();
        setAccessRevoked(true);
        setReady(true);
      }
    };
    const unsubscribe = subscribeToOfflineOrganizationPurges(handlePurged);

    const validateStoredSnapshot = async (signal: AbortSignal) => {
      const snapshot = await getActiveSellerSnapshot();
      if (!snapshot) {
        const previousIdentity = identityRef.current;
        const wasPurged =
          previousIdentity &&
          isAlreadyPurged(previousIdentity, pendingPurgesRef.current);
        if (!wasPurged) {
          identityRef.current = null;
        }
        setAccessRevoked(Boolean(wasPurged));
        return;
      }

      const identity: Identity = {
        organizationId: snapshot.organizationId,
        orgSlug: snapshot.orgSlug,
        ownerUserId: snapshot.ownerUserId,
      };
      identityRef.current = identity;
      if (isAlreadyPurged(identity, pendingPurgesRef.current)) {
        setAccessRevoked(true);
        return;
      }

      const result = await refreshSellerOfflineSnapshot({
        force: true,
        ...identity,
        signal,
      });
      setAccessRevoked(result.status === "revoked");
    };

    const finishValidation = (controller: AbortController) => {
      inFlightRef.current = false;
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!disposed) {
        setReady(true);
      }
    };

    const validateSnapshot = async () => {
      if (shouldSkipValidation(disposed, inFlightRef.current)) {
        return;
      }
      if (!navigator.onLine) {
        setReady(true);
        return;
      }

      inFlightRef.current = true;
      setReady(false);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await validateStoredSnapshot(controller.signal);
      } catch {
        // A transient server/network failure does not revoke a still-valid local snapshot.
      } finally {
        finishValidation(controller);
      }
    };

    const handleOnline = () => {
      validateSnapshot().catch(() => null);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleOnline();
      }
    };

    validateSnapshot().catch(() => {
      if (!disposed) {
        setReady(true);
      }
    });
    const interval = window.setInterval(
      handleOnline,
      OFFLINE_SNAPSHOT_REFRESH_INTERVAL_MS
    );
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handleOnline);

    return () => {
      disposed = true;
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handleOnline);
      abortRef.current?.abort();
    };
  }, []);

  if (!ready) {
    return <LoadingAuthorization />;
  }
  if (accessRevoked) {
    return <AccessRevoked />;
  }
  return children;
}
