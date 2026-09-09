"use client";

import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
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
import { Textarea } from "@/components/ui/textarea";
import { sendWhatsAppManualMessageAction } from "@/modules/whatsapp/actions/send-whatsapp-manual-message.action";
import { setWhatsAppConversationAutomationAction } from "@/modules/whatsapp/actions/set-whatsapp-conversation-automation.action";
import type { WhatsAppInboxConversation } from "@/modules/whatsapp/service/whatsapp-conversations.service";

type WhatsAppInboxProps = {
  conversations: WhatsAppInboxConversation[];
  orgSlug: string;
};

function statusLabel(status: WhatsAppInboxConversation["status"]): string {
  return {
    ACTIVE: "Bot activo",
    PAUSED: "Bot pausado",
    HANDOFF: "Atención humana",
    CLOSED: "Cerrada",
  }[status];
}

export function WhatsAppInbox({ conversations, orgSlug }: WhatsAppInboxProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function send(conversationId: string) {
    const text = drafts[conversationId]?.trim() ?? "";
    if (!text) {
      return;
    }
    startTransition(async () => {
      const result = await sendWhatsAppManualMessageAction({
        orgSlug,
        conversationId,
        text,
      });
      if (!result.success) {
        toast.error(result.error ?? "No se pudo enviar el mensaje");
        return;
      }
      setDrafts((current) => ({ ...current, [conversationId]: "" }));
      toast.success("Mensaje enviado por WhatsApp");
    });
  }

  function setAutomation(conversationId: string, enabled: boolean) {
    startTransition(async () => {
      const result = await setWhatsAppConversationAutomationAction({
        orgSlug,
        conversationId,
        enabled,
      });
      if (!result.success) {
        toast.error(result.error ?? "No se pudo actualizar la automatización");
        return;
      }
      toast.success(enabled ? "Bot reactivado" : "Bot pausado");
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
        <Card key={conversation.id}>
          <CardHeader className="gap-1 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  {conversation.customerName ?? conversation.customerPhone}
                </CardTitle>
                <CardDescription>{conversation.customerPhone}</CardDescription>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-xs">
                {statusLabel(conversation.status)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="mb-1 text-muted-foreground text-xs">
                {conversation.lastMessage?.direction === "OUTBOUND"
                  ? "Equipo"
                  : "Cliente"}
              </p>
              <p>
                {conversation.lastMessage?.content ?? "Sin mensajes de texto"}
              </p>
            </div>
            {conversation.handoffReason ? (
              <p className="text-muted-foreground text-xs">
                Derivación: {conversation.handoffReason}
              </p>
            ) : null}
            <Textarea
              aria-label={`Responder a ${conversation.customerName ?? conversation.customerPhone}`}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [conversation.id]: event.target.value,
                }))
              }
              placeholder="Escribí una respuesta manual…"
              value={drafts[conversation.id] ?? ""}
            />
            <div className="flex justify-between gap-2">
              {conversation.status !== "CLOSED" ? (
                <Button
                  disabled={isPending}
                  onClick={() =>
                    setAutomation(
                      conversation.id,
                      conversation.status !== "ACTIVE"
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {conversation.status === "ACTIVE"
                    ? "Pausar bot"
                    : "Reactivar bot"}
                </Button>
              ) : (
                <span />
              )}
              <Button
                disabled={isPending || conversation.status === "CLOSED"}
                onClick={() => send(conversation.id)}
                size="sm"
                type="button"
              >
                <PaperPlaneTiltIcon className="mr-2 size-4" />
                Enviar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
