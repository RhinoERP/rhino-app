"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ordersQueryKey } from "@/modules/orders/queries/query-keys";
import {
  ORDER_STATUS_CONFIG,
  type OrderFlowStatus,
} from "@/modules/orders/types";

// Qué área se notifica para cada estado
const STATUS_AREA: Partial<Record<OrderFlowStatus, string>> = {
  PENDING_FINANCE: "Finanzas",
  PENDING_STOCK: "Compras",
  PURCHASE_REQUIRED: "Compras",
  IN_PRODUCTION: "Producción",
  DESIGN_REVIEW: "Producción",
  PREPARING: "Despacho",
  DISPATCHED: "Despacho",
};

const STATUS_ROUTES: Partial<Record<OrderFlowStatus, string>> = {
  PENDING_FINANCE: "finanzas/aprobacion-pedidos",
  PENDING_STOCK: "compras/stock-pedidos",
  PURCHASE_REQUIRED: "compras/stock-pedidos",
  IN_PRODUCTION: "produccion",
  DESIGN_REVIEW: "produccion",
  PREPARING: "despacho",
  DISPATCHED: "despacho",
};

type OrderRealtimePayload = {
  new: {
    id: string;
    order_number: string;
    status: OrderFlowStatus;
    organization_id: string;
  };
  old: {
    status: OrderFlowStatus;
  };
};

type Props = {
  orgSlug: string;
  organizationId: string;
};

export function OrderRealtimeNotifications({ orgSlug, organizationId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // biome-ignore lint/suspicious/noExplicitAny: Supabase Realtime types don't match postgres_changes signature
    const channel = (supabase as any)
      .channel(`orders-org-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload: OrderRealtimePayload) => {
          const newStatus = payload.new?.status;
          const oldStatus = payload.old?.status;
          const orderNumber = payload.new?.order_number;

          if (!newStatus || newStatus === oldStatus) {
            return;
          }

          const config = ORDER_STATUS_CONFIG[newStatus];
          const area = STATUS_AREA[newStatus];
          const route = STATUS_ROUTES[newStatus];

          if (!area) {
            return;
          }

          toast(`📦 Pedido ${orderNumber}`, {
            description: `${config.label} — requiere atención en ${area}`,
            duration: 8000,
            action: route
              ? {
                  label: `Ir a ${area}`,
                  onClick: () => {
                    router.push(`/org/${orgSlug}/${route}`);
                    queryClient.invalidateQueries({
                      queryKey: ordersQueryKey(orgSlug),
                    });
                  },
                }
              : undefined,
          });

          queryClient.invalidateQueries({
            queryKey: ordersQueryKey(orgSlug),
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload: { new: { order_number: string } }) => {
          toast(`📦 Nuevo pedido ${payload.new?.order_number}`, {
            description: "Enviado a revisión de Finanzas",
            duration: 6000,
            action: {
              label: "Ver en Finanzas",
              onClick: () => {
                router.push(`/org/${orgSlug}/finanzas/aprobacion-pedidos`);
              },
            },
          });
          queryClient.invalidateQueries({
            queryKey: ordersQueryKey(orgSlug),
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [orgSlug, organizationId, router, queryClient]);

  return null;
}
