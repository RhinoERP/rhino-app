"use client";

import { ArrowSquareOutIcon, ShoppingCartIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  addCustomerNoteAction,
  completeTaskAction,
  createTaskAction,
  markPreventaStartedAction,
} from "@/modules/commercial-ai/actions/commercial-ai.actions";
import { CUSTOMER_STATUS } from "@/modules/commercial-ai/constants";
import {
  formatMoney,
  formatMoneyShort,
} from "@/modules/commercial-ai/engine/analysis";
import {
  CustomerAvatar,
  formatDate,
  formatDateTime,
  OpportunityRow,
  SellerChip,
  StageBadge,
  StatusDot,
  useCommercialAi,
} from "./shared";
import { VisitButton } from "./visit-button";

const MS_PER_DAY = 86_400_000;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ficha completa del cliente en un solo panel
export function CustomerSheet({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const { snapshot, isManager } = useCommercialAi();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [taskBody, setTaskBody] = useState("");
  const [taskDate, setTaskDate] = useState(() =>
    new Date(new Date(`${snapshot.today}T12:00:00Z`).getTime() + MS_PER_DAY)
      .toISOString()
      .slice(0, 10)
  );
  const customer = snapshot.customers.find((c) => c.id === customerId);

  if (!customer) {
    return null;
  }

  const opportunities = snapshot.opportunities.filter(
    (o) => o.customerId === customer.id
  );
  const events = snapshot.events.filter((e) => e.customerId === customer.id);
  const tasks = snapshot.tasks.filter((t) => t.customerId === customer.id);
  const seller = snapshot.sellers.find((s) => s.id === customer.sellerId);

  const run = (
    action: () => Promise<{ success: boolean; error?: string }>,
    ok: string,
    after?: () => void
  ) =>
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(ok);
        after?.();
      } else {
        toast.error(result.error);
      }
    });

  const creditUse =
    customer.creditLimit && customer.creditLimit > 0
      ? customer.pending / customer.creditLimit
      : null;

  return (
    <Sheet
      onOpenChange={(open) => !open && onClose()}
      open={Boolean(customerId)}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <div className="flex items-start gap-3 pr-8">
            <CustomerAvatar color={seller?.color} name={customer.name} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg">{customer.name}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot status={customer.metrics.status} />
                    {CUSTOMER_STATUS[customer.metrics.status].label}
                  </span>
                  {customer.city ? <span>· {customer.city}</span> : null}
                  {customer.phone ? <span>· Tel. {customer.phone}</span> : null}
                  {isManager ? (
                    <SellerChip sellerId={customer.sellerId} />
                  ) : null}
                </div>
              </SheetDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    markPreventaStartedAction(snapshot.orgSlug, {
                      customerId: customer.id,
                    }),
                  "Abriendo preventa…",
                  () =>
                    router.push(
                      `/org/${snapshot.orgSlug}/preventa/nueva?customerId=${encodeURIComponent(customer.id)}`
                    )
                )
              }
              size="sm"
            >
              <ShoppingCartIcon />
              Cargar preventa
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/org/${snapshot.orgSlug}/clientes/${customer.id}`}>
                <ArrowSquareOutIcon />
                Ficha completa
              </Link>
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <VisitButton customerId={customer.id} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label="Compra por mes"
              sub="promedio últimos 90 días"
              value={formatMoneyShort(customer.metrics.monthly)}
            />
            <Kpi
              label="Última compra"
              sub={
                customer.metrics.daysSince === null
                  ? "sin compras"
                  : `hace ${customer.metrics.daysSince} días`
              }
              value={formatDate(customer.recentOrders[0]?.date ?? null)}
            />
            <Kpi
              label="Pedidos"
              sub="en los últimos 13 meses"
              value={String(customer.metrics.orderCount)}
            />
            <Kpi
              className={
                customer.overdue > 0 ? "border-destructive" : undefined
              }
              label="Vencido"
              sub={
                customer.overdue > 0
                  ? `hasta ${customer.maxDaysLate} días de atraso`
                  : `saldo ${formatMoneyShort(customer.pending)}`
              }
              value={formatMoneyShort(customer.overdue)}
            />
          </div>

          {creditUse !== null ? (
            <div className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex justify-between">
                <span>Límite de crédito usado</span>
                <span className="tabular-nums">
                  {formatMoney(customer.pending)} de{" "}
                  {formatMoney(customer.creditLimit ?? 0)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    creditUse > 1
                      ? "h-full bg-destructive"
                      : "h-full bg-primary"
                  }
                  style={{ width: `${Math.min(100, creditUse * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          {opportunities.length ? (
            <div className="overflow-hidden rounded-lg border bg-card">
              <h3 className="px-4 pt-3 pb-2 font-semibold text-sm">
                Oportunidades
              </h3>
              {opportunities.map((o) => (
                <OpportunityRow
                  key={o.key}
                  opportunity={o}
                  right={
                    <StageBadge
                      snoozeUntil={o.state.snoozeUntil}
                      stage={o.effectiveStage}
                    />
                  }
                />
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 font-semibold text-sm">Lo que más compra</h3>
              {customer.topProducts.length ? (
                <ul className="space-y-1.5 text-sm">
                  {customer.topProducts.map((p) => (
                    <li
                      className="flex justify-between gap-2"
                      key={p.productId}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatMoneyShort(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Sin compras registradas.
                </p>
              )}
            </div>
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 font-semibold text-sm">Últimas ventas</h3>
              {customer.recentOrders.length ? (
                <ul className="space-y-1.5 text-sm">
                  {customer.recentOrders.map((order) => (
                    <li className="flex justify-between gap-2" key={order.id}>
                      <Link
                        className="hover:underline"
                        href={`/org/${snapshot.orgSlug}/ventas/${order.id}`}
                      >
                        {formatDate(order.date)}
                        {order.number ? ` · ${order.number}` : ""}
                      </Link>
                      <span className="tabular-nums">
                        {formatMoneyShort(order.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Sin ventas.</p>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-4">
            <h3 className="font-semibold text-sm">Próximos pasos</h3>
            {tasks.length ? (
              <ul className="space-y-1.5 text-sm">
                {tasks.map((task) => (
                  <li className="flex items-center gap-2" key={task.id}>
                    <input
                      aria-label={`Marcar "${task.body}" como hecho`}
                      checked={Boolean(task.doneAt)}
                      className="size-4 accent-primary"
                      disabled={pending}
                      onChange={(e) =>
                        run(
                          () =>
                            completeTaskAction(
                              snapshot.orgSlug,
                              task.id,
                              e.target.checked
                            ),
                          e.target.checked ? "Hecho." : "Reabierto."
                        )
                      }
                      type="checkbox"
                    />
                    <span
                      className={
                        task.doneAt
                          ? "flex-1 text-muted-foreground line-through"
                          : "flex-1"
                      }
                    >
                      {task.body}
                    </span>
                    <span
                      className={
                        !task.doneAt && task.dueDate < snapshot.today
                          ? "text-destructive text-xs"
                          : "text-muted-foreground text-xs"
                      }
                    >
                      {formatDate(task.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskBody.trim()) {
                  return;
                }
                run(
                  () =>
                    createTaskAction(snapshot.orgSlug, {
                      customerId: customer.id,
                      body: taskBody,
                      dueDate: taskDate,
                    }),
                  "Próximo paso agendado.",
                  () => setTaskBody("")
                );
              }}
            >
              <Input
                aria-label="Próximo paso"
                className="min-w-48 flex-1"
                onChange={(e) => setTaskBody(e.target.value)}
                placeholder="Ej: llevarle la lista de precios nueva"
                value={taskBody}
              />
              <Input
                aria-label="Fecha"
                className="w-40"
                onChange={(e) => setTaskDate(e.target.value)}
                type="date"
                value={taskDate}
              />
              <Button
                disabled={pending || !taskBody.trim()}
                size="sm"
                type="submit"
              >
                Agendar
              </Button>
            </form>
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-4">
            <h3 className="font-semibold text-sm">Notas e historial</h3>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) {
                  return;
                }
                run(
                  () =>
                    addCustomerNoteAction(snapshot.orgSlug, {
                      customerId: customer.id,
                      body: note,
                    }),
                  "Nota guardada.",
                  () => setNote("")
                );
              }}
            >
              <Textarea
                aria-label="Nueva nota"
                onChange={(e) => setNote(e.target.value)}
                placeholder="¿Qué pasó con este cliente?"
                rows={2}
                value={note}
              />
              <Button
                disabled={pending || !note.trim()}
                size="sm"
                type="submit"
                variant="outline"
              >
                Guardar nota
              </Button>
            </form>
            {events.length ? (
              <ul className="space-y-1.5 border-t pt-2 text-sm">
                {events.map((event) => (
                  <li
                    className="grid grid-cols-[88px_minmax(0,1fr)] gap-2"
                    key={event.id}
                  >
                    <span className="text-muted-foreground tabular-nums">
                      {formatDateTime(event.createdAt)}
                    </span>
                    <span>
                      {event.body}
                      {event.actorName ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {event.actorName}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                Todavía no hay notas.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Kpi({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border bg-card p-3 ${className ?? ""}`}>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-heading text-xl tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{sub}</div>
    </div>
  );
}
