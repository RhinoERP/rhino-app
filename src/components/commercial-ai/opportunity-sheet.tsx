"use client";

import {
  CaretLeftIcon,
  CaretRightIcon,
  CopyIcon,
  ShoppingCartIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
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
  markPreventaStartedAction,
  updateOpportunityStageAction,
} from "@/modules/commercial-ai/actions/commercial-ai.actions";
import {
  formatMoney,
  formatMoneyShort,
} from "@/modules/commercial-ai/engine/analysis";
import type { OpportunityStage } from "@/modules/commercial-ai/types";
import {
  CustomerAvatar,
  formatDateTime,
  SellerChip,
  StageBadge,
  TypeBadge,
  useCommercialAi,
} from "./shared";

const SNOOZE_DEFAULT_DAYS = 7;
const MS_PER_DAY = 86_400_000;

function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

function whatsappUrl(phone: string | null, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const encoded = encodeURIComponent(text);
  if (!digits) {
    return `https://wa.me/?text=${encoded}`;
  }
  const number = digits.startsWith("54") ? digits : `54${digits}`;
  return `https://wa.me/${number}?text=${encoded}`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: el panel muestra acciones distintas según la etapa
export function OpportunitySheet({
  opportunityKey,
  queue,
  onNavigate,
  onClose,
}: {
  opportunityKey: string | null;
  queue: string[];
  onNavigate: (key: string) => void;
  onClose: () => void;
}) {
  const { snapshot, isManager, openCustomer } = useCommercialAi();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const opportunity = snapshot.opportunities.find(
    (o) => o.key === opportunityKey
  );
  const customer = snapshot.customers.find(
    (c) => c.id === opportunity?.customerId
  );
  const [message, setMessage] = useState("");
  const [snoozeDate, setSnoozeDate] = useState(
    addDays(snapshot.today, SNOOZE_DEFAULT_DAYS)
  );
  const [showSnooze, setShowSnooze] = useState(false);

  useEffect(() => {
    setMessage(opportunity?.message ?? "");
    setShowSnooze(false);
  }, [opportunity?.message]);

  const index = opportunityKey ? queue.indexOf(opportunityKey) : -1;
  const previous = index > 0 ? queue[index - 1] : null;
  const next = index >= 0 && index < queue.length - 1 ? queue[index + 1] : null;

  if (!(opportunity && customer)) {
    return (
      <Sheet
        onOpenChange={(open) => !open && onClose()}
        open={Boolean(opportunityKey)}
      >
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Oportunidad</SheetTitle>
            <SheetDescription>
              No encontramos esta oportunidad.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const events = snapshot.events.filter(
    (e) => e.opportunityKey === opportunity.key
  );

  const setStage = (
    nextStage: OpportunityStage,
    extra?: { snoozeUntil?: string; note?: string }
  ) =>
    startTransition(async () => {
      const result = await updateOpportunityStageAction(snapshot.orgSlug, {
        opportunityKey: opportunity.key,
        customerId: opportunity.customerId,
        stage: nextStage,
        ...extra,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Guardado.");
      if (next && nextStage !== "respondio") {
        onNavigate(next);
      }
    });

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensaje copiado.");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el texto a mano.");
    }
  };

  const goToPreventa = () =>
    startTransition(async () => {
      const result = await markPreventaStartedAction(snapshot.orgSlug, {
        customerId: opportunity.customerId,
        opportunityKey: opportunity.key,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.push(
        `/org/${snapshot.orgSlug}/preventa/nueva?customerId=${encodeURIComponent(opportunity.customerId)}`
      );
    });

  const stage = opportunity.effectiveStage;

  return (
    <Sheet
      onOpenChange={(open) => !open && onClose()}
      open={Boolean(opportunityKey)}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <div className="flex items-start gap-3 pr-8">
            <CustomerAvatar
              color={
                snapshot.sellers.find((s) => s.id === opportunity.sellerId)
                  ?.color
              }
              name={opportunity.customerName}
            />
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg">
                <button
                  className="text-left hover:underline"
                  onClick={() => openCustomer(opportunity.customerId)}
                  type="button"
                >
                  {opportunity.customerName}
                </button>
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={opportunity.type} />
                  <StageBadge
                    snoozeUntil={opportunity.state.snoozeUntil}
                    stage={stage}
                  />
                  {customer.city ? <span>{customer.city}</span> : null}
                  {isManager ? (
                    <SellerChip sellerId={opportunity.sellerId} />
                  ) : null}
                </div>
              </SheetDescription>
            </div>
          </div>
          {queue.length > 1 && index >= 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Button
                aria-label="Anterior"
                disabled={!previous}
                onClick={() => previous && onNavigate(previous)}
                size="icon"
                variant="outline"
              >
                <CaretLeftIcon />
              </Button>
              <span className="tabular-nums">
                {index + 1} de {queue.length}
              </span>
              <Button
                aria-label="Siguiente"
                disabled={!next}
                onClick={() => next && onNavigate(next)}
                size="icon"
                variant="outline"
              >
                <CaretRightIcon />
              </Button>
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
            <div>
              <div className="font-heading text-3xl tabular-nums">
                ~{formatMoneyShort(opportunity.value)}
                <span className="text-base text-muted-foreground">/mes</span>
              </div>
              <div className="text-muted-foreground text-sm">
                {opportunity.type === "riesgo" ||
                opportunity.type === "reactivar"
                  ? "lo que se puede perder si no se recupera"
                  : "lo que se puede sumar por mes"}
              </div>
            </div>
            {customer.overdue > 0 ? (
              <div className="ml-auto rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                Tiene {formatMoney(customer.overdue)} vencido
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-lg border bg-card">
            <StrategyRow label="Con qué">
              {opportunity.strategy.con}
            </StrategyRow>
            <StrategyRow label="Por qué">
              {opportunity.strategy.porque}
            </StrategyRow>
            <StrategyRow label="Qué ofrecer">
              {opportunity.strategy.ofrecer}
            </StrategyRow>
            <StrategyRow label="Canal">
              {opportunity.strategy.canal}
            </StrategyRow>
            <div className="border-t bg-muted/40 px-4 py-3 text-sm">
              <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Evidencia
              </span>
              <p className="mt-1">{opportunity.evidence}</p>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-4">
            <label className="font-semibold text-sm" htmlFor="opp-message">
              Mensaje sugerido
            </label>
            <Textarea
              className="min-h-36 leading-relaxed"
              id="opp-message"
              onChange={(e) => setMessage(e.target.value)}
              value={message}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={copyMessage} size="sm" variant="outline">
                <CopyIcon />
                Copiar
              </Button>
              <Button asChild size="sm" variant="outline">
                <a
                  href={whatsappUrl(customer.phone, message)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <WhatsappLogoIcon />
                  Abrir WhatsApp
                </a>
              </Button>
              {customer.phone ? (
                <span className="self-center text-muted-foreground text-xs">
                  Tel. {customer.phone}
                </span>
              ) : null}
            </div>
          </div>

          {events.length ? (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 font-semibold text-sm">Historial</h3>
              <ul className="space-y-1.5 text-sm">
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
            </div>
          ) : null}
        </div>

        <div className="space-y-2 border-t bg-background p-4">
          {showSnooze ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm" htmlFor="snooze-date">
                Volver a mostrar el
              </label>
              <Input
                className="w-44"
                id="snooze-date"
                min={addDays(snapshot.today, 1)}
                onChange={(e) => setSnoozeDate(e.target.value)}
                type="date"
                value={snoozeDate}
              />
              <Button
                disabled={pending}
                onClick={() => setStage("despues", { snoozeUntil: snoozeDate })}
                size="sm"
              >
                Guardar
              </Button>
              <Button
                onClick={() => setShowSnooze(false)}
                size="sm"
                variant="ghost"
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={pending} onClick={goToPreventa} size="sm">
                <ShoppingCartIcon />
                Cargar preventa
              </Button>
              {stage === "nueva" || stage === "despues" ? (
                <Button
                  disabled={pending}
                  onClick={() => setStage("contactada")}
                  size="sm"
                  variant="outline"
                >
                  Marcar contactado
                </Button>
              ) : null}
              {stage === "contactada" ? (
                <Button
                  disabled={pending}
                  onClick={() => setStage("respondio")}
                  size="sm"
                  variant="outline"
                >
                  Respondió
                </Button>
              ) : null}
              {stage === "contactada" || stage === "respondio" ? (
                <>
                  <Button
                    disabled={pending}
                    onClick={() => setStage("ganada")}
                    size="sm"
                    variant="outline"
                  >
                    Ganada
                  </Button>
                  <Button
                    disabled={pending}
                    onClick={() => setStage("perdida")}
                    size="sm"
                    variant="outline"
                  >
                    Perdida
                  </Button>
                </>
              ) : null}
              {stage === "ganada" ||
              stage === "perdida" ||
              stage === "ignorada" ? (
                <Button
                  disabled={pending}
                  onClick={() => setStage("nueva")}
                  size="sm"
                  variant="outline"
                >
                  Reabrir
                </Button>
              ) : (
                <>
                  <Button
                    disabled={pending}
                    onClick={() => setShowSnooze(true)}
                    size="sm"
                    variant="ghost"
                  >
                    Para después
                  </Button>
                  <Button
                    className="text-destructive"
                    disabled={pending}
                    onClick={() => setStage("ignorada")}
                    size="sm"
                    variant="ghost"
                  >
                    Ignorar
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StrategyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t px-4 py-2.5 first:border-t-0">
      <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        {label}
      </div>
      <p className="text-sm">{children}</p>
    </div>
  );
}
