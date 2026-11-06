"use client";

import { PaperPlaneRightIcon, SparkleIcon } from "@phosphor-icons/react";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { askAssistantAction } from "@/modules/commercial-ai/actions/assistant.actions";
import { SUGGESTED_QUESTIONS } from "@/modules/commercial-ai/constants";
import { useCommercialAi } from "./shared";

type ChatMessage = { role: "user" | "assistant"; content: string };

const STORAGE_PREFIX = "rhinos-ia-comercial-chat";
const MAX_STORED = 24;

export function AssistantTab() {
  const { snapshot, isManager } = useCommercialAi();
  const storageKey = `${STORAGE_PREFIX}:${snapshot.orgSlug}:${snapshot.currentUserId}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);
  const suggestions = SUGGESTED_QUESTIONS[isManager ? "gerente" : "vendedor"];

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setMessages(JSON.parse(stored) as ChatMessage[]);
      }
    } catch {
      // Sin almacenamiento local: la conversación arranca vacía.
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(messages.slice(-MAX_STORED))
      );
    } catch {
      // Ignorar: guardar el chat es solo una comodidad.
    }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, storageKey]);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || pending) {
      return;
    }
    const history: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(history);
    setInput("");
    setError("");
    startTransition(async () => {
      const result = await askAssistantAction(snapshot.orgSlug, history);
      if (result.success) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.text },
        ]);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          {snapshot.aiEnabled
            ? `Responde con los datos reales de ${isManager ? "todo el equipo" : "tu cartera"}`
            : "Modo sin IA: las preguntas sugeridas se responden con reglas"}
        </p>
        {messages.length ? (
          <Button
            className="ml-auto"
            onClick={() => {
              setMessages([]);
              setError("");
            }}
            size="sm"
            variant="ghost"
          >
            Nueva conversación
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div
          aria-live="polite"
          className="flex max-h-[60vh] min-h-72 flex-col gap-3 overflow-y-auto p-4"
          ref={logRef}
        >
          {messages.length ? (
            messages.map((message, index) => (
              <div
                className={cn(
                  "max-w-[92%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed md:max-w-[680px]",
                  message.role === "user"
                    ? "self-end whitespace-pre-wrap bg-primary text-primary-foreground"
                    : "self-start bg-muted"
                )}
                // biome-ignore lint/suspicious/noArrayIndexKey: los mensajes no tienen id y solo se agregan al final
                key={index}
              >
                {message.role === "user" ? (
                  message.content
                ) : (
                  <AssistantText text={message.content} />
                )}
              </div>
            ))
          ) : (
            <div className="m-auto grid max-w-md gap-2 text-center">
              <SparkleIcon
                className="mx-auto size-8 text-primary"
                weight="duotone"
              />
              <h3 className="font-heading text-xl">¿En qué te ayudo hoy?</h3>
              <p className="text-muted-foreground text-sm">
                {isManager
                  ? "Preguntá cómo viene el equipo, quién se está yendo o dónde está la plata."
                  : "Preguntá a quién seguir, qué escribir o cómo venís con la meta."}
              </p>
            </div>
          )}
          {pending ? (
            <div className="self-start rounded-2xl bg-muted px-4 py-2.5 text-muted-foreground text-sm">
              Pensando…
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 px-4">
          {suggestions.map((suggestion) => (
            <button
              className="rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
              disabled={pending}
              key={suggestion}
              onClick={() => ask(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <form
          className="flex items-end gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <Textarea
            aria-label="Pregunta para el asistente"
            className="flex-1"
            disabled={!snapshot.aiEnabled}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder={
              snapshot.aiEnabled
                ? "Preguntá a quién seguir, qué escribir o qué priorizar hoy"
                : "Escribir libre se habilita cuando se active la IA"
            }
            rows={2}
            value={input}
          />
          <Button
            aria-label="Enviar"
            disabled={pending || !input.trim() || !snapshot.aiEnabled}
            type="submit"
          >
            <PaperPlaneRightIcon />
            Enviar
          </Button>
        </form>
        {error ? (
          <p className="px-4 pb-4 text-destructive text-sm">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ============ Render del texto del asistente (sin HTML crudo) ============ */

const LINK_PATTERN = /\[\[(cli|opp|pro):([^|\]]+)\|([^\]]+)\]\]/g;
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;
const BULLET_PATTERN = /^\s*[-•]\s+(.*)/;

function InlineText({ text }: { text: string }) {
  const { openCustomer, openOpportunity, openProspect } = useCommercialAi();
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const [whole, kind, id, label] = match;
    const start = match.index ?? 0;
    if (start > last) {
      parts.push(<Bold key={`t${start}`} text={text.slice(last, start)} />);
    }
    parts.push(
      <button
        className="font-medium text-primary underline underline-offset-2"
        key={`l${start}`}
        onClick={() => {
          if (kind === "cli") {
            openCustomer(id);
          } else if (kind === "pro") {
            openProspect(id);
          } else {
            openOpportunity(id);
          }
        }}
        type="button"
      >
        {label}
      </button>
    );
    last = start + whole.length;
  }
  if (last < text.length) {
    parts.push(<Bold key="end" text={text.slice(last)} />);
  }
  return <>{parts}</>;
}

function Bold({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD_PATTERN)) {
    const start = match.index ?? 0;
    parts.push(text.slice(last, start));
    parts.push(<b key={start}>{match[1]}</b>);
    last = start + match[0].length;
  }
  parts.push(text.slice(last));
  return (
    <>
      {parts.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fragmentos estáticos de un texto
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}

function AssistantText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: string) => {
    if (list.length) {
      blocks.push(
        <ul className="my-1 list-disc space-y-0.5 pl-5" key={key}>
          {list.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ítems estáticos de un texto
            <li key={i}>
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  text.split("\n").forEach((line, index) => {
    const bullet = line.match(BULLET_PATTERN);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flush(`ul${index}`);
    if (line.trim()) {
      blocks.push(
        // biome-ignore lint/suspicious/noArrayIndexKey: líneas estáticas de un texto ya recibido
        <p className="mb-1.5 last:mb-0" key={`p${index}`}>
          <InlineText text={line} />
        </p>
      );
    }
  });
  flush("ul-end");
  return <>{blocks}</>;
}
