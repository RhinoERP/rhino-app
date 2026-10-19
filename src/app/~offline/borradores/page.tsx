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
import { OfflineCommandSync } from "@/components/offline/offline-command-sync";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [pendingAction, setPendingAction] = useState<{
    kind: "edit" | "delete";
    draftId: string;
    description: string;
  } | null>(null);

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
    await clearActiveOfflinePreSaleDraft(
      state.snapshot.ownerUserId,
      state.snapshot.organizationId
    );
    window.location.assign("/~offline/preventa");
  };

  const openDraft = async (draftId: string) => {
    const command = state.commands.find((entry) => entry.draftId === draftId);
    if (command) {
      if (command.status === "queued" || command.status === "syncing") {
        return;
      }
      setPendingAction({
        kind: "edit",
        draftId,
        description:
          command.status === "synced"
            ? "Esta operación ya fue aceptada por el servidor. Editar el borrador no modifica ni cancela esa venta. Se creará una nueva versión editable."
            : "Se quitará esta operación de la cola local y se conservará el borrador para editarlo. Esto no puede cancelar trabajo que el servidor ya haya aceptado.",
      });
      return;
    }
    await selectOfflinePreSaleDraft(
      draftId,
      state.snapshot.ownerUserId,
      state.snapshot.organizationId
    );
    window.location.assign("/~offline/preventa");
  };

  const editDraftWithCommand = async (draftId: string) => {
    const command = state.commands.find((entry) => entry.draftId === draftId);
    if (command) {
      const deleted = await deleteOfflineCommand(
        command.commandId,
        state.snapshot.ownerUserId,
        state.snapshot.organizationId
      );
      if (!deleted) {
        toast.error(
          "La preventa comenzó a sincronizarse y ya no puede editarse"
        );
        window.location.assign("/~offline/borradores");
        return;
      }
    }
    await selectOfflinePreSaleDraft(
      draftId,
      state.snapshot.ownerUserId,
      state.snapshot.organizationId
    );
    window.location.assign("/~offline/preventa");
  };

  const removeDraft = async (draftId: string) => {
    const command = state.commands.find((entry) => entry.draftId === draftId);
    if (command?.status === "syncing") {
      return;
    }
    if (command) {
      setPendingAction({
        kind: "delete",
        draftId,
        description:
          "Se eliminarán el borrador y su operación local. La eliminación local no puede cancelar trabajo que el servidor ya haya aceptado.",
      });
      return;
    }
    await removeDraftWithCommand(draftId);
  };

  const removeDraftWithCommand = async (draftId: string) => {
    const command = state.commands.find((entry) => entry.draftId === draftId);
    if (command) {
      const deleted = await deleteOfflineCommand(
        command.commandId,
        state.snapshot.ownerUserId,
        state.snapshot.organizationId
      );
      if (!deleted) {
        toast.error(
          "La preventa comenzó a sincronizarse y ya no puede eliminarse"
        );
        window.location.assign("/~offline/borradores");
        return;
      }
    }
    await deleteOfflinePreSaleDraft(
      draftId,
      state.snapshot.ownerUserId,
      state.snapshot.organizationId
    );
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
      const command = state.commands.find(
        (entry) => entry.commandId === commandId
      );
      const results = command
        ? await replayOfflineCommands(command.ownerUserId, commandId, true)
        : [];
      const result = results.find((entry) => entry.commandId === commandId);
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

  const confirmPendingAction = async () => {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) {
      return;
    }
    if (action.kind === "edit") {
      await editDraftWithCommand(action.draftId);
    } else {
      await removeDraftWithCommand(action.draftId);
    }
  };

  return (
    <main className="min-h-dvh bg-muted/30 pb-8">
      <OfflineCommandSync ownerUserId={state.snapshot.ownerUserId} />
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
                          <div className="text-muted-foreground text-xs">
                            <p>{command.lastError.message}</p>
                            {command.lastError.changes?.map((change) => (
                              <p key={`${change.path}:${change.message}`}>
                                {change.message}: {String(change.capturedValue)}{" "}
                                → {String(change.currentValue)}
                              </p>
                            ))}
                          </div>
                        )}
                        <p className="text-muted-foreground text-xs">
                          Intentos: {command.attemptCount}
                          {command.nextAttemptAt
                            ? ` · Próximo reintento ${formatDistanceToNow(new Date(command.nextAttemptAt), { addSuffix: true, locale: es })}`
                            : ""}
                        </p>
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
                    disabled={command?.status === "syncing"}
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
      <AlertDialog
        onOpenChange={(open) => !open && setPendingAction(null)}
        open={pendingAction !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind === "edit"
                ? "Editar operación local"
                : "Eliminar operación local"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingAction}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
