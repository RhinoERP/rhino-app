"use client";

import { createContext, useContext } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CUSTOMER_STATUS,
  LEVERS,
  OPPORTUNITY_TYPES,
  STAGES,
} from "@/modules/commercial-ai/constants";
import {
  formatMoney,
  formatMoneyShort,
} from "@/modules/commercial-ai/engine/analysis";
import type {
  CommercialAiSnapshot,
  CustomerStatus,
  LeverKey,
  LeverProgress,
  OpportunityStage,
  OpportunityType,
  OpportunityView,
} from "@/modules/commercial-ai/types";

const ARTICLE_PATTERN = /^(la|el|los|las|lo de)\s+/i;
const WHITESPACE_PATTERN = /\s+/;

/* ============ Contexto compartido entre pestañas ============ */

type CommercialAiContextValue = {
  snapshot: CommercialAiSnapshot;
  isManager: boolean;
  openOpportunity: (key: string, queue?: string[]) => void;
  openCustomer: (customerId: string) => void;
  goToTab: (tab: string) => void;
};

export const CommercialAiContext =
  createContext<CommercialAiContextValue | null>(null);

export function useCommercialAi(): CommercialAiContextValue {
  const value = useContext(CommercialAiContext);
  if (!value) {
    throw new Error("useCommercialAi fuera de CommercialAiContext");
  }
  return value;
}

export function useSellerName() {
  const { snapshot } = useCommercialAi();
  return (sellerId: string | null) =>
    snapshot.sellers.find((s) => s.id === sellerId)?.name ?? "Sin asignar";
}

/* ============ Formato ============ */

export function formatDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));
}

export function percent(value: number, total: number): string {
  if (!total) {
    return "—";
  }
  return `${Math.round((value / total) * 100)} %`;
}

/* ============ Badges ============ */

export function TypeBadge({ type }: { type: OpportunityType }) {
  const meta = OPPORTUNITY_TYPES[type];
  return (
    <Badge className={cn("font-medium", meta.className)} variant="outline">
      {meta.label}
    </Badge>
  );
}

export function StageBadge({
  stage,
  snoozeUntil,
}: {
  stage: OpportunityStage;
  snoozeUntil?: string | null;
}) {
  const meta = STAGES[stage];
  return (
    <Badge className={cn("border-transparent font-medium", meta.className)}>
      {stage === "despues" && snoozeUntil
        ? `Para después · ${formatDate(snoozeUntil)}`
        : meta.label}
    </Badge>
  );
}

export function StatusDot({ status }: { status: CustomerStatus }) {
  const meta = CUSTOMER_STATUS[status];
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        meta.dotClassName
      )}
      title={meta.label}
    />
  );
}

export function SellerChip({ sellerId }: { sellerId: string | null }) {
  const { snapshot } = useCommercialAi();
  const seller = snapshot.sellers.find((s) => s.id === sellerId);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground text-xs">
      <span
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: seller?.color ?? "var(--muted-foreground)" }}
      />
      {seller?.name ?? "Sin asignar"}
    </span>
  );
}

export function CustomerAvatar({
  name,
  color,
  size = 40,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const initials = name
    .replace(ARTICLE_PATTERN, "")
    .split(WHITESPACE_PATTERN)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-lg font-semibold text-primary-foreground"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size / 3),
        backgroundColor: color ?? "var(--primary)",
      }}
    >
      {initials}
    </div>
  );
}

/* ============ Fila de oportunidad ============ */

export function OpportunityRow({
  opportunity,
  queue,
  right,
}: {
  opportunity: OpportunityView;
  queue?: string[];
  right?: React.ReactNode;
}) {
  const { isManager, openOpportunity, snapshot } = useCommercialAi();
  const seller = snapshot.sellers.find((s) => s.id === opportunity.sellerId);
  return (
    <button
      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t px-4 py-3 text-left transition-colors hover:bg-muted/50"
      onClick={() => openOpportunity(opportunity.key, queue)}
      type="button"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <StatusDot status={opportunity.customerStatus} />
        <span className="font-medium">{opportunity.customerName}</span>
        {opportunity.customerCity ? (
          <span className="text-muted-foreground text-xs">
            {opportunity.customerCity}
          </span>
        ) : null}
        <TypeBadge type={opportunity.type} />
        {isManager && seller ? (
          <span className="text-muted-foreground text-xs">
            · {seller.shortName}
          </span>
        ) : null}
      </div>
      <div className="row-span-2 flex flex-col items-end gap-0.5">
        <span className="font-semibold tabular-nums">
          ~{formatMoneyShort(opportunity.value)}/mes
        </span>
        {right ?? (
          <span className="font-medium text-primary text-xs">Ver →</span>
        )}
      </div>
      <p className="min-w-0 text-muted-foreground text-sm">
        {opportunity.evidenceShort}
      </p>
    </button>
  );
}

/* ============ Tarjeta de avance contra la meta ============ */

export function PlanCard({
  title,
  real,
  target,
  levers,
  dayOfMonth,
  daysInMonth,
  subject,
}: {
  title: string;
  real: number;
  target: number;
  levers: Record<LeverKey, LeverProgress>;
  dayOfMonth: number;
  daysInMonth: number;
  subject: string;
}) {
  const elapsed = dayOfMonth / daysInMonth;
  const progress = target ? real / target : 0;
  const projected = dayOfMonth ? (real / dayOfMonth) * daysInMonth : 0;
  const behind = target > 0 && progress < elapsed - 0.02;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-baseline gap-2 text-base">
          {title}
          <span className="font-normal text-muted-foreground text-xs">
            día {dayOfMonth} de {daysInMonth}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-heading text-2xl tabular-nums">
            {formatMoney(real)}
          </span>
          {target > 0 ? (
            <>
              <span className="text-muted-foreground text-sm">
                de {formatMoney(target)}
              </span>
              <span className="ml-auto font-semibold tabular-nums">
                {percent(real, target)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground text-sm">
              · sin meta cargada
            </span>
          )}
        </div>
        <div
          aria-label={`Avance ${Math.round(progress * 100)} % con el ${Math.round(elapsed * 100)} % del mes transcurrido`}
          className="relative h-2.5 rounded-full bg-muted"
          role="img"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
          <div
            className="-inset-y-1 absolute w-0.5 bg-foreground"
            style={{ left: `${elapsed * 100}%` }}
            title="Mes transcurrido"
          />
        </div>
        <p className="text-muted-foreground text-sm">
          {target > 0 ? (
            <>
              <span
                className={cn(
                  "font-semibold",
                  behind
                    ? "text-destructive"
                    : "text-emerald-600 dark:text-emerald-400"
                )}
              >
                {behind ? "Vas atrás:" : "Vas en ritmo:"}
              </span>{" "}
              {percent(real, target)} con el {Math.round(elapsed * 100)} % del
              mes. A este ritmo {subject} en{" "}
              <b className="text-foreground tabular-nums">
                {formatMoneyShort(projected)}
              </b>
              {projected < target ? (
                <>
                  {" "}
                  · faltan{" "}
                  <b className="text-foreground tabular-nums">
                    {formatMoneyShort(target - projected)}
                  </b>
                </>
              ) : null}
              .
            </>
          ) : (
            <>
              A este ritmo {subject} en{" "}
              <b className="text-foreground tabular-nums">
                {formatMoneyShort(projected)}
              </b>
              .
            </>
          )}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {LEVERS.map((lever) => {
            const value = levers[lever.key];
            const ratio = value.plan ? value.real / value.plan : 0;
            return (
              <div
                className="rounded-md bg-muted/60 p-2.5"
                key={lever.key}
                title={lever.help}
              >
                <div className="font-medium text-muted-foreground text-xs">
                  {lever.label}
                </div>
                <div className="font-semibold tabular-nums">
                  {formatMoneyShort(value.real)}
                </div>
                <div className="text-muted-foreground text-xs tabular-nums">
                  {value.plan
                    ? `de ${formatMoneyShort(value.plan)} · ${Math.round(ratio * 100)} %`
                    : "sin plan"}
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, ratio * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer font-medium text-primary">
            ¿De dónde sale cada palanca?
          </summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {LEVERS.map((lever) => (
              <li key={lever.key}>
                <b className="text-foreground">{lever.label}:</b> {lever.help}
              </li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

export function SectionCard({
  title,
  description,
  right,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-4 pb-3">
        <h2 className="font-semibold text-base">{title}</h2>
        {description ? (
          <span className="text-muted-foreground text-sm">{description}</span>
        ) : null}
        {right ? (
          <div className="ml-auto text-muted-foreground text-sm">{right}</div>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t px-4 py-4 text-muted-foreground text-sm">
      {children}
    </p>
  );
}
