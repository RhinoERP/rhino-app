"use client";

import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { OfflinePreSaleForm } from "@/components/offline/offline-pre-sale-form";
import { Button } from "@/components/ui/button";
import type { OfflinePreSaleDraft } from "@/modules/offline/contracts/offline-pre-sale-draft";
import type { SellerOfflineSnapshotV1 } from "@/modules/offline/contracts/seller-offline-snapshot";
import {
  getActiveOfflinePreSaleDraft,
  getActiveSellerSnapshot,
  isSellerSnapshotExpired,
} from "@/modules/offline/storage/offline-db";

type PageState = {
  snapshot: SellerOfflineSnapshotV1;
  draft: OfflinePreSaleDraft | null;
} | null;

export default function OfflinePreSalePage() {
  const [state, setState] = useState<PageState>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActiveSellerSnapshot()
      .then(async (record) => {
        if (!record) {
          return;
        }
        const draft = await getActiveOfflinePreSaleDraft(
          record.ownerUserId,
          record.organizationId
        );
        setState({ snapshot: record.snapshot, draft });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <ArrowClockwiseIcon className="size-7 animate-spin text-primary" />
      </main>
    );
  }

  if (!state || isSellerSnapshotExpired(state.snapshot)) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <section className="w-full max-w-sm text-center">
          <WarningCircleIcon className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 font-semibold text-xl">
            Datos offline no disponibles
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Necesitás descargar un snapshot vigente antes de crear una preventa
            local.
          </p>
          <Button asChild className="mt-6 w-full">
            <a href="/~offline/datos">Volver a datos offline</a>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <OfflinePreSaleForm initialDraft={state.draft} snapshot={state.snapshot} />
  );
}
