"use client";

import {
  CopyIcon,
  EnvelopeSimpleIcon,
  GlobeIcon,
  PhoneIcon,
  UserPlusIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
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
  addProspectNoteAction,
  updateProspectAction,
  updateProspectStageAction,
} from "@/modules/commercial-ai/actions/prospecting.actions";
import { PROSPECT_STAGES } from "@/modules/commercial-ai/constants";
import type { ProspectStage } from "@/modules/commercial-ai/types";
import { FitBadge, ProspectStageBadge } from "./prospects-tab";
import {
  CustomerAvatar,
  formatDateTime,
  SellerChip,
  useCommercialAi,
} from "./shared";

const NEXT_STAGES: Record<ProspectStage, ProspectStage[]> = {
  sin_contactar: ["contactado", "descartado"],
  contactado: ["en_conversacion", "perdido"],
  en_conversacion: ["esperando_pedido", "perdido"],
  esperando_pedido: ["perdido"],
  perdido: ["sin_contactar"],
  descartado: ["sin_contactar"],
};

function whatsappUrl(phone: string | null, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const encoded = encodeURIComponent(text);
  if (!digits) {
    return `https://wa.me/?text=${encoded}`;
  }
  return `https://wa.me/${digits.startsWith("54") ? digits : `54${digits}`}?text=${encoded}`;
}

export function ProspectSheet({
  prospectId,
  onClose,
}: {
  prospectId: string | null;
  onClose: () => void;
}) {
  const { snapshot, isManager } = useCommercialAi();
  const prospect = snapshot.prospecting.prospects.find(
    (p) => p.id === prospectId
  );
  const campaign = snapshot.prospecting.campaigns.find(
    (c) => c.id === prospect?.campaignId
  );
  const events = snapshot.prospecting.prospectEvents.filter(
    (e) => e.prospectId === prospectId
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDate, setNextStepDate] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setMessage(prospect?.message ?? "");
    setPhone(prospect?.phone ?? "");
    setEmail(prospect?.email ?? "");
    setNextStep(prospect?.nextStep ?? "");
    setNextStepDate(prospect?.nextStepDate ?? "");
    setNote("");
  }, [prospect]);

  if (!prospect) {
    return null;
  }

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

  const saveDetails = () =>
    run(
      () =>
        updateProspectAction(snapshot.orgSlug, {
          prospectId: prospect.id,
          phone: phone.trim() || null,
          email: email.trim() || null,
          message,
          nextStep: nextStep.trim() || null,
          nextStepDate: nextStepDate || null,
        }),
      "Guardado."
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensaje copiado.");
    } catch {
      toast.error("No se pudo copiar.");
    }
  };

  return (
    <Sheet
      onOpenChange={(open) => !open && onClose()}
      open={Boolean(prospectId)}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <div className="flex items-start gap-3 pr-8">
            <CustomerAvatar name={prospect.name} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg">{prospect.name}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2">
                  <ProspectStageBadge stage={prospect.stage} />
                  {[prospect.category, prospect.city, prospect.province]
                    .filter(Boolean)
                    .join(" · ")}
                  {isManager ? (
                    <SellerChip sellerId={prospect.sellerId} />
                  ) : null}
                </div>
              </SheetDescription>
              <p className="mt-1 text-muted-foreground text-xs">
                {campaign ? `Relevado en ${campaign.name}` : "Cargado a mano"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a
                href={whatsappUrl(phone || null, message)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <WhatsappLogoIcon />
                WhatsApp
              </a>
            </Button>
            {phone ? (
              <Button asChild size="sm" variant="outline">
                <a href={`tel:${phone.replace(/\s/g, "")}`}>
                  <PhoneIcon />
                  Llamar
                </a>
              </Button>
            ) : null}
            {email ? (
              <Button asChild size="sm" variant="outline">
                <a href={`mailto:${email}?body=${encodeURIComponent(message)}`}>
                  <EnvelopeSimpleIcon />
                  Email
                </a>
              </Button>
            ) : null}
            {prospect.website ? (
              <Button asChild size="sm" variant="outline">
                <a
                  href={prospect.website}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <GlobeIcon />
                  Web
                </a>
              </Button>
            ) : null}
            {prospect.stage === "esperando_pedido" ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/org/${snapshot.orgSlug}/clientes`}>
                  <UserPlusIcon />
                  Dar de alta como cliente
                </Link>
              </Button>
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
            <FitBadge score={prospect.fitScore} />
            <div>
              <p className="font-semibold text-sm">Qué sabemos</p>
              <p className="text-muted-foreground text-sm">
                {prospect.fitReasons || "Sin datos del encaje."}
              </p>
              {prospect.address ? (
                <p className="text-sm">{prospect.address}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-4">
            <p className="font-semibold text-sm">Cambiar etapa</p>
            <div className="flex flex-wrap gap-2">
              {NEXT_STAGES[prospect.stage].map((stage) => (
                <Button
                  disabled={pending}
                  key={stage}
                  onClick={() =>
                    run(
                      () =>
                        updateProspectStageAction(snapshot.orgSlug, {
                          prospectId: prospect.id,
                          stage,
                        }),
                      `Pasó a ${PROSPECT_STAGES[stage].label.toLowerCase()}.`
                    )
                  }
                  size="sm"
                  variant={
                    stage === "perdido" || stage === "descartado"
                      ? "ghost"
                      : "outline"
                  }
                >
                  {PROSPECT_STAGES[stage].label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-4">
            <label className="font-semibold text-sm" htmlFor="prospect-message">
              Primer mensaje
            </label>
            <Textarea
              className="min-h-32 leading-relaxed"
              id="prospect-message"
              onChange={(e) => setMessage(e.target.value)}
              value={message}
            />
            <Button onClick={copy} size="sm" variant="outline">
              <CopyIcon />
              Copiar
            </Button>
          </div>

          <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2">
            <p className="font-semibold text-sm md:col-span-2">
              Contacto y próximo paso
            </p>
            <Input
              aria-label="Teléfono"
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono / WhatsApp"
              value={phone}
            />
            <Input
              aria-label="Email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              value={email}
            />
            <Input
              aria-label="Próximo paso"
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="Próximo paso (ej: llevar muestra)"
              value={nextStep}
            />
            <Input
              aria-label="Fecha del próximo paso"
              onChange={(e) => setNextStepDate(e.target.value)}
              type="date"
              value={nextStepDate}
            />
            <div className="md:col-span-2">
              <Button disabled={pending} onClick={saveDetails} size="sm">
                Guardar cambios
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-4">
            <p className="font-semibold text-sm">Actividad</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) {
                  run(
                    () =>
                      addProspectNoteAction(
                        snapshot.orgSlug,
                        prospect.id,
                        note
                      ),
                    "Nota guardada.",
                    () => setNote("")
                  );
                }
              }}
            >
              <Input
                aria-label="Nueva nota"
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anotar algo (respuesta, compromiso…)"
                value={note}
              />
              <Button
                disabled={pending || !note.trim()}
                type="submit"
                variant="outline"
              >
                Anotar
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
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
