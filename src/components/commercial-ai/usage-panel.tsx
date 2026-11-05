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
import { buyCreditsAction } from "@/modules/commercial-ai/actions/credits.actions";
import {
  adjustOrgCreditsAction,
  setOrgAiLimitsAction,
} from "@/modules/commercial-ai/actions/limits.actions";
import {
  approxReplies,
  CREDITS_PER_TYPICAL_REPLY,
} from "@/modules/commercial-ai/credits";
import type {
  CreditPackageView,
  UsageBucket,
  UsageSummary,
} from "@/modules/commercial-ai/service/usage.service";

const numberFormat = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 0,
});
const decimalFormat = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 2,
});
const moneyFormat = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const PCT = 100;
const FEATURE_TEXT: Record<string, string> = {
  asistente: "Asistente (IA)",
  campana: "Campañas (IA)",
  prueba: "Prueba",
  whatsapp: "Mensaje de WhatsApp",
  audio: "Audio",
};
const PURCHASE_STATUS: Record<string, string> = {
  pendiente: "Pendiente",
  aprobada: "Acreditada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

function credits(value: number): string {
  return Math.abs(value) < 10
    ? decimalFormat.format(value)
    : numberFormat.format(value);
}

function usd(value: number): string {
  return `US$ ${value.toFixed(value < 1 ? 4 : 2).replace(".", ",")}`;
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

const WARNING_RATIO = 0.8;

function barColor(ratio: number): string {
  if (ratio >= 1) {
    return "bg-destructive";
  }
  return ratio >= WARNING_RATIO ? "bg-amber-500" : "bg-primary";
}

function nextMonthName(periodStart: string): string {
  const date = new Date(periodStart);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

export function UsagePanel({
  usage,
  orgSlug,
  admin,
}: {
  usage: UsageSummary | null;
  /** Si viene (gerente de la empresa), se puede comprar créditos. */
  orgSlug?: string;
  /** Si viene, controles de superadmin: plan y carga manual. */
  admin?: { organizationId: string; orgSlug: string };
}) {
  if (!usage) {
    return (
      <Card className="p-4 text-muted-foreground text-sm">
        El consumo y los créditos solo los ven gerentes y administradores.
      </Card>
    );
  }
  const showCost = Boolean(admin);

  return (
    <div className="space-y-4">
      <BalanceCard usage={usage} />
      {orgSlug && !admin ? (
        <PackagesCard orgSlug={orgSlug} packages={usage.packages} />
      ) : null}
      {admin ? (
        <>
          <PlanEditor admin={admin} usage={usage} />
          <AdjustCredits admin={admin} />
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <BucketTable
          buckets={usage.byUser}
          showCost={showCost}
          title="Por empleado"
        />
        <BucketTable
          buckets={usage.byFeature}
          showCost={showCost}
          title="En qué se usaron"
        />
      </div>

      <HistoryCard usage={usage} />
      <RecentCard showCost={showCost} usage={usage} />
      {showCost ? (
        <p className="text-muted-foreground text-xs">
          Costo nuestro este mes: {usd(usage.costUsd)} (IA {usage.calls}{" "}
          llamadas,{" "}
          {numberFormat.format(
            usage.inputTokens + usage.outputTokens + usage.cacheTokens
          )}{" "}
          tokens). 1 crédito = US$0,01 de costo.
        </p>
      ) : null}
    </div>
  );
}

function BalanceCard({ usage }: { usage: UsageSummary }) {
  const { status } = usage;
  if (status.available === null) {
    return (
      <Card className="gap-1 p-4">
        <span className="text-muted-foreground text-sm">Créditos</span>
        <span className="font-heading text-2xl">Sin tope</span>
        <span className="text-muted-foreground text-sm">
          Usados este mes: {credits(status.monthUsed)} (≈{" "}
          {numberFormat.format(approxReplies(status.monthUsed))} respuestas).
        </span>
      </Card>
    );
  }
  const included = status.included ?? 0;
  const ratio = included ? Math.min(1, status.monthUsed / included) : 1;
  return (
    <Card
      className={cn(
        "gap-3 p-4",
        status.level === "agotado" && "border-destructive/60",
        status.level === "bajo" && "border-amber-500/60"
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-muted-foreground text-sm">
            Créditos disponibles
          </span>
          <span className="font-heading text-3xl">
            {credits(Math.max(0, status.available))}
          </span>
          <span className="text-muted-foreground text-sm">
            ≈{" "}
            {numberFormat.format(approxReplies(Math.max(0, status.available)))}{" "}
            respuestas por WhatsApp
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">Del plan (este mes)</span>
          <span className="text-right">
            {credits(status.planLeft ?? 0)} de {credits(included)}
          </span>
          <span className="text-muted-foreground">Comprados</span>
          <span className="text-right">{credits(status.extraBalance)}</span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full", barColor(ratio))}
          style={{ width: `${ratio * PCT}%` }}
        />
      </div>
      {status.level === "agotado" ? (
        <p className="rounded-md bg-destructive/10 p-2 text-destructive text-sm">
          Se terminaron los créditos: el asistente por WhatsApp y la IA están en
          pausa. Comprá un paquete para seguir hoy mismo.
        </p>
      ) : null}
      {status.level === "bajo" ? (
        <p className="rounded-md bg-amber-50 p-2 text-amber-900 text-sm dark:bg-amber-950/30 dark:text-amber-200">
          Quedan pocos créditos. Si se terminan, el asistente se pausa hasta que
          compres más o se renueve el plan.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Primero se usan los del plan, que se renuevan el{" "}
        {nextMonthName(usage.periodStart)} y no se acumulan; después los
        comprados, que no vencen. Cada respuesta por WhatsApp usa unos{" "}
        {CREDITS_PER_TYPICAL_REPLY} créditos (el mensaje + la IA); un audio suma
        medio crédito por minuto.
      </p>
    </Card>
  );
}

function PackagesCard({
  orgSlug,
  packages,
}: {
  orgSlug: string;
  packages: CreditPackageView[];
}) {
  const [pending, startTransition] = useTransition();
  const [buying, setBuying] = useState<string | null>(null);
  if (!packages.length) {
    return null;
  }
  const buy = (key: string) => {
    setBuying(key);
    startTransition(async () => {
      const result = await buyCreditsAction({ orgSlug, packageKey: key });
      if (result.success) {
        window.location.assign(result.url);
      } else {
        toast.error(result.error);
        setBuying(null);
      }
    });
  };
  const cheapest = Math.min(...packages.map((p) => p.priceUsd / p.credits));

  return (
    <Card className="gap-3 p-4">
      <div>
        <h3 className="font-semibold">Comprar créditos</h3>
        <p className="text-muted-foreground text-sm">
          Se pagan con Mercado Pago y se acreditan al instante. Precio en
          dólares más IVA, cobrado en pesos al dólar oficial del día.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {packages.map((pack) => {
          const perCredit = pack.priceUsd / pack.credits;
          const best = perCredit === cheapest;
          return (
            <div
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3",
                best && "border-primary"
              )}
              key={pack.key}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold">{pack.name}</span>
                {best && packages.length > 1 ? (
                  <Badge variant="secondary">Mejor precio</Badge>
                ) : null}
              </div>
              <span className="font-heading text-2xl">
                {numberFormat.format(pack.credits)} créditos
              </span>
              <span className="text-muted-foreground text-sm">
                ≈ {numberFormat.format(approxReplies(pack.credits))} respuestas
                por WhatsApp
              </span>
              <span className="text-sm">
                US$ {decimalFormat.format(pack.priceUsd)} + IVA
              </span>
              <Button
                className="mt-auto"
                disabled={pending}
                onClick={() => buy(pack.key)}
                variant={best ? "default" : "outline"}
              >
                {buying === pack.key ? "Abriendo Mercado Pago…" : "Comprar"}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BucketTable({
  title,
  buckets,
  showCost,
}: {
  title: string;
  buckets: UsageBucket[];
  showCost: boolean;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <h3 className="px-4 pt-4 pb-3 font-semibold">{title}</h3>
      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="text-right">Usos</TableHead>
              <TableHead className="text-right">Créditos</TableHead>
              {showCost ? (
                <TableHead className="text-right">Costo</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.length ? (
              buckets.map((bucket) => (
                <TableRow key={bucket.key}>
                  <TableCell>
                    {FEATURE_TEXT[bucket.label] ?? bucket.label}
                  </TableCell>
                  <TableCell className="text-right">
                    {numberFormat.format(bucket.calls)}
                  </TableCell>
                  <TableCell className="text-right">
                    {credits(bucket.credits)}
                  </TableCell>
                  {showCost ? (
                    <TableCell className="text-right">
                      {usd(bucket.costUsd)}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="py-6 text-center text-muted-foreground"
                  colSpan={showCost ? 4 : 3}
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

function HistoryCard({ usage }: { usage: UsageSummary }) {
  const rows = [
    ...usage.purchases.map((p) => ({
      key: `p-${p.id}`,
      date: p.createdAt,
      what: `Compra ${p.packageName} · ${moneyFormat.format(p.totalArs)}`,
      amount: p.credits,
      state: PURCHASE_STATUS[p.status] ?? p.status,
    })),
    ...usage.movements
      .filter((m) => m.kind === "ajuste")
      .map((m) => ({
        key: `m-${m.createdAt}-${m.credits}`,
        date: m.createdAt,
        what: `Carga de Rhinos${m.note ? ` · ${m.note}` : ""}`,
        amount: m.credits,
        state: "Acreditada",
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) {
    return null;
  }
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <h3 className="px-4 pt-4 pb-3 font-semibold">Compras y cargas</h3>
      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead className="text-right">Créditos</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{dateTime(row.date)}</TableCell>
                <TableCell>{row.what}</TableCell>
                <TableCell className="text-right">
                  {row.amount > 0 ? "+" : ""}
                  {credits(row.amount)}
                </TableCell>
                <TableCell>{row.state}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function RecentCard({
  usage,
  showCost,
}: {
  usage: UsageSummary;
  showCost: boolean;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <h3 className="px-4 pt-4 pb-3 font-semibold">Últimos consumos</h3>
      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Empleado</TableHead>
              <TableHead>Qué</TableHead>
              <TableHead className="text-right">Créditos</TableHead>
              {showCost ? (
                <TableHead className="text-right">Costo</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.recent.length ? (
              usage.recent.map((row) => (
                <TableRow
                  key={`${row.createdAt}-${row.feature}-${row.credits}`}
                >
                  <TableCell>{dateTime(row.createdAt)}</TableCell>
                  <TableCell>{row.userName ?? "Sistema"}</TableCell>
                  <TableCell>
                    {FEATURE_TEXT[row.feature] ?? row.feature}
                  </TableCell>
                  <TableCell className="text-right">
                    {credits(row.credits)}
                  </TableCell>
                  {showCost ? (
                    <TableCell className="text-right">
                      {usd(row.costUsd)}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="py-6 text-center text-muted-foreground"
                  colSpan={showCost ? 5 : 4}
                >
                  Todavía no hubo consumo este mes.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function parseCredits(value: string): number | null {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function PlanEditor({
  admin,
  usage,
}: {
  admin: { organizationId: string; orgSlug: string };
  usage: UsageSummary;
}) {
  const { limits } = usage;
  const [monthly, setMonthly] = useState(
    limits.monthlyIncludedCredits?.toString() ?? ""
  );
  const [unlimited, setUnlimited] = useState(
    limits.monthlyIncludedCredits === null
  );
  const [perUser, setPerUser] = useState(
    limits.perUserMonthlyCredits?.toString() ?? ""
  );
  const [notes, setNotes] = useState(limits.notes);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await setOrgAiLimitsAction({
        organizationId: admin.organizationId,
        orgSlug: admin.orgSlug,
        monthlyIncludedCredits: unlimited
          ? null
          : Math.max(0, parseCredits(monthly) ?? 0),
        perUserMonthlyCredits: perUser.trim()
          ? Math.max(0, parseCredits(perUser) ?? 0)
          : null,
        notes,
      });
      if (result.success) {
        toast.success("Plan de créditos guardado.");
      } else {
        toast.error(result.error);
      }
    });

  return (
    <Card className="gap-3 border-primary/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Plan de créditos</h3>
        <Badge variant="secondary">Solo superadmin de Rhinos</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="font-medium text-sm" htmlFor="ai-monthly-credits">
            Créditos incluidos por mes
          </label>
          <Input
            disabled={unlimited}
            id="ai-monthly-credits"
            inputMode="numeric"
            onChange={(e) => setMonthly(e.target.value)}
            placeholder="Ej: 1000"
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
            Sin tope (contrato especial: se mide pero no se corta)
          </label>
        </div>
        <div className="space-y-1">
          <label className="font-medium text-sm" htmlFor="ai-user-credits">
            Tope por empleado (créditos por mes)
          </label>
          <Input
            id="ai-user-credits"
            inputMode="numeric"
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
            placeholder="Ej: plan Pro, 10 vendedores"
            value={notes}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {limits.isDefault
            ? "Usa el plan por defecto (COMMERCIAL_AI_DEFAULT_MONTHLY_CREDITS, 1.000 si no está configurado)."
            : `Última actualización: ${limits.updatedAt ? dateTime(limits.updatedAt) : "—"}`}{" "}
          Referencia: unos 1.100 créditos por vendedor activo por mes.
        </p>
        <Button disabled={pending} onClick={save}>
          Guardar plan
        </Button>
      </div>
    </Card>
  );
}

function AdjustCredits({
  admin,
}: {
  admin: { organizationId: string; orgSlug: string };
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      const value = parseCredits(amount);
      if (!value) {
        toast.error("Poné cuántos créditos (negativo para descontar).");
        return;
      }
      const result = await adjustOrgCreditsAction({
        organizationId: admin.organizationId,
        orgSlug: admin.orgSlug,
        credits: value,
        note,
      });
      if (result.success) {
        toast.success("Créditos cargados.");
        setAmount("");
        setNote("");
      } else {
        toast.error(result.error);
      }
    });
  return (
    <Card className="gap-3 border-primary/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Cargar créditos a mano</h3>
        <Badge variant="secondary">Solo superadmin de Rhinos</Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        Para pagos por transferencia, bonificaciones o correcciones. Se suman a
        los comprados (no vencen) y quedan en el historial con el motivo.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="font-medium text-sm" htmlFor="ai-adjust-credits">
            Créditos
          </label>
          <Input
            className="w-36"
            id="ai-adjust-credits"
            inputMode="numeric"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ej: 5000 o -200"
            value={amount}
          />
        </div>
        <div className="min-w-60 flex-1 space-y-1">
          <label className="font-medium text-sm" htmlFor="ai-adjust-note">
            Motivo
          </label>
          <Input
            id="ai-adjust-note"
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: transferencia factura A 0001-00001234"
            value={note}
          />
        </div>
        <Button disabled={pending} onClick={save}>
          Cargar
        </Button>
      </div>
    </Card>
  );
}
