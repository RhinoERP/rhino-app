"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { controlWhatsAppConversationAction } from "@/modules/whatsapp/actions/control-whatsapp-conversation.action";
import type { WhatsAppControlOperator } from "@/modules/whatsapp/server/conversation-control";
import type { WhatsAppInboxConversation } from "@/modules/whatsapp/service/whatsapp-conversations.service";

type ControlOperation = "CLAIM" | "TRANSFER" | "PAUSE" | "RESUME";
type WhatsAppInboxProps = {
  conversations: WhatsAppInboxConversation[];
  orgSlug: string;
  operators: WhatsAppControlOperator[];
  currentUserId: string;
  canManage: boolean;
};
type ControlProps = Pick<
  WhatsAppInboxProps,
  "operators" | "currentUserId" | "canManage"
> & {
  conversation: WhatsAppInboxConversation;
  isPending: boolean;
  onControl: (operation: ControlOperation, assignedUserId?: string) => void;
};

function statusLabel(conversation: WhatsAppInboxConversation): string {
  if (conversation.humanClaimedAt) {
    return "Atención humana aceptada";
  }
  return {
    ACTIVE: "Atiende la IA",
    PAUSED: "Bot pausado",
    HANDOFF: "Esperando atención",
    CLOSED: "Cerrada",
  }[conversation.status];
}

function ConversationActions({
  conversation,
  isPending,
  onControl,
  canManage,
  operators,
}: ControlProps) {
  const [recipient, setRecipient] = useState("");
  if (!canManage || conversation.status === "CLOSED") {
    return <p className="text-muted-foreground text-xs">Sólo lectura</p>;
  }
  return (
    <div className="space-y-3">
      {conversation.deliveryBlock ? (
        <output className="block text-amber-700 text-sm">
          {conversation.deliveryBlock === "SENDING"
            ? "Finalizando un envío en curso. Puede llegar al cliente aunque tomes la conversación."
            : "Envío sin confirmar: requiere revisión antes de devolver a la IA."}
        </output>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {conversation.humanClaimedAt ? null : (
          <Button
            disabled={isPending}
            onClick={() => onControl("CLAIM")}
            size="sm"
            type="button"
          >
            Tomar conversación
          </Button>
        )}
        {conversation.status === "ACTIVE" ? (
          <Button
            disabled={isPending}
            onClick={() => onControl("PAUSE")}
            size="sm"
            type="button"
            variant="outline"
          >
            Pausar bot
          </Button>
        ) : (
          <Button
            disabled={isPending || Boolean(conversation.deliveryBlock)}
            onClick={() => onControl("RESUME")}
            size="sm"
            type="button"
            variant="outline"
          >
            Devolver a la IA
          </Button>
        )}
      </div>
      {conversation.status === "HANDOFF" ? (
        <div className="space-y-2">
          <Select
            disabled={isPending}
            onValueChange={setRecipient}
            value={recipient}
          >
            <SelectTrigger aria-label="Nuevo responsable">
              <SelectValue placeholder="Elegí un responsable" />
            </SelectTrigger>
            <SelectContent>
              {operators
                .filter(
                  (operator) => operator.id !== conversation.assignedUserId
                )
                .map((operator) => (
                  <SelectItem key={operator.id} value={operator.id}>
                    {operator.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Reasignar transfiere la atención si ya fue aceptada; una derivación
            pendiente sigue esperando aceptación.
          </p>
          <Button
            disabled={
              isPending ||
              !recipient ||
              recipient === conversation.assignedUserId
            }
            onClick={() => onControl("TRANSFER", recipient)}
            size="sm"
            type="button"
            variant="outline"
          >
            Reasignar
          </Button>
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Al devolver, la IA atenderá sólo mensajes nuevos. El envío manual está
        deshabilitado hasta integrar la outbox humana persistente.
      </p>
    </div>
  );
}

function ConversationCard({
  conversation,
  orgSlug,
  isPending,
  onControl,
  canManage,
  operators,
  currentUserId,
}: ControlProps & { orgSlug: string }) {
  const assignedName = operators.find(
    (operator) => operator.id === conversation.assignedUserId
  )?.name;
  return (
    <Card>
      <CardHeader className="gap-1 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {conversation.customerName ?? conversation.customerPhone}
            </CardTitle>
            <CardDescription>{conversation.customerPhone}</CardDescription>
            {conversation.isSimulator ? (
              <CardDescription className="text-amber-700">
                Simulación local · mensajes no enviados a WhatsApp
              </CardDescription>
            ) : null}
          </div>
          <span className="rounded-full bg-muted px-2 py-1 text-xs">
            {statusLabel(conversation)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {conversation.assignedUserId ? (
          <p className="text-sm">
            {conversation.humanClaimedAt ? "Atiende" : "Responsable asignado"}:{" "}
            {assignedName ?? "Responsable no disponible"}
            {conversation.assignedUserId === currentUserId ? " (vos)" : ""}
          </p>
        ) : null}
        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <p className="mb-1 text-muted-foreground text-xs">
            {conversation.lastMessage?.direction === "OUTBOUND"
              ? "Equipo"
              : "Cliente"}
          </p>
          <p>{conversation.lastMessage?.content ?? "Sin mensajes de texto"}</p>
        </div>
        {conversation.handoffReason ? (
          <p className="text-muted-foreground text-xs">
            Derivación: {conversation.handoffReason}
          </p>
        ) : null}
        {conversation.pendingOrder ? (
          <p className="text-sm">
            Pedido pendiente ·{" "}
            {conversation.pendingOrder.status === "QUOTED"
              ? "Cotizado"
              : "En preparación"}{" "}
            · {conversation.pendingOrder.createdAt.slice(0, 10)}
          </p>
        ) : null}
        {conversation.preSales.length ? (
          <details className="text-sm">
            <summary>
              Preventas de este chat ({conversation.preSales.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {conversation.preSales.map((order) => (
                <li key={order.id}>
                  <Link
                    className="underline"
                    href={`/org/${orgSlug}/ventas/${order.id}`}
                  >
                    {order.number || "Preventa"}
                  </Link>{" "}
                  · {order.date} · {order.status}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <ConversationActions
          canManage={canManage}
          conversation={conversation}
          currentUserId={currentUserId}
          isPending={isPending}
          onControl={onControl}
          operators={operators}
        />
      </CardContent>
    </Card>
  );
}

export function WhatsAppInbox({
  conversations,
  orgSlug,
  operators,
  currentUserId,
  canManage,
}: WhatsAppInboxProps) {
  const [isPending, startTransition] = useTransition();

  function control(
    conversation: WhatsAppInboxConversation,
    operation: ControlOperation,
    assignedUserId?: string
  ) {
    startTransition(async () => {
      const result = await controlWhatsAppConversationAction({
        orgSlug,
        conversationId: conversation.id,
        expectedControlVersion: conversation.controlVersion,
        operation,
        assignedUserId,
      });
      if (!result.success) {
        toast.error(result.error ?? "No se pudo actualizar el control");
        return;
      }
      toast.success("Control de conversación actualizado");
    });
  }

  if (!conversations.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Aún no hay conversaciones de WhatsApp para esta organización.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {conversations.map((conversation) => (
        <ConversationCard
          canManage={canManage}
          conversation={conversation}
          currentUserId={currentUserId}
          isPending={isPending}
          key={conversation.id}
          onControl={(operation, assignedUserId) =>
            control(conversation, operation, assignedUserId)
          }
          operators={operators}
          orgSlug={orgSlug}
        />
      ))}
    </div>
  );
}
