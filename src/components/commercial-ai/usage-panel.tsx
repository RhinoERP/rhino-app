"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { setOrgAiLimitsAction } from "@/modules/commercial-ai/actions/limits.actions";
import type {
  UsageBucket,
  UsageSummary,
} from "@/modules/commercial-ai/service/usage.service";

const numberFormatter = new Intl.NumberFormat("es-AR");
const WARNING_RATIO = 0.8;

function usd(value: number): string {
  return `US$ ${value.toFixed(value < 1 ? 4 : 2).replace(".", ",")}`;
}

function tokens(value: number): string {
  return numberFormatter.format(value);
}

function dateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));
}

function limitLabel(limit: number | null): string {
  return limit === null ? "Sin tope" : usd(limit);
}

function progressClass(ratio: number): string {
  if (ratio >= 1) {
    return "bg-destructive";
  }
  return ratio >= WARNING_RATIO ? "bg-amber-500" : "bg-primary";
}

export function UsagePanel({
  usage,
  admin,
}: {
  usage: UsageSummary | null;
  /** Si viene, se muestran los controles de superadmin para fijar topes. */
  admin?: { organizationId: string; orgSlug: string };
}) {
  if (!usage) {
    return (
      <Card className="p-4 text-muted-foreground text-sm">
        El consumo de IA solo lo ven gerentes y administradores.
      </Card>
    );
  }

  const { limits } = usage;
  const ratio = limits.monthlyUsdLimit
    ? usage.costUsd / limits.monthlyUsdLimit
    : 0;
  const totalTokens =
    usage.inputTokens + usage.outputTokens + usage.cacheTokens;
  const monthName = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(usage.periodStart));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={`Gastado en ${monthName}`} value={usd(usage.costUsd)} />
        <Kpi
          label="Tope del mes"
          sub={limits.isDefault ? "por defecto" : "fijado por Rhinos"}
          value={limitLabel(limits.monthlyUsdLimit)}
        />
        <Kpi
          label="Tokens"
          sub={`${tokens(usage.inputTokens)} entrada · ${tokens(usage.outputTokens)} salida`}
          value={tokens(totalTokens)}
        />
        <Kpi label="Llamadas a la IA" value={tokens(usage.calls)} />
      </div>

      {limits.monthlyUsdLimit !== null ? (
        <Card className="gap-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">Uso del tope mensual</span>
            <span className="tabular-nums">
              {usd(usage.costUsd)} de {usd(limits.monthlyUsdLimit)} ·{" "}
              {Math.round(ratio * 100)} %
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full", progressClass(ratio))}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Al llegar al tope, la IA se apaga hasta el mes que viene y el módulo
            sigue funcionando con reglas.
            {limits.perUserMonthlyUsdLimit !== null
              ? ` Cada empleado puede gastar hasta ${usd(limits.perUserMonthlyUsdLimit)} por mes.`
              : ""}
            {admin ? "" : " Para ampliarlo, pedíselo a Rhinos."}
          </p>
        </Card>
      ) : null}

      {admin ? <LimitsEditor admin={admin} usage={usage} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <BucketTable buckets={usage.byUser} title="Por empleado" />
        <BucketTable buckets={usage.byFeature} title="Por función" />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-baseline gap-2 px-4 pt-4 pb-3">
          <h3 className="font-semibold">Últimas llamadas</h3>
          <span className="text-muted-foreground text-sm">
            {usage.byModel.map((m) => m.label).join(", ") || "—"}
          </span>
        </div>
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Empleado</TableHead>
                <TableHead>Función</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Costo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.recent.length ? (
                usage.recent.map((row) => (
                  <TableRow
                    key={`${row.createdAt}-${row.userName}-${row.tokens}`}
                  >
                    <TableCell className="tabular-nums">
                      {dateTime(row.createdAt)}
                    </TableCell>
                    <TableCell>{row.userName ?? "Sistema"}</TableCell>
                    <TableCell className="capitalize">{row.feature}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {tokens(row.tokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(row.costUsd)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-6 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    Todavía no hubo llamadas a la IA este mes.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="gap-1 p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-heading text-xl tabular-nums">{value}</span>
      {sub ? (
        <span className="text-muted-foreground text-xs">{sub}</span>
      ) : null}
    </Card>
  );
}

function BucketTable({
  title,
  buckets,
}: {
  title: string;
  buckets: UsageBucket[];
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <h3 className="px-4 pt-4 pb-3 font-semibold">{title}</h3>
      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Llamadas</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Costo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.length ? (
              buckets.map((bucket) => (
                <TableRow key={bucket.key}>
                  <TableCell>{bucket.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tokens(bucket.calls)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tokens(bucket.tokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usd(bucket.costUsd)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="py-6 text-center text-muted-foreground"
                  colSpan={4}
                >
                  Sin consumo este mes.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function parseLimit(value: string, unlimited: boolean): number | null {
  if (unlimited) {
    return null;
  }
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function LimitsEditor({
  admin,
  usage,
}: {
  admin: { organizationId: string; orgSlug: string };
  usage: UsageSummary;
}) {
  const { limits } = usage;
  const [monthly, setMonthly] = useState(
    limits.monthlyUsdLimit?.toString() ?? ""
  );
  const [unlimited, setUnlimited] = useState(limits.monthlyUsdLimit === null);
  const [perUser, setPerUser] = useState(
    limits.perUserMonthlyUsdLimit?.toString() ?? ""
  );
  const [notes, setNotes] = useState(limits.notes);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await setOrgAiLimitsAction({
        organizationId: admin.organizationId,
        orgSlug: admin.orgSlug,
        monthlyUsdLimit: parseLimit(monthly, unlimited),
        perUserMonthlyUsdLimit: perUser.trim()
          ? parseLimit(perUser, false)
          : null,
        notes,
      });
      if (result.success) {
        toast.success("Topes de IA guardados.");
      } else {
        toast.error(result.error);
      }
    });

  return (
    <Card className="gap-3 border-primary/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Topes de IA</h3>
        <Badge variant="secondary">Solo superadmin de Rhinos</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="font-medium text-sm" htmlFor="ai-monthly-limit">
            Tope mensual de la empresa (US$)
          </label>
          <Input
            disabled={unlimited}
            id="ai-monthly-limit"
            inputMode="decimal"
            onChange={(e) => setMonthly(e.target.value)}
            placeholder="Ej: 5"
            value={unlimited ? "" : monthly}
          />
          <label
            className="flex items-center gap-2 text-muted-foreground text-xs"
            htmlFor="ai-unlimited"
          >
            <input
              checked={unlimited}
              className="size-3.5 accent-primary"
              id="ai-unlimited"
              onChange={(e) => setUnlimited(e.target.checked)}
              type="checkbox"
            />
            Sin tope (el cliente lo contrató)
          </label>
        </div>
        <div className="space-y-1">
          <label className="font-medium text-sm" htmlFor="ai-user-limit">
            Tope por empleado (US$ por mes)
          </label>
          <Input
            id="ai-user-limit"
            inputMode="decimal"
            onChange={(e) => setPerUser(e.target.value)}
            placeholder="Vacío = sin tope por empleado"
            value={perUser}
          />
        </div>
        <div className="space-y-1">
          <label className="font-medium text-sm" htmlFor="ai-limit-notes">
            Nota interna
          </label>
          <Input
            id="ai-limit-notes"
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: plan Pro, ampliado por pedido del cliente"
            value={notes}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {limits.isDefault
            ? "Esta empresa usa el tope por defecto (COMMERCIAL_AI_DEFAULT_MONTHLY_USD, US$2 si no está configurado)."
            : `Última actualización: ${limits.updatedAt ? dateTime(limits.updatedAt) : "—"}`}
        </p>
        <Button disabled={pending} onClick={save}>
          Guardar topes
        </Button>
      </div>
    </Card>
  );
}
