"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { SUGGESTED_QUESTIONS } from "@/modules/commercial-ai/constants";
import { RhinoChat } from "./rhino/rhino-chat";
import type { RhinoLinkHandler } from "./rhino/rhino-text";
import { useCommercialAi } from "./shared";

/** RHINO, el asistente, a pantalla completa dentro de IA Comercial. */
export function AssistantTab() {
  const { snapshot, isManager, openCustomer, openOpportunity, openProspect } =
    useCommercialAi();
  const [chat, setChat] = useState<{ count: number; reset: () => void }>({
    count: 0,
    reset: () => null,
  });

  const onLink: RhinoLinkHandler = (kind, id) => {
    if (kind === "cli") {
      openCustomer(id);
    } else if (kind === "pro") {
      openProspect(id);
    } else {
      openOpportunity(id);
    }
  };

  const onMessagesChange = useCallback(
    (count: number, reset: () => void) => setChat({ count, reset }),
    []
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {snapshot.aiEnabled
            ? `RHINO responde con los datos reales de ${isManager ? "todo el negocio" : "tu cartera"}`
            : "Modo sin IA: las preguntas sugeridas se responden con reglas"}
        </p>
        {chat.count ? (
          <Button
            className="ml-auto"
            onClick={chat.reset}
            size="sm"
            variant="ghost"
          >
            Nueva conversación
          </Button>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <RhinoChat
          aiEnabled={snapshot.aiEnabled}
          isManager={isManager}
          onLink={onLink}
          onMessagesChange={onMessagesChange}
          orgSlug={snapshot.orgSlug}
          suggestions={SUGGESTED_QUESTIONS[isManager ? "gerente" : "vendedor"]}
          userId={snapshot.currentUserId}
        />
      </div>
    </div>
  );
}
