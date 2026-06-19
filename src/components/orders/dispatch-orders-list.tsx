"use client";

import {
  ArrowElbowDownRight,
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  PackageIcon,
  TruckIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dispatchChildOrderAction } from "@/modules/orders/actions/dispatch-child-order.action";
import type { ChildOrderForDispatch } from "@/modules/orders/types";
import { generateRemittanceNumber } from "@/modules/organizations/actions/generate-remittance-number.action";
import { getRemittanceSettings } from "@/modules/organizations/actions/get-remittance-settings.action";
import { OrderStatusBadge } from "./order-status-badge";

function getRemitoPlaceholder(
  isGenerating: boolean,
  autoNumbering: boolean
): string {
  if (isGenerating) {
    return "Generando...";
  }
  if (autoNumbering) {
    return "Auto-generado";
  }
  return "Número de remito";
}

type DispatchOrdersListProps = {
  orders: ChildOrderForDispatch[];
  orgSlug: string;
};

export function DispatchOrdersList({
  orders,
  orgSlug,
}: DispatchOrdersListProps) {
  const preparing = orders.filter((o) => o.status === "PREPARING");
  const dispatched = orders.filter((o) => o.status === "DISPATCHED");
  const delivered = orders.filter((o) => o.status === "DELIVERED");

  if (
    preparing.length === 0 &&
    dispatched.length === 0 &&
    delivered.length === 0
  ) {
    return (
      <div className="rounded-md border">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TruckIcon className="size-6" weight="duotone" />
            </EmptyMedia>
            <EmptyTitle>Sin pedidos en despacho</EmptyTitle>
            <EmptyDescription>
              No hay pedidos en preparación, despachados o entregados.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DispatchSection
        count={preparing.length}
        icon={PackageIcon}
        title="Preparando"
      >
        <PreparingGroupedList orders={preparing} orgSlug={orgSlug} />
      </DispatchSection>

      <DispatchSection
        count={dispatched.length}
        icon={TruckIcon}
        title="Despachados"
      >
        {dispatched.map((order) => (
          <ReadOnlyOrderCard key={order.id} order={order} />
        ))}
      </DispatchSection>

      <DispatchSection
        count={delivered.length}
        icon={CheckCircleIcon}
        title="Entregados"
      >
        {delivered.map((order) => (
          <ReadOnlyOrderCard key={order.id} order={order} />
        ))}
      </DispatchSection>
    </div>
  );
}

type PreparingGroupedListProps = {
  orders: ChildOrderForDispatch[];
  orgSlug: string;
};

function PreparingGroupedList({ orders, orgSlug }: PreparingGroupedListProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, ChildOrderForDispatch[]>();
    for (const o of orders) {
      const group = map.get(o.parent_order_id);
      if (group) {
        group.push(o);
      } else {
        map.set(o.parent_order_id, [o]);
      }
    }
    return map;
  }, [orders]);

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([parentId, groupOrders]) => (
        <ParentGroup
          key={parentId}
          orders={groupOrders}
          orgSlug={orgSlug}
          parentId={parentId}
        />
      ))}
    </div>
  );
}

type ParentGroupProps = {
  parentId: string;
  orders: ChildOrderForDispatch[];
  orgSlug: string;
};

function ParentGroup({ parentId, orders, orgSlug }: ParentGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const first = orders[0];
  const isUnified = orders.length === 1 && orders[0].id === parentId;

  return (
    <div className="space-y-2">
      <Card className="overflow-hidden">
        <CardHeader
          className={cn(
            "cursor-pointer gap-2 sm:flex-row sm:items-center sm:justify-between",
            isExpanded && "border-b"
          )}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="font-mono font-semibold text-sm">
              {first.parent_order_number}
            </span>
            <span className="truncate text-muted-foreground text-sm">
              {first.parent_customer_name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isUnified && (
              <span className="text-muted-foreground text-xs">
                {orders.length} {orders.length === 1 ? "envío" : "envíos"}
              </span>
            )}
            {isExpanded ? (
              <CaretUpIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="space-y-3 pt-4">
            {orders.map((child) => (
              <PreparingChildCard
                child={child}
                key={child.id}
                orgSlug={orgSlug}
              />
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

type PreparingChildCardProps = {
  child: ChildOrderForDispatch;
  orgSlug: string;
};

function PreparingChildCard({ child, orgSlug }: PreparingChildCardProps) {
  const [isPending, startTransition] = useTransition();
  const [remitoNumber, setRemitoNumber] = useState("");
  const [autoNumbering, setAutoNumbering] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setRemitoNumber("");
    setAutoNumbering(false);
    setIsGenerating(true);

    getRemittanceSettings(orgSlug).then((settings) => {
      if (settings.success && settings.data?.autoEnabled) {
        setAutoNumbering(true);
        generateRemittanceNumber(orgSlug).then((result) => {
          if (result.success && result.number) {
            setRemitoNumber(result.number);
          }
          setIsGenerating(false);
        });
      } else {
        setIsGenerating(false);
      }
    });
  }, [orgSlug]);

  function handleDispatch() {
    if (!remitoNumber.trim()) {
      toast.error("El número de remito es obligatorio");
      return;
    }

    startTransition(async () => {
      const result = await dispatchChildOrderAction({
        orgSlug,
        childOrderId: child.id,
        remitoNumber: remitoNumber.trim(),
      });

      if (result.success) {
        toast.success(`Despachado — Remito ${remitoNumber.trim()}`);
        setRemitoNumber("");
      } else {
        toast.error(`Error al despachar: ${result.error}`);
      }
    });
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center gap-2 py-2.5">
        <ArrowElbowDownRight className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-mono font-semibold text-sm">
          {child.order_number}
        </span>
        <OrderStatusBadge status={child.status} />
      </CardHeader>
      <CardContent className="space-y-4 pt-0 pb-3">
        {child.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pr-2 pb-1 text-left font-medium">Producto</th>
                  <th className="pb-1 pl-2 text-right font-medium">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {child.items.map((item) => (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="py-1 pr-2">{item.description}</td>
                    <td className="py-1 pl-2 text-right tabular-nums">
                      {item.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <label
              className="mb-1 block font-medium text-sm"
              htmlFor={`remito-${child.id}`}
            >
              Número de remito
            </label>
            <Input
              disabled={isGenerating || isPending}
              id={`remito-${child.id}`}
              onChange={(e) => setRemitoNumber(e.target.value)}
              placeholder={getRemitoPlaceholder(isGenerating, autoNumbering)}
              value={remitoNumber}
            />
          </div>

          <Button
            disabled={isPending || isGenerating}
            onClick={handleDispatch}
            size="sm"
          >
            <TruckIcon className="mr-1 h-4 w-4" />
            {isPending ? "Despachando..." : "Despachar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReadOnlyOrderCard({ order }: { order: ChildOrderForDispatch }) {
  return (
    <Card className="overflow-hidden opacity-75 transition-shadow">
      <CardHeader className="flex flex-row items-center gap-2 py-2.5">
        <span className="font-mono font-semibold text-sm">
          {order.order_number}
        </span>
        <OrderStatusBadge status={order.status} />
        <span className="truncate text-muted-foreground text-sm">
          {order.parent_customer_name}
        </span>
      </CardHeader>
      {order.items.length > 0 && (
        <CardContent className="space-y-2 pt-0 pb-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pr-2 pb-1 text-left font-medium">Producto</th>
                  <th className="pb-1 pl-2 text-right font-medium">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr className="border-b last:border-0" key={item.id}>
                    <td className="py-1 pr-2">{item.description}</td>
                    <td className="py-1 pl-2 text-right tabular-nums">
                      {item.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

type DispatchSectionProps = {
  title: string;
  icon: React.ElementType;
  count: number;
  children: React.ReactNode;
};

function DispatchSection({
  title,
  icon: Icon,
  count,
  children,
}: DispatchSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-muted-foreground" weight="duotone" />
        <h2 className="font-heading font-semibold text-lg">{title}</h2>
        <span className="ml-auto inline-flex items-center rounded-full border bg-muted px-2.5 py-0.5 font-medium text-xs tabular-nums">
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
