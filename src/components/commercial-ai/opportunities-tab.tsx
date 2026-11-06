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
import { cn } from "@/lib/utils";
import {
  OPEN_STAGES,
  OPPORTUNITY_TYPES,
  STAGES,
} from "@/modules/commercial-ai/constants";
import { formatMoneyShort } from "@/modules/commercial-ai/engine/analysis";
import type {
  OpportunityStage,
  OpportunityType,
  OpportunityView,
} from "@/modules/commercial-ai/types";
import {
  EmptyRow,
  OpportunityRow,
  SectionCard,
  StageBadge,
  useCommercialAi,
} from "./shared";

type StageFilter = "abiertas" | "todas" | OpportunityStage;

const ALL = "todos";

type Filters = {
  type: OpportunityType | typeof ALL;
  stage: StageFilter;
  seller: string;
  query: string;
};

function matchesStage(stage: OpportunityStage, filter: StageFilter): boolean {
  if (filter === "abiertas") {
    return OPEN_STAGES.includes(stage);
  }
  return filter === "todas" || stage === filter;
}

function matchesFilters(o: OpportunityView, filters: Filters): boolean {
  const q = filters.query.trim().toLowerCase();
  const haystack =
    `${o.customerName} ${o.productName ?? ""} ${o.categoryName ?? ""}`.toLowerCase();
  return (
    (filters.type === ALL || o.type === filters.type) &&
    matchesStage(o.effectiveStage, filters.stage) &&
    (filters.seller === ALL ||
      (o.sellerId ?? "sin-asignar") === filters.seller) &&
    (!q || haystack.includes(q))
  );
}

export function OpportunitiesTab() {
  const { snapshot, isManager } = useCommercialAi();
  const [type, setType] = useState<OpportunityType | typeof ALL>(ALL);
  const [stage, setStage] = useState<StageFilter>("abiertas");
  const [seller, setSeller] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      snapshot.opportunities.filter((o) =>
        matchesFilters(o, { type, stage, seller, query })
      ),
    [snapshot.opportunities, type, stage, seller, query]
  );

  const countByType = (t: OpportunityType) =>
    snapshot.opportunities.filter(
      (o) => o.type === t && OPEN_STAGES.includes(o.effectiveStage)
    ).length;
  const total = filtered.reduce((acc, o) => acc + o.value, 0);
  const queue = filtered.map((o) => o.key);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip active={type === ALL} onClick={() => setType(ALL)}>
          Todas
        </Chip>
        {(Object.keys(OPPORTUNITY_TYPES) as OpportunityType[]).map((t) => (
          <Chip active={type === t} key={t} onClick={() => setType(t)}>
            {OPPORTUNITY_TYPES[t].label}
            <span className="tabular-nums opacity-70">{countByType(t)}</span>
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Buscar cliente o producto"
          className="min-w-48 flex-1"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente o producto"
          value={query}
        />
        <Select onValueChange={(v) => setStage(v as StageFilter)} value={stage}>
          <SelectTrigger aria-label="Etapa" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="abiertas">Abiertas</SelectItem>
            <SelectItem value="todas">Todas las etapas</SelectItem>
            {(Object.keys(STAGES) as OpportunityStage[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STAGES[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      <SectionCard
        description={`${filtered.length} · ~${formatMoneyShort(total)}/mes`}
        right={`Analizados ${snapshot.stats.analyzedCustomers} clientes y ${snapshot.stats.analyzedOrders} ventas`}
        title="Oportunidades"
      >
        {filtered.length ? (
          filtered.map((o) => (
            <OpportunityRow
              key={o.key}
              opportunity={o}
              queue={queue}
              right={
                <StageBadge
                  snoozeUntil={o.state.snoozeUntil}
                  stage={o.effectiveStage}
                />
              }
            />
          ))
        ) : (
          <EmptyRow>No hay oportunidades con estos filtros.</EmptyRow>
        )}
      </SectionCard>
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium text-sm transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "bg-background hover:bg-muted"
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
