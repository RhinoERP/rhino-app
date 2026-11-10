"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InboxDetail, InboxItem } from "@/modules/whatsapp/inbox-contract";
import type { useInboxHistory } from "./whatsapp-chat";
import { clock, day, messageTypes } from "./whatsapp-inbox-client";

const events = {
  HANDOFF: "Derivación a una persona",
  CLAIM: "Conversación tomada",
  TRANSFER: "Responsable reasignado",
  PAUSE: "Bot pausado",
  RESUME: "Control devuelto a la IA",
  DELIVERY_REVIEW: "Resultado de envío revisado",
};
const delivery = {
  RECEIVED: "Recibido",
  QUEUED: "Pendiente",
  SENT: "Aceptado por Meta",
  DELIVERED: "Entregado",
  READ: "Leído",
  FAILED: "Fallido",
};
const commandStatus = {
  PENDING: "Pendiente",
  SENDING: "Enviando",
  UNKNOWN: "Envío sin confirmar",
  CANCELLED: "Envío cancelado",
};
const audioStatus = {
  PENDING: "Transcripción pendiente",
  PROCESSING: "Transcribiendo",
  SUCCEEDED: "Transcripto",
  FAILED: "Transcripción fallida",
};

export function WhatsAppTimeline({
  chat,
  canRestore,
  history,
  rows,
  onSeen,
  onRestore,
  seen,
  url,
}: {
  chat?: InboxDetail;
  canRestore: boolean;
  history: ReturnType<typeof useInboxHistory>;
  rows: InboxItem[];
  onSeen: (id: string | undefined) => void;
  onRestore: (text: string) => void;
  seen?: string;
  url: string;
}) {
  const { live, older, olderRequested, setOlderRequested } = history;
  const scroll = useRef<HTMLElement>(null);
  const nearBottom = useRef(true);
  const prepend = useRef<{ first: string | undefined; height: number } | null>(
    null
  );
  const last = rows.at(-1)?.id;
  const first = rows[0]?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-anchor when command cards or message content change height.
  useLayoutEffect(() => {
    const panel = scroll.current;
    if (!panel) {
      return;
    }
    if (prepend.current && first !== prepend.current.first) {
      panel.scrollTop += panel.scrollHeight - prepend.current.height;
      prepend.current = null;
    } else if (nearBottom.current) {
      panel.scrollTop = panel.scrollHeight;
      onSeen(last);
    }
  }, [first, last, chat?.commands, live.data, onSeen]);

  useLayoutEffect(() => {
    const panel = scroll.current;
    if (!panel) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) {
        panel.scrollTop = panel.scrollHeight;
      }
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  function loadEarlier() {
    const panel = scroll.current;
    prepend.current = panel ? { first, height: panel.scrollHeight } : null;
    if (olderRequested && older.isError) {
      older.refetch();
    } else if (olderRequested) {
      older.fetchNextPage();
    } else {
      setOlderRequested(true);
    }
  }

  function scrollToNewest() {
    const panel = scroll.current;
    if (panel) {
      panel.scrollTop = panel.scrollHeight;
    }
    nearBottom.current = true;
    onSeen(last);
  }

  const showEarlier =
    (live.data?.older && !olderRequested) ||
    older.hasNextPage ||
    older.isFetching ||
    older.isError;
  let earlierLabel = "Cargar mensajes anteriores";
  if (older.isError) {
    earlierLabel = "Reintentar historial anterior";
  }
  if (older.isFetching) {
    earlierLabel = "Cargando…";
  }
  return (
    <div className="relative min-h-0 flex-1 bg-muted/35">
      <section
        aria-label="Historial"
        className="h-full space-y-2 overflow-y-auto overscroll-contain p-3 [overflow-anchor:none]"
        onScroll={() => {
          const panel = scroll.current;
          if (panel) {
            nearBottom.current =
              panel.scrollHeight - panel.clientHeight - panel.scrollTop < 48;
            if (nearBottom.current) {
              onSeen(last);
            }
          }
        }}
        ref={scroll}
      >
        {live.isPending && (
          <p className="animate-pulse text-center text-muted-foreground text-sm">
            Cargando historial…
          </p>
        )}
        {live.isSuccess && rows.length === 0 && (
          <p className="p-3 text-center text-muted-foreground text-sm">
            Este chat todavía no tiene mensajes.
          </p>
        )}
        {showEarlier && (
          <div className="text-center">
            <Button
              disabled={older.isFetching}
              onClick={loadEarlier}
              size="sm"
              type="button"
              variant="outline"
            >
              {earlierLabel}
            </Button>
          </div>
        )}
        {rows.map((item, index) => {
          const label = day.format(new Date(item.displayAt));
          const previous = rows[index - 1];
          return (
            <Fragment key={item.id}>
              {(!previous ||
                day.format(new Date(previous.displayAt)) !== label) && (
                <p className="mx-auto w-fit rounded-full bg-background px-3 py-1 text-muted-foreground text-xs">
                  {label}
                </p>
              )}
              <TimelineItem
                audioEnabled={chat?.audioEnabled === true}
                item={item}
                url={url}
              />
            </Fragment>
          );
        })}
        {chat?.commands.map((command) => (
          <div
            className="ml-auto w-fit max-w-[85%] space-y-1 rounded-xl border border-dashed bg-background px-3 py-2 text-sm"
            key={command.id}
          >
            {command.text && (
              <p className="whitespace-pre-wrap break-words">{command.text}</p>
            )}
            <p className="text-muted-foreground text-xs">
              {commandStatus[command.status]}
              {command.windowExpired && " · Ventana vencida"} ·{" "}
              {clock.format(new Date(command.at))}
            </p>
            {command.windowExpired && command.text && canRestore && (
              <Button
                onClick={() => onRestore(command.text ?? "")}
                size="sm"
                type="button"
                variant="outline"
              >
                Recuperar borrador
              </Button>
            )}
          </div>
        ))}
      </section>
      {seen && last && seen !== last && (
        <Button
          className="absolute right-4 bottom-3 shadow"
          onClick={scrollToNewest}
          size="sm"
          type="button"
        >
          Nuevos mensajes
        </Button>
      )}
    </div>
  );
}

function TimelineItem({
  item,
  url,
  audioEnabled,
}: {
  item: InboxItem;
  url: string;
  audioEnabled: boolean;
}) {
  const date = new Date(item.displayAt);
  if (item.kind === "event") {
    return (
      <p className="mx-auto w-fit max-w-[90%] rounded-md border bg-background px-2 py-1 text-center text-muted-foreground text-xs">
        {events[item.type]}
        {item.actorName && ` · ${item.actorName}`} · {clock.format(date)}
      </p>
    );
  }
  const outbound = item.direction === "OUTBOUND";
  const author = {
    AGENT: "IA",
    HUMAN: item.senderName ?? "Vendedor",
    LEGACY: "Equipo",
  }[item.origin];
  const showContent = item.type !== "AUDIO" || audioEnabled;
  const showType = item.type !== "TEXT";
  return (
    <article
      className={cn(
        "w-fit max-w-[85%] space-y-1 rounded-xl border px-3 py-2 text-sm",
        outbound
          ? "ml-auto rounded-br-sm bg-primary/10"
          : "rounded-bl-sm bg-background"
      )}
    >
      {outbound && (
        <p className="font-semibold text-muted-foreground text-xs">{author}</p>
      )}
      {showType && <p className="font-medium">{messageTypes[item.type]}</p>}
      {audioEnabled && item.audioPlayable && (
        // biome-ignore lint/a11y/useMediaCaption: The transcript, when available, is rendered alongside the original audio.
        <audio
          aria-label="Audio recibido"
          className="h-10 w-56 max-w-full"
          controls
          preload="none"
          src={`${url}/audio/${item.id}`}
        />
      )}
      {audioEnabled && item.audioStatus && (
        <p className="text-muted-foreground text-xs">
          {audioStatus[item.audioStatus]}
        </p>
      )}
      {showContent && item.content && (
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {item.content}
        </p>
      )}
      <p className="text-right text-muted-foreground text-xs">
        <time dateTime={item.displayAt}>{clock.format(date)}</time>
        {outbound && ` · ${delivery[item.delivery]}`}
      </p>
    </article>
  );
}
