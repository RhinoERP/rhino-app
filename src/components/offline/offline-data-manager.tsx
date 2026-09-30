"use client";

import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CloudArrowDownIcon,
  DatabaseIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/components/auth/permissions-provider";
import { Button } from "@/components/ui/button";
import {
  getSellerSnapshot,
  isSellerSnapshotExpired,
  type StoredSellerSnapshot,
} from "@/modules/offline/storage/offline-db";
import {
  OFFLINE_SNAPSHOT_REFRESH_INTERVAL_MS,
  refreshSellerOfflineSnapshot,
} from "@/modules/offline/sync/offline-snapshot-refresh";

type OfflineDataManagerProps = {
  orgSlug: string;
  organizationId: string;
  ownerUserId: string;
  wholesaleEnabled: boolean;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function StatusIcon({
  expired,
  hasSnapshot,
}: {
  expired: boolean;
  hasSnapshot: boolean;
}) {
  if (expired) {
    return <WarningCircleIcon className="size-5" weight="duotone" />;
  }
  if (hasSnapshot) {
    return <CheckCircleIcon className="size-5" weight="duotone" />;
  }
  return <DatabaseIcon className="size-5" weight="duotone" />;
}

function getStatusTitle(expired: boolean, hasSnapshot: boolean) {
  if (expired) {
    return "Datos offline vencidos";
  }
  if (hasSnapshot) {
    return "Datos offline listos";
  }
  return "Preparar datos offline";
}

function getStatusDescription(
  loading: boolean,
  record: StoredSellerSnapshot | null,
  refreshError: string | null
) {
  if (loading) {
    return "Revisando datos locales...";
  }
  if (!record) {
    if (refreshError) {
      return refreshError;
    }
    return "Descarga clientes, productos y precios de referencia";
  }
  return `Listos para usar sin conexion · ${record.snapshot.customers.length} clientes, ${record.snapshot.products.length} productos, ${formatBytes(record.byteSize)} · verificados ${formatDistanceToNow(new Date(record.lastCheckedAt), { addSuffix: true, locale: es })}`;
}

function ActionIcon({
  downloading,
  hasSnapshot,
}: {
  downloading: boolean;
  hasSnapshot: boolean;
}) {
  if (downloading) {
    return <ArrowClockwiseIcon className="animate-spin" />;
  }
  if (hasSnapshot) {
    return <ArrowClockwiseIcon />;
  }
  return <CloudArrowDownIcon />;
}

function getActionLabel(downloading: boolean, hasSnapshot: boolean) {
  if (downloading) {
    return "Cancelar actualizacion offline";
  }
  return hasSnapshot ? "Actualizar datos offline" : "Preparar datos offline";
}

function showRefreshError(error: unknown, showFeedback: boolean) {
  if (!showFeedback) {
    return;
  }
  toast.error(
    error instanceof Error
      ? error.message
      : "No se pudieron actualizar los datos offline"
  );
}

function handleRefreshSuccess(
  status: "skipped" | "unchanged" | "updated",
  showFeedback: boolean
) {
  if (status === "updated") {
    navigator.storage?.persist?.().catch(() => false);
    if (showFeedback) {
      toast.success("Datos offline actualizados");
    }
  } else if (status === "unchanged" && showFeedback) {
    toast.success("Los datos offline ya estan actualizados");
  }
}

function canStartRefresh(inFlight: boolean, showFeedback: boolean) {
  if (inFlight) {
    return false;
  }
  if (navigator.onLine) {
    return true;
  }
  if (showFeedback) {
    toast.error("No hay conexion para actualizar los datos offline");
  }
  return false;
}

export function OfflineDataManager({
  orgSlug,
  organizationId,
  ownerUserId,
  wholesaleEnabled,
}: OfflineDataManagerProps) {
  const { can } = usePermissions();
  const [record, setRecord] = useState<StoredSellerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const canPrepare =
    wholesaleEnabled && (can("sales.manage") || can("sales.manage.all"));

  const loadLocalSnapshot = useCallback(async () => {
    const local = await getSellerSnapshot(ownerUserId, organizationId);
    setRecord(local);
    setLoading(false);
  }, [organizationId, ownerUserId]);

  const refreshSnapshot = useCallback(
    async (force: boolean, showFeedback: boolean) => {
      if (!canStartRefresh(Boolean(abortRef.current), showFeedback)) {
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setDownloading(true);
      setRefreshError(null);
      try {
        const result = await refreshSellerOfflineSnapshot({
          force,
          organizationId,
          orgSlug,
          ownerUserId,
          signal: controller.signal,
        });
        setRecord(result.record);
        handleRefreshSuccess(result.status, showFeedback);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setRefreshError(
          error instanceof Error
            ? error.message
            : "No se pudieron actualizar los datos offline"
        );
        showRefreshError(error, showFeedback);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setDownloading(false);
        }
      }
    },
    [organizationId, orgSlug, ownerUserId]
  );

  useEffect(() => {
    loadLocalSnapshot().catch(() => setLoading(false));
  }, [loadLocalSnapshot]);

  useEffect(() => {
    if (!canPrepare || loading) {
      return;
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (!standalone) {
      return;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        refreshSnapshot(false, false).catch(() => null);
      }
    };
    const initialRefresh = window.setTimeout(refreshIfVisible, 0);
    const interval = window.setInterval(
      refreshIfVisible,
      OFFLINE_SNAPSHOT_REFRESH_INTERVAL_MS
    );
    window.addEventListener("online", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      window.removeEventListener("online", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      abortRef.current?.abort();
    };
  }, [canPrepare, loading, refreshSnapshot]);

  if (!canPrepare) {
    return null;
  }

  const expired = record ? isSellerSnapshotExpired(record.snapshot) : false;

  return (
    <section className="mx-2 mt-2 rounded-xl border bg-card p-3 shadow-sm md:hidden">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <StatusIcon expired={expired} hasSnapshot={Boolean(record)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">
            {getStatusTitle(expired, Boolean(record))}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            {getStatusDescription(loading, record, refreshError)}
          </p>
        </div>
        <Button
          aria-label={getActionLabel(downloading, Boolean(record))}
          disabled={loading}
          onClick={() => {
            if (downloading) {
              abortRef.current?.abort();
            } else {
              refreshSnapshot(true, true).catch(() => null);
            }
          }}
          size="icon-sm"
          variant={record && !expired ? "ghost" : "default"}
        >
          <ActionIcon downloading={downloading} hasSnapshot={Boolean(record)} />
        </Button>
      </div>
      {record && (
        <Button asChild className="mt-2 w-full" size="sm" variant="outline">
          <a href="/~offline/datos">Consultar datos descargados</a>
        </Button>
      )}
    </section>
  );
}
