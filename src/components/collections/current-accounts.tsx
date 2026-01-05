"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type {
  PayableAccount,
  ReceivableAccount,
} from "@/modules/collections/types";
import { CollectionActionsMenu } from "./collection-actions-menu";

type CustomerGroup = {
  id: string;
  name: string;
  fantasyName?: string | null;
  pending: number;
  items: Array<{
    id: string;
    organizationId: string;
    label: string;
    dueDate: string;
    status: ReceivableAccount["status"];
    pending: number;
    total: number;
  }>;
};

type SupplierGroup = {
  id: string;
  name: string;
  pending: number;
  items: Array<{
    id: string;
    organizationId: string;
    label: string;
    dueDate: string;
    status: PayableAccount["status"];
    pending: number;
    total: number;
  }>;
};

const statusLabels: Record<
  CustomerGroup["items"][number]["status"],
  { label: string }
> = {
  PENDING: { label: "Pendiente" },
  PARTIAL: { label: "Parcial" },
  PAID: { label: "Pagado" },
};

function buildCustomerGroups(
  receivables: ReceivableAccount[]
): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();

  for (const account of receivables) {
    const existing = map.get(account.customer.id);
    const label =
      account.sale?.invoice_number ??
      `Venta ${account.sales_order_id.slice(0, 6)}`;

    const item = {
      id: account.id,
      organizationId: account.organization_id,
      label,
      dueDate: account.due_date,
      status: account.status,
      pending: account.pending_balance,
      total: account.total_amount,
    };

    if (existing) {
      existing.pending += account.pending_balance;
      existing.items.push(item);
      continue;
    }

    map.set(account.customer.id, {
      id: account.customer.id,
      name: account.customer.business_name,
      fantasyName: account.customer.fantasy_name,
      pending: account.pending_balance,
      items: [item],
    });
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildSupplierGroups(payables: PayableAccount[]): SupplierGroup[] {
  const map = new Map<string, SupplierGroup>();

  for (const account of payables) {
    const existing = map.get(account.supplier.id);
    const label =
      account.purchase?.purchase_number !== undefined &&
      account.purchase?.purchase_number !== null
        ? `Compra ${String(account.purchase.purchase_number).padStart(6, "0")}`
        : `Orden ${account.purchase_order_id.slice(0, 6)}`;

    const item = {
      id: account.id,
      organizationId: account.organization_id,
      label,
      dueDate: account.due_date,
      status: account.status,
      pending: account.pending_balance,
      total: account.total_amount,
    };

    if (existing) {
      existing.pending += account.pending_balance;
      existing.items.push(item);
      continue;
    }

    map.set(account.supplier.id, {
      id: account.supplier.id,
      name: account.supplier.name,
      pending: account.pending_balance,
      items: [item],
    });
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function GroupList({
  placeholder,
  groups,
  orgSlug,
  type,
}: {
  placeholder: string;
  groups: Array<CustomerGroup | SupplierGroup>;
  orgSlug: string;
  type: "receivable" | "payable";
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return groups;
    }
    const lowered = query.toLowerCase();
    return groups.filter((group) => group.name.toLowerCase().includes(lowered));
  }, [groups, query]);

  return (
    <section className="space-y-3">
      <Input
        className="w-full sm:w-80"
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        value={query}
      />

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card className="flex h-28 items-center justify-center text-muted-foreground text-sm">
            No hay cuentas para mostrar.
          </Card>
        ) : (
          filtered.map((group) => (
            <Collapsible
              className="rounded-md border bg-card px-3 py-2"
              key={group.id}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left">
                <div className="space-y-0.5">
                  <p className="font-semibold">{group.name}</p>
                  {"fantasyName" in group && group.fantasyName ? (
                    <p className="text-muted-foreground text-xs">
                      {group.fantasyName}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "movimiento" : "movimientos"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Pendiente</p>
                    <p className="font-semibold">
                      {formatCurrency(
                        group.items.reduce(
                          (sum, item) => sum + (item.pending ?? 0),
                          0
                        )
                      )}
                    </p>
                  </div>
                  <Badge className="flex items-center gap-1" variant="outline">
                    <CaretDownIcon className="h-3.5 w-3.5" weight="duotone" />
                    Ver detalle
                  </Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <Separator className="mb-3" />
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Documento</TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Pendiente</TableHead>
                        <TableHead className="w-12 text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item) => {
                        const statusInfo =
                          statusLabels[item.status] ?? statusLabels.PENDING;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.label}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatDateOnly(item.dueDate)}
                            </TableCell>
                            <TableCell className="text-sm">
                              <Badge className="rounded-full" variant="outline">
                                {statusInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatCurrency(item.total)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(item.pending)}
                            </TableCell>
                            <TableCell className="text-right">
                              <CollectionActionsMenu
                                accountId={item.id}
                                counterpartyName={group.name}
                                dueDate={item.dueDate}
                                orgId={item.organizationId}
                                orgSlug={orgSlug}
                                pendingBalance={item.pending}
                                totalAmount={item.total}
                                type={type}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))
        )}
      </div>
    </section>
  );
}

export function CurrentAccounts({
  receivables,
  payables,
  orgSlug,
}: {
  receivables?: ReceivableAccount[];
  payables?: PayableAccount[];
  orgSlug: string;
}) {
  const customerGroups = useMemo(
    () => buildCustomerGroups(receivables ?? []),
    [receivables]
  );

  const supplierGroups = useMemo(
    () => buildSupplierGroups(payables ?? []),
    [payables]
  );

  if (receivables && !payables) {
    return (
      <GroupList
        groups={customerGroups}
        orgSlug={orgSlug}
        placeholder="Buscar cliente..."
        type="receivable"
      />
    );
  }

  if (payables && !receivables) {
    return (
      <GroupList
        groups={supplierGroups}
        orgSlug={orgSlug}
        placeholder="Buscar proveedor..."
        type="payable"
      />
    );
  }

  return (
    <div className="space-y-8">
      <GroupList
        groups={customerGroups}
        orgSlug={orgSlug}
        placeholder="Buscar cliente..."
        type="receivable"
      />
      <GroupList
        groups={supplierGroups}
        orgSlug={orgSlug}
        placeholder="Buscar proveedor..."
        type="payable"
      />
    </div>
  );
}
