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
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/components/auth/permissions-provider";
import { Button } from "@/components/ui/button";
import { sellerOfflineSnapshotV1Schema } from "@/modules/offline/contracts/seller-offline-snapshot";
import {
  getSellerSnapshot,
  isSellerSnapshotExpired,
  type StoredSellerSnapshot,
  saveSellerSnapshot,
} from "@/modules/offline/storage/offline-db";

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
  record: StoredSellerSnapshot | null
) {
  if (loading) {
    return "Revisando datos locales...";
  }
  if (!record) {
    return "Descarga clientes, productos y precios de referencia";
  }
  return `${record.snapshot.customers.length} clientes, ${record.snapshot.products.length} productos, ${formatBytes(record.byteSize)} · ${formatDistanceToNow(new Date(record.downloadedAt), { addSuffix: true, locale: es })}`;
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
  const canPrepare =
    wholesaleEnabled && (can("sales.manage") || can("sales.manage.all"));

  const loadLocalSnapshot = useCallback(async () => {
    const local = await getSellerSnapshot(ownerUserId, organizationId);
    setRecord(local);
    setLoading(false);
  }, [organizationId, ownerUserId]);

  useEffect(() => {
    loadLocalSnapshot().catch(() => setLoading(false));
  }, [loadLocalSnapshot]);

  if (!canPrepare) {
    return null;
  }

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(
        `/api/v1/org/${encodeURIComponent(orgSlug)}/seller-offline-snapshot`,
        { cache: "no-store" }
      );
      const body = await response.text();
      const payload = JSON.parse(body) as unknown;

      if (!response.ok) {
        const error = payload as { error?: string };
        throw new Error(error.error ?? "No se pudieron preparar los datos");
      }

      const snapshot = sellerOfflineSnapshotV1Schema.parse(payload);
      if (
        snapshot.ownerUserId !== ownerUserId ||
        snapshot.organizationId !== organizationId
      ) {
        throw new Error("El snapshot no corresponde a la sesion actual");
      }

      const saved = await saveSellerSnapshot(snapshot, new Blob([body]).size);
      setRecord(saved);
      navigator.storage?.persist?.().catch(() => false);
      toast.success("Datos preparados para trabajar sin conexion");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el snapshot"
      );
    } finally {
      setDownloading(false);
    }
  };

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
            {getStatusDescription(loading, record)}
          </p>
        </div>
        <Button
          aria-label={
            record ? "Actualizar datos offline" : "Preparar datos offline"
          }
          disabled={downloading || loading}
          onClick={download}
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
