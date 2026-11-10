"use client";

import { ArrowLeft, Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { InboxDetail } from "@/modules/whatsapp/inbox-contract";
import { dateTime, stateLabel } from "./whatsapp-inbox-client";

export type ControlOperation = "CLAIM" | "TRANSFER" | "PAUSE" | "RESUME";
export type Review = {
  commandId: string;
  resolution: "CANCELLED" | "SENT";
  reason: string;
  externalMessageId?: string;
};

export function WhatsAppChatDetails({
  chat,
  orgSlug,
  disabled,
  onControl,
  onReview,
}: {
  chat: InboxDetail;
  orgSlug: string;
  disabled: boolean;
  onControl: (operation: ControlOperation, assignedUserId?: string) => void;
  onReview: (review: Review) => Promise<boolean>;
}) {
  const [recipient, setRecipient] = useState("");
  const unresolved = chat.commands.find(({ status }) => status === "UNKNOWN");
  const canOperate = chat.canManage && chat.status !== "CLOSED";

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="space-y-1">
        <p className="font-medium">{chat.customerName ?? "Cliente"}</p>
        <p className="text-muted-foreground">{chat.customerPhone}</p>
        {chat.handoffReason && (
          <p className="whitespace-pre-wrap break-words rounded-md bg-muted p-3">
            Derivación · {chat.handoffReason}
          </p>
        )}
      </div>
      {chat.pendingOrder && (
        <p>
          Pedido pendiente ·{" "}
          {chat.pendingOrder.status === "QUOTED"
            ? "Cotizado"
            : "En preparación"}{" "}
          · {dateTime.format(new Date(chat.pendingOrder.createdAt))}
        </p>
      )}
      {chat.preSales.length > 0 && (
        <ul aria-label="Preventas" className="space-y-2">
          {chat.preSales.map((order) => (
            <li key={order.id}>
              <Link
                className="underline"
                href={`/org/${orgSlug}/ventas/${order.id}`}
              >
                {order.number || "Preventa"}
              </Link>
              {" · "}
              {order.date} · {order.status}
            </li>
          ))}
        </ul>
      )}
      {canOperate && chat.status === "ACTIVE" && (
        <Button
          disabled={disabled}
          onClick={() => onControl("PAUSE")}
          size="sm"
          type="button"
          variant="outline"
        >
          Pausar bot
        </Button>
      )}
      {canOperate && chat.status === "HANDOFF" && (
        <div className="space-y-2 border-t pt-3">
          <Select
            disabled={disabled}
            onValueChange={setRecipient}
            value={recipient}
          >
            <SelectTrigger aria-label="Nuevo responsable">
              <SelectValue placeholder="Elegí un responsable" />
            </SelectTrigger>
            <SelectContent>
              {chat.operators
                .filter((operator) => operator.id !== chat.assignedUserId)
                .map((operator) => (
                  <SelectItem key={operator.id} value={operator.id}>
                    {operator.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Si alguien tomó el chat, la atención pasa al nuevo responsable. Una
            derivación pendiente sigue esperando aceptación.
          </p>
          <Button
            disabled={
              disabled || !recipient || recipient === chat.assignedUserId
            }
            onClick={() => onControl("TRANSFER", recipient)}
            size="sm"
            type="button"
            variant="outline"
          >
            Reasignar
          </Button>
        </div>
      )}
      {chat.canManage && unresolved && (
        <DeliveryReview
          commandId={unresolved.id}
          disabled={disabled}
          key={unresolved.id}
          onReview={onReview}
        />
      )}
    </div>
  );
}

function DeliveryReview({
  commandId,
  disabled,
  onReview,
}: {
  commandId: string;
  disabled: boolean;
  onReview: (review: Review) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [externalMessageId, setExternalMessageId] = useState("");
  const [resolution, setResolution] =
    useState<Review["resolution"]>("CANCELLED");
  return (
    <form
      className="space-y-2 border-t pt-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const ok = await onReview({
          commandId,
          resolution,
          reason,
          externalMessageId:
            resolution === "SENT" ? externalMessageId.trim() : undefined,
        });
        if (ok) {
          setReason("");
          setExternalMessageId("");
        }
      }}
    >
      <h3 className="font-medium">Revisar envío sin confirmar</h3>
      <p className="text-muted-foreground text-xs">
        Registrá el resultado que verificaste. Una cancelación local deja
        abierta la posibilidad de que el cliente haya recibido el mensaje.
      </p>
      <Select
        disabled={disabled}
        onValueChange={(value: Review["resolution"]) => setResolution(value)}
        value={resolution}
      >
        <SelectTrigger aria-label="Resultado de revisión">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="CANCELLED">Cerrar como cancelado</SelectItem>
          <SelectItem value="SENT">Registrar aceptación por Meta</SelectItem>
        </SelectContent>
      </Select>
      {resolution === "SENT" && (
        <>
          <Label htmlFor="whatsapp-provider-id">
            ID de mensaje verificado en Meta
          </Label>
          <Input
            disabled={disabled}
            id="whatsapp-provider-id"
            maxLength={1000}
            onChange={(event) => setExternalMessageId(event.target.value)}
            required
            value={externalMessageId}
          />
        </>
      )}
      <Label htmlFor="whatsapp-review-reason">Motivo de revisión</Label>
      <Textarea
        disabled={disabled}
        id="whatsapp-review-reason"
        maxLength={1000}
        minLength={5}
        onChange={(event) => setReason(event.target.value)}
        required
        value={reason}
      />
      <Button
        disabled={
          disabled ||
          reason.trim().length < 5 ||
          (resolution === "SENT" && !externalMessageId.trim())
        }
        size="sm"
        type="submit"
      >
        Registrar revisión
      </Button>
    </form>
  );
}

export function WhatsAppChatHeader({
  chat,
  currentUserId,
  disabled,
  onBack,
  onControl,
  onReview,
  orgSlug,
}: {
  chat?: InboxDetail;
  currentUserId: string;
  disabled: boolean;
  onBack: () => void;
  onControl: (operation: ControlOperation, assignedUserId?: string) => void;
  onReview: (review: Review) => Promise<boolean>;
  orgSlug: string;
}) {
  const name = chat?.customerName ?? chat?.customerPhone ?? "Conversación";
  const operator = chat?.operators.find(({ id }) => id === chat.assignedUserId);
  const canOperate = chat?.canManage && chat.status !== "CLOSED";
  const canClaim = canOperate && !chat.humanClaimedAt;
  const canResume = canOperate && chat.status !== "ACTIVE";
  const resumeDisabled = disabled || Boolean(chat?.deliveryBlock);
  return (
    <header className="flex shrink-0 items-center gap-2 border-b bg-background p-2 sm:p-3">
      <Button
        aria-label="Volver a conversaciones"
        className="shrink-0 md:hidden"
        onClick={onBack}
        size="icon"
        type="button"
        variant="ghost"
      >
        <ArrowLeft aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-heading text-base">{name}</h2>
        {chat && (
          <p className="truncate text-muted-foreground text-xs">
            {chat.isSimulator ? "Simulación local · " : ""}
            {stateLabel(chat)}
            {operator &&
              ` · ${operator.id === currentUserId ? "Vos" : operator.name}`}
          </p>
        )}
      </div>
      {canClaim && (
        <Button
          disabled={disabled}
          onClick={() => onControl("CLAIM")}
          size="sm"
          type="button"
        >
          Tomar conversación
        </Button>
      )}
      {canResume && (
        <Button
          className={canClaim ? "hidden sm:inline-flex" : undefined}
          disabled={resumeDisabled}
          onClick={() => onControl("RESUME")}
          size="sm"
          title="La IA atenderá mensajes nuevos"
          type="button"
          variant="outline"
        >
          Devolver a la IA
        </Button>
      )}
      {chat && (
        <Sheet>
          <SheetTrigger asChild>
            <Button
              aria-label="Abrir ficha de conversación"
              size="icon"
              type="button"
              variant="outline"
            >
              <Info aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[min(100%,24rem)] gap-0 overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Ficha de conversación</SheetTitle>
              <SheetDescription>
                Cliente, responsable y actividad comercial.
              </SheetDescription>
            </SheetHeader>
            <p className="px-4 text-muted-foreground text-sm">
              Responsable · {operator?.name ?? "Sin responsable disponible"}
            </p>
            {canResume && canClaim && (
              <Button
                className="mx-4 mt-3 self-start sm:hidden"
                disabled={resumeDisabled}
                onClick={() => onControl("RESUME")}
                size="sm"
                type="button"
                variant="outline"
              >
                Devolver a la IA
              </Button>
            )}
            <WhatsAppChatDetails
              chat={chat}
              disabled={disabled}
              onControl={onControl}
              onReview={onReview}
              orgSlug={orgSlug}
            />
          </SheetContent>
        </Sheet>
      )}
    </header>
  );
}
