"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { completeTaskAction } from "@/modules/commercial-ai/actions/commercial-ai.actions";
import { OPEN_STAGES } from "@/modules/commercial-ai/constants";
import { formatMoneyShort } from "@/modules/commercial-ai/engine/analysis";
import type { OpportunityView } from "@/modules/commercial-ai/types";
import {
  EmptyRow,
  formatDate,
  OpportunityRow,
  PlanCard,
  percent,
  SectionCard,
  SellerChip,
  StatusDot,
  useCommercialAi,
  useSellerName,
} from "./shared";

const FOLLOW_UP_AFTER_DAYS = 3;
const MS_PER_DAY = 86_400_000;
const TOP_TEAM_ROWS = 6;
const WHITESPACE_PATTERN = /\s+/;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor(
    (new Date(toIso.slice(0, 10)).getTime() -
      new Date(fromIso.slice(0, 10)).getTime()) /
      MS_PER_DAY
  );
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function TodayTab() {
  const { isManager } = useCommercialAi();
  return isManager ? <ManagerToday /> : <SellerToday />;
}

function useTodayLists() {
  const { snapshot } = useCommercialAi();
  const today = snapshot.today;
  const isNew = (o: OpportunityView) => o.effectiveStage === "nueva";
  const atRisk = snapshot.opportunities.filter(
    (o) => isNew(o) && (o.type === "riesgo" || o.type === "reactivar")
  );
  const growth = snapshot.opportunities.filter(
    (o) => isNew(o) && (o.type === "faltante" || o.type === "cross")
  );
  const followUps: { opportunity: OpportunityView; text: string }[] = [];
  for (const o of snapshot.opportunities) {
    const touchedToday = o.state.lastTouchedAt?.slice(0, 10) === today;
    if (touchedToday) {
      continue;
    }
    if (o.effectiveStage === "contactada" && o.state.contactedAt) {
      const days = daysBetween(o.state.contactedAt, today);
      if (days >= FOLLOW_UP_AFTER_DAYS) {
        followUps.push({
          opportunity: o,
          text: `Sin respuesta hace ${days} días`,
        });
      }
    }
    if (o.effectiveStage === "respondio") {
      followUps.push({ opportunity: o, text: "Respondió: cerrá la venta" });
    }
  }
  const tasks = snapshot.tasks.filter((t) => !t.doneAt && t.dueDate <= today);
  const doneToday =
    snapshot.opportunities.filter(
      (o) => o.state.lastTouchedAt?.slice(0, 10) === today
    ).length +
    snapshot.tasks.filter((t) => t.doneAt?.slice(0, 10) === today).length;
  return { atRisk, growth, followUps, tasks, doneToday };
}

function SellerToday() {
  const { snapshot } = useCommercialAi();
  const { atRisk, growth, followUps, tasks, doneToday } = useTodayLists();
  const total = atRisk.length + growth.length + followUps.length + tasks.length;
  const mine = snapshot.plan.sellers[0];
  const firstName = snapshot.currentUserName.split(WHITESPACE_PATTERN)[0];

  return (
    <div className="space-y-5">
      <div>
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {longDate(snapshot.today)}
        </p>
        <h2 className="font-heading text-2xl">
          Hola {firstName}, tenés {total} {total === 1 ? "cosa" : "cosas"} para
          hoy
        </h2>
        {doneToday > 0 ? (
          <p className="text-muted-foreground text-sm">
            Ya hiciste {doneToday} hoy.
          </p>
        ) : null}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <SectionCard
            description={
              atRisk.length
                ? `~${formatMoneyShort(atRisk.reduce((a, o) => a + o.value, 0))}/mes en juego`
                : undefined
            }
            title="Se te pueden ir"
          >
            {atRisk.length ? (
              atRisk.map((o) => (
                <OpportunityRow
                  key={o.key}
                  opportunity={o}
                  queue={atRisk.map((x) => x.key)}
                />
              ))
            ) : (
              <EmptyRow>
                Ningún cliente de tu cartera viene cayendo. 👏
              </EmptyRow>
            )}
          </SectionCard>

          <SectionCard
            description={
              growth.length
                ? `~${formatMoneyShort(growth.reduce((a, o) => a + o.value, 0))}/mes para sumar`
                : undefined
            }
            title="Para venderle más"
          >
            {growth.length ? (
              growth.map((o) => (
                <OpportunityRow
                  key={o.key}
                  opportunity={o}
                  queue={growth.map((x) => x.key)}
                />
              ))
            ) : (
              <EmptyRow>No hay oportunidades nuevas en tu cartera.</EmptyRow>
            )}
          </SectionCard>

          <SectionCard title="Seguimientos">
            {followUps.length ? (
              followUps.map(({ opportunity, text }) => (
                <OpportunityRow
                  key={opportunity.key}
                  opportunity={opportunity}
                  right={<span className="text-amber-600 text-xs">{text}</span>}
                />
              ))
            ) : (
              <EmptyRow>Nada pendiente de seguimiento.</EmptyRow>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          {mine ? (
            <PlanCard
              dayOfMonth={snapshot.plan.dayOfMonth}
              daysInMonth={snapshot.plan.daysInMonth}
              levers={mine.levers}
              real={mine.real}
              subject="cerrás"
              target={mine.target}
              title="Tu mes"
            />
          ) : null}
          <TasksCard tasks={tasks} />
        </div>
      </div>
    </div>
  );
}

function TasksCard({
  tasks,
}: {
  tasks: ReturnType<typeof useTodayLists>["tasks"];
}) {
  const { snapshot, openCustomer } = useCommercialAi();
  const [pending, startTransition] = useTransition();
  const customerName = (id: string) =>
    snapshot.customers.find((c) => c.id === id)?.name ?? "Cliente";

  const complete = (taskId: string) =>
    startTransition(async () => {
      const result = await completeTaskAction(snapshot.orgSlug, taskId, true);
      if (result.success) {
        toast.success("Listo, marcado como hecho.");
      } else {
        toast.error(result.error);
      }
    });

  return (
    <SectionCard title="Próximos pasos">
      {tasks.length ? (
        tasks.map((task) => (
          <div
            className="flex items-start gap-3 border-t px-4 py-3"
            key={task.id}
          >
            <div className="min-w-0 flex-1">
              <button
                className="font-medium hover:underline"
                onClick={() => openCustomer(task.customerId)}
                type="button"
              >
                {customerName(task.customerId)}
              </button>
              <p className="text-muted-foreground text-sm">{task.body}</p>
              <p
                className={
                  task.dueDate < snapshot.today
                    ? "text-destructive text-xs"
                    : "text-muted-foreground text-xs"
                }
              >
                {task.dueDate < snapshot.today ? "Vencida el " : "Para hoy · "}
                {formatDate(task.dueDate)}
              </p>
            </div>
            <Button
              disabled={pending}
              onClick={() => complete(task.id)}
              size="sm"
              variant="outline"
            >
              <CheckIcon />
              Hecho
            </Button>
          </div>
        ))
      ) : (
        <EmptyRow>No tenés próximos pasos vencidos.</EmptyRow>
      )}
    </SectionCard>
  );
}

function ManagerToday() {
  const { snapshot, openCustomer } = useCommercialAi();
  const sellerName = useSellerName();
  const { plan } = snapshot;
  const open = snapshot.opportunities.filter((o) =>
    OPEN_STAGES.includes(o.effectiveStage)
  );
  const leaving = open
    .filter((o) => o.type === "riesgo" || o.type === "reactivar")
    .slice(0, TOP_TEAM_ROWS);
  const debtors = snapshot.customers
    .filter((c) => c.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, TOP_TEAM_ROWS);

  const rows = plan.sellers.map((seller) => {
    const sellerOpps = open.filter(
      (o) => (o.sellerId ?? "sin-asignar") === seller.sellerId
    );
    return {
      ...seller,
      open: sellerOpps.length,
      atRisk: sellerOpps.filter(
        (o) => o.type === "riesgo" || o.type === "reactivar"
      ).length,
      won: snapshot.opportunities.filter(
        (o) =>
          (o.sellerId ?? "sin-asignar") === seller.sellerId &&
          o.effectiveStage === "ganada"
      ).length,
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {longDate(snapshot.today)}
        </p>
        <h2 className="font-heading text-2xl">Cómo viene el equipo</h2>
      </div>

      <PlanCard
        dayOfMonth={plan.dayOfMonth}
        daysInMonth={plan.daysInMonth}
        levers={plan.team.levers}
        real={plan.team.real}
        subject="el equipo cierra"
        target={plan.team.target}
        title="Equipo"
      />

      <SectionCard title="Por vendedor">
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Vendido</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead className="text-right">Avance</TableHead>
                <TableHead className="text-right">Abiertas</TableHead>
                <TableHead className="text-right">Se pueden ir</TableHead>
                <TableHead className="text-right">Ganadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.sellerId}>
                  <TableCell>
                    <SellerChip sellerId={row.sellerId} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoneyShort(row.real)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.target ? formatMoneyShort(row.target) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {percent(row.real, row.target)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.open}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.atRisk}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.won}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <SectionCard description="los que más pesan" title="Se nos pueden ir">
          {leaving.length ? (
            leaving.map((o) => (
              <OpportunityRow
                key={o.key}
                opportunity={o}
                queue={leaving.map((x) => x.key)}
              />
            ))
          ) : (
            <EmptyRow>No hay clientes en riesgo ni dormidos.</EmptyRow>
          )}
        </SectionCard>

        <SectionCard title="Deuda vencida">
          {debtors.length ? (
            debtors.map((customer) => (
              <button
                className="flex w-full items-center gap-3 border-t px-4 py-3 text-left hover:bg-muted/50"
                key={customer.id}
                onClick={() => openCustomer(customer.id)}
                type="button"
              >
                <StatusDot status={customer.metrics.status} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {sellerName(customer.sellerId)} · hasta{" "}
                    {customer.maxDaysLate} días de atraso
                  </p>
                </div>
                <span className="font-semibold text-destructive tabular-nums">
                  {formatMoneyShort(customer.overdue)}
                </span>
              </button>
            ))
          ) : (
            <EmptyRow>Nadie tiene deuda vencida.</EmptyRow>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
