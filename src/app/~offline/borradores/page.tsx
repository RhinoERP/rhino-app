"use client";

import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  FileTextIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StoredOfflineCommand } from "@/modules/offline/contracts/offline-command-record";
import type { OfflinePreSaleDraft } from "@/modules/offline/contracts/offline-pre-sale-draft";
import type { SellerOfflineSnapshotV1 } from "@/modules/offline/contracts/seller-offline-snapshot";
import {
  clearActiveOfflinePreSaleDraft,
  deleteOfflineCommand,
  deleteOfflinePreSaleDraft,
  getActiveSellerSnapshot,
  isSellerSnapshotExpired,
  listOfflineCommands,
  listOfflinePreSaleDrafts,
  selectOfflinePreSaleDraft,
} from "@/modules/offline/storage/offline-db";
import { replayOfflineCommands } from "@/modules/offline/sync/offline-command-sync";
import { OFFLINE_SYNC_CHANNEL_NAME } from "@/modules/offline/sync/offline-sync-events";

type PageState = {
  snapshot: SellerOfflineSnapshotV1;
  drafts: OfflinePreSaleDraft[];
  commands: StoredOfflineCommand[];
} | null;

const statusLabels: Record<StoredOfflineCommand["status"], string> = {
  queued: "Pendiente",
  syncing: "Sincronizando",
  "requires-review": "Requiere revisión",
  failed: "Fallida",
  synced: "Sincronizada",
};

const getDraftTotal = (draft: OfflinePreSaleDraft) =>
  draft.payload.items.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0
  );

export default function OfflineDraftsPage() {
  const [state, setState] = useState<PageState>(null);
  const [loading, setLoading] = useState(true);
  const [retryingCommandId, setRetryingCommandId] = useState<string | null>(
    null
  );

  useEffect(() => {
    let active = true;
    const loadDrafts = async () => {
      try {
        const record = await getActiveSellerSnapshot();
        if (!(record && active)) {
          return;
        }
        const [drafts, commands] = await Promise.all([
          listOfflinePreSaleDrafts(record.ownerUserId, record.organizationId),
          listOfflineCommands(record.ownerUserId, record.organizationId),
        ]);
        if (active) {
          setState({ snapshot: record.snapshot, drafts, commands });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    const handlePageShow = () => {
      if (active) {
        setLoading(true);
      }
      loadDrafts().catch(() => {
        if (active) {
          setLoading(false);
        }
      });
    };

    handlePageShow();
    window.addEventListener("pageshow", handlePageShow);
    const channel =
      "BroadcastChannel" in globalThis
        ? new BroadcastChannel(OFFLINE_SYNC_CHANNEL_NAME)
        : null;
    channel?.addEventListener("message", handlePageShow);

    return () => {
      active = false;
      window.removeEventListener("pageshow", handlePageShow);
      channel?.removeEventListener("message", handlePageShow);
      channel?.close();
    };
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <ArrowClockwiseIcon className="size-7 animate-spin text-primary" />
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-center">
        <section>
          <WarningCircleIcon className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 font-semibold text-xl">No hay datos offline</h1>
          <Button asChild className="mt-6">
            <a href="/~offline/datos">Volver</a>
          </Button>
        </section>
      </main>
    );
  }

  const expired = isSellerSnapshotExpired(state.snapshot);

  const createDraft = async () => {
    await clearActiveOfflinePreSaleDraft();
    window.location.assign("/~offline/preventa");
  };

  const openDraft = async (draftId: string) => {
    const command = state.commands.find((entry) => entry.draftId === draftId);
    if (command) {
      if (command.status === "queued" || command.status === "syncing") {
        return;
      }
      await deleteOfflineCommand(command.commandId);
    }
    await selectOfflinePreSaleDraft(draftId);
    window.location.assign("/~offline/preventa");
  };

  const removeDraft = async (draftId: string) => {
    const command = state.commands.find((entry) => entry.draftId === draftId);
    if (command) {
      await deleteOfflineCommand(command.commandId);
    }
    await deleteOfflinePreSaleDraft(draftId);
    setState((current) =>
      current
        ? {
            ...current,
            drafts: current.drafts.filter((draft) => draft.draftId !== draftId),
            commands: current.commands.filter(
              (entry) => entry.draftId !== draftId
            ),
          }
        : null
    );
  };

  const retryCommand = async (commandId: string) => {
    setRetryingCommandId(commandId);
    try {
      const [result] = await replayOfflineCommands(commandId, true);
      if (result?.status === "synced") {
        toast.success("Preventa sincronizada correctamente");
      } else {
        toast.error(
          result?.lastError?.message ?? "No se pudo sincronizar la preventa"
        );
      }
      window.location.assign("/~offline/borradores");
    } catch {
      toast.error("No se pudo iniciar la sincronizacion");
      setRetryingCommandId(null);
    }
  };

  return (
    <main className="min-h-dvh bg-muted/30 pb-8">
      <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button asChild size="icon-sm" variant="ghost">
            <a aria-label="Volver a datos offline" href="/~offline/datos">
              <ArrowLeftIcon />
            </a>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold">Borradores offline</h1>
            <p className="truncate text-muted-foreground text-xs">
              {state.snapshot.organization.name}
            </p>
          </div>
          <Badge variant="secondary">{state.drafts.length}</Badge>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-3 p-4">
        {expired && (
          <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <WarningCircleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
            <p>
              Actualizá los datos offline antes de crear o editar borradores.
            </p>
          </div>
        )}

        <Button className="w-full" disabled={expired} onClick={createDraft}>
          <PlusIcon /> Nuevo borrador
        </Button>

        {state.drafts.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center">
              <FileTextIcon className="mx-auto size-10 text-muted-foreground" />
              <p className="mt-3 font-medium">No hay borradores locales</p>
              <p className="text-muted-foreground text-sm">
                Creá una preventa para comenzar.
              </p>
            </CardContent>
          </Card>
        )}

        {state.drafts.map((draft) => {
          const command = state.commands.find(
            (entry) => entry.draftId === draft.draftId
          );
          const customer = state.snapshot.customers.find(
            (entry) => entry.id === draft.payload.customerId
          );
          return (
            <Card key={draft.draftId}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <button
                    className="min-w-0 flex-1 text-left"
                    disabled={
                      expired ||
                      command?.status === "queued" ||
                      command?.status === "syncing"
                    }
                    onClick={() => openDraft(draft.draftId)}
                    type="button"
                  >
                    <p className="truncate font-medium">
                      {customer?.fantasyName ||
                        customer?.businessName ||
                        "Sin cliente"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {draft.payload.items.length} productos · Actualizado{" "}
                      {formatDistanceToNow(new Date(draft.updatedAt), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </p>
                    <p className="mt-2 font-semibold">
                      {new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                      }).format(getDraftTotal(draft))}
                    </p>
                    {command && (
                      <div className="mt-2 space-y-1">
                        <Badge
                          variant={
                            command.status === "failed" ||
                            command.status === "requires-review"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {statusLabels[command.status]}
                        </Badge>
                        {command.lastError && (
                          <p className="text-muted-foreground text-xs">
                            {command.lastError.message}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                  {command?.status === "queued" && (
                    <Button
                      aria-label="Reintentar sincronizacion"
                      disabled={retryingCommandId === command.commandId}
                      onClick={() => retryCommand(command.commandId)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <ArrowClockwiseIcon
                        className={
                          retryingCommandId === command.commandId
                            ? "animate-spin"
                            : undefined
                        }
                      />
                    </Button>
                  )}
                  <Button
                    aria-label="Eliminar borrador"
                    onClick={() => removeDraft(draft.draftId)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
