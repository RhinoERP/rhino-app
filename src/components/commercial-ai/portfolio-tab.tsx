"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CUSTOMER_STATUS,
  OPEN_STAGES,
} from "@/modules/commercial-ai/constants";
import { formatMoneyShort } from "@/modules/commercial-ai/engine/analysis";
import type { CustomerStatus } from "@/modules/commercial-ai/types";
import { Chip } from "./opportunities-tab";
import {
  formatDate,
  SectionCard,
  SellerChip,
  StatusDot,
  useCommercialAi,
} from "./shared";

const ALL = "todos";
type Tab = typeof ALL | CustomerStatus | "deuda";

export function PortfolioTab() {
  const { snapshot, isManager, openCustomer } = useCommercialAi();
  const [tab, setTab] = useState<Tab>(ALL);
  const [seller, setSeller] = useState(ALL);
  const [query, setQuery] = useState("");

  const openByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of snapshot.opportunities) {
      if (OPEN_STAGES.includes(o.effectiveStage)) {
        map.set(o.customerId, (map.get(o.customerId) ?? 0) + 1);
      }
    }
    return map;
  }, [snapshot.opportunities]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.customers
      .filter((c) => {
        if (tab === "deuda" && c.overdue <= 0) {
          return false;
        }
        if (tab !== ALL && tab !== "deuda" && c.metrics.status !== tab) {
          return false;
        }
        if (seller !== ALL && (c.sellerId ?? "sin-asignar") !== seller) {
          return false;
        }
        return !q || `${c.name} ${c.city ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.metrics.monthly - a.metrics.monthly);
  }, [snapshot.customers, tab, seller, query]);

  const count = (status: CustomerStatus) =>
    snapshot.customers.filter((c) => c.metrics.status === status).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip active={tab === ALL} onClick={() => setTab(ALL)}>
          Todos <span className="opacity-70">{snapshot.customers.length}</span>
        </Chip>
        {(Object.keys(CUSTOMER_STATUS) as CustomerStatus[]).map((status) => (
          <Chip
            active={tab === status}
            key={status}
            onClick={() => setTab(status)}
          >
            <StatusDot status={status} />
            {CUSTOMER_STATUS[status].label}
            <span className="opacity-70">{count(status)}</span>
          </Chip>
        ))}
        <Chip active={tab === "deuda"} onClick={() => setTab("deuda")}>
          Con deuda vencida
          <span className="opacity-70">
            {snapshot.customers.filter((c) => c.overdue > 0).length}
          </span>
        </Chip>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Buscar cliente"
          className="min-w-48 flex-1"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente o localidad"
          value={query}
        />
        {isManager ? (
          <Select onValueChange={setSeller} value={seller}>
            <SelectTrigger aria-label="Vendedor" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los vendedores</SelectItem>
              {snapshot.sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
              <SelectItem value="sin-asignar">Sin asignar</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <SectionCard description={`${rows.length} clientes`} title="Cartera">
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                {isManager ? <TableHead>Vendedor</TableHead> : null}
                <TableHead>Última compra</TableHead>
                <TableHead className="text-right">Compra/mes</TableHead>
                <TableHead className="text-right">Vencido</TableHead>
                <TableHead className="text-right">Oportunidades</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((customer) => (
                <TableRow
                  className="cursor-pointer"
                  key={customer.id}
                  onClick={() => openCustomer(customer.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusDot status={customer.metrics.status} />
                      <div className="min-w-0">
                        <button
                          className="font-medium hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCustomer(customer.id);
                          }}
                          type="button"
                        >
                          {customer.name}
                        </button>
                        {customer.city ? (
                          <p className="text-muted-foreground text-xs">
                            {customer.city}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  {isManager ? (
                    <TableCell>
                      <SellerChip sellerId={customer.sellerId} />
                    </TableCell>
                  ) : null}
                  <TableCell className="whitespace-nowrap">
                    {customer.recentOrders[0]
                      ? `${formatDate(customer.recentOrders[0].date)} · hace ${customer.metrics.daysSince} d`
                      : "Sin compras"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoneyShort(customer.metrics.monthly)}
                  </TableCell>
                  <TableCell
                    className={
                      customer.overdue > 0
                        ? "text-right text-destructive tabular-nums"
                        : "text-right text-muted-foreground tabular-nums"
                    }
                  >
                    {customer.overdue > 0
                      ? formatMoneyShort(customer.overdue)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {openByCustomer.get(customer.id) ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
