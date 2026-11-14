"use client";

import { PaperPlaneRightIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { askAssistantAction } from "@/modules/commercial-ai/actions/assistant.actions";
import { RhinoAvatar } from "./rhino-avatar";
import { type RhinoLinkHandler, RhinoText } from "./rhino-text";

type ChatMessage = { role: "user" | "assistant"; content: string };

const STORAGE_PREFIX = "rhinos-ia-comercial-chat";
const SYNC_EVENT = "rhino-chat-sync";
const MAX_STORED = 24;

function readStored(key: string): ChatMessage[] {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

/**
 * La conversación con RHINO. La misma en la pestaña de IA Comercial y en la
 * burbuja flotante: se guarda en este navegador y se sincroniza entre ambas.
 */
function useRhinoChat(orgSlug: string, userId: string) {
  const storageKey = `${STORAGE_PREFIX}:${orgSlug}:${userId}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMessages(readStored(storageKey));
    const sync = (event: Event) => {
      if ((event as CustomEvent<string>).detail === storageKey) {
        setMessages(readStored(storageKey));
      }
    };
    window.addEventListener(SYNC_EVENT, sync);
    return () => window.removeEventListener(SYNC_EVENT, sync);
  }, [storageKey]);

  const persist = useCallback(
    (next: ChatMessage[]) => {
      setMessages(next);
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(next.slice(-MAX_STORED))
        );
        window.dispatchEvent(
          new CustomEvent(SYNC_EVENT, { detail: storageKey })
        );
      } catch {
        // Guardar el chat es solo una comodidad.
      }
    },
    [storageKey]
  );

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || pending) {
      return false;
    }
    const history: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    persist(history);
    setError("");
    startTransition(async () => {
      const result = await askAssistantAction(orgSlug, history);
      if (result.success) {
        persist([...history, { role: "assistant", content: result.text }]);
      } else {
        setError(result.error);
      }
    });
    return true;
  };

  const reset = () => {
    persist([]);
    setError("");
  };

  return { messages, error, pending, ask, reset };
}

function MessageBubble({
  message,
  onLink,
}: {
  message: ChatMessage;
  onLink?: RhinoLinkHandler;
}) {
  if (message.role === "user") {
    return (
      <div className="max-w-[88%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-primary-foreground text-sm leading-relaxed">
        {message.content}
      </div>
    );
  }
  return (
    <div className="flex max-w-[94%] items-start gap-2 self-start md:max-w-[700px]">
      <RhinoAvatar className="mt-0.5" size={24} />
      <div className="rounded-2xl rounded-tl-md bg-muted px-3.5 py-2 text-sm leading-relaxed">
        <RhinoText onLink={onLink} text={message.content} />
      </div>
    </div>
  );
}

function EmptyChat({
  compact,
  isManager,
}: {
  compact: boolean;
  isManager: boolean;
}) {
  return (
    <div className="m-auto grid max-w-md justify-items-center gap-2 py-4 text-center">
      <RhinoAvatar size={compact ? 44 : 56} />
      <h3 className="font-heading text-lg">Hola, soy RHINO</h3>
      <p className="text-muted-foreground text-sm">
        {isManager
          ? "Preguntame cómo viene el equipo, quién se está yendo, cómo está el stock o dónde está la plata."
          : "Preguntame a quién seguir, qué escribirle a un cliente o cómo venís con la meta."}
      </p>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2 self-start">
      <RhinoAvatar size={24} />
      <span className="flex gap-1 rounded-2xl bg-muted px-3.5 py-3">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
      </span>
    </div>
  );
}

export type RhinoChatProps = {
  orgSlug: string;
  userId: string;
  isManager: boolean;
  aiEnabled: boolean;
  suggestions: readonly string[];
  onLink?: RhinoLinkHandler;
  /** Versión chica para la burbuja flotante. */
  compact?: boolean;
  /** Para mostrar "Nueva conversación" afuera del chat. */
  onMessagesChange?: (count: number, reset: () => void) => void;
};

export function RhinoChat({
  orgSlug,
  userId,
  isManager,
  aiEnabled,
  suggestions,
  onLink,
  compact = false,
  onMessagesChange,
}: RhinoChatProps) {
  const { messages, error, pending, ask, reset } = useRhinoChat(
    orgSlug,
    userId
  );
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset cambia en cada render; solo importa la cantidad
  useEffect(() => {
    onMessagesChange?.(messages.length, reset);
  }, [messages.length, onMessagesChange]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: bajar al último mensaje cuando llega uno nuevo
  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  const send = (text: string) => {
    if (ask(text)) {
      setInput("");
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "h-full" : "")}>
      <div
        aria-live="polite"
        className={cn(
          "flex flex-col gap-3 overflow-y-auto p-4",
          compact ? "min-h-0 flex-1" : "max-h-[60vh] min-h-72"
        )}
        ref={logRef}
      >
        {messages.length ? (
          messages.map((message, index) => (
            <MessageBubble
              // biome-ignore lint/suspicious/noArrayIndexKey: los mensajes no tienen id y solo se agregan al final
              key={index}
              message={message}
              onLink={onLink}
            />
          ))
        ) : (
          <EmptyChat compact={compact} isManager={isManager} />
        )}
        {pending ? <Thinking /> : null}
      </div>

      {messages.length < 2 ? (
        <div
          className={cn(
            "flex gap-2 px-4",
            compact ? "overflow-x-auto pb-1" : "flex-wrap"
          )}
        >
          {suggestions.map((suggestion) => (
            <button
              className="shrink-0 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-muted disabled:opacity-50 md:text-sm"
              disabled={pending}
              key={suggestion}
              onClick={() => send(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className={cn("flex items-end gap-2", compact ? "p-3" : "p-4")}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          aria-label="Mensaje para RHINO"
          className="max-h-32 min-h-10 flex-1 resize-none"
          disabled={!aiEnabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={
            aiEnabled
              ? "Escribile a RHINO…"
              : "Escribir libre se habilita cuando se active la IA"
          }
          rows={compact ? 1 : 2}
          value={input}
        />
        <Button
          aria-label="Enviar"
          disabled={pending || !input.trim() || !aiEnabled}
          size={compact ? "icon" : "default"}
          type="submit"
        >
          <PaperPlaneRightIcon />
          {compact ? null : "Enviar"}
        </Button>
      </form>
      {error ? (
        <p className="px-4 pb-3 text-destructive text-sm">{error}</p>
      ) : null}
    </div>
  );
}
