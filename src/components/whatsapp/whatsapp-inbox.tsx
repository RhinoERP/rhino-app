"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { MessageCircle, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  InboxCursor,
  InboxFilter,
  InboxList,
} from "@/modules/whatsapp/inbox-contract";
import { WhatsAppChat, type WhatsAppDraft } from "./whatsapp-chat";
import {
  accessLost,
  clock,
  cursorParams,
  day,
  inboxFetch,
  LIST_INTERVAL,
  messageTypes,
  stateLabel,
} from "./whatsapp-inbox-client";

const filters = [
  { id: "all", label: "Todos" },
  { id: "attention", label: "Por atender" },
  { id: "mine", label: "Mis chats" },
  { id: "agent", label: "Con IA" },
  { id: "simulation", label: "Simulaciones" },
] as const;

export function WhatsAppInbox({
  currentUserId,
  orgSlug,
  sandboxEnabled,
}: {
  currentUserId: string;
  orgSlug: string;
  sandboxEnabled: boolean;
}) {
  const searchParams = useSearchParams();
  const chatId = searchParams.get("chat");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  const drafts = useRef(new Map<string, WhatsAppDraft>());
  const viewport = useRef<HTMLElement>(null);
  const url = `/api/org/${encodeURIComponent(orgSlug)}/whatsapp/conversaciones`;
  const listKey = ["whatsapp-inbox", orgSlug, currentUserId, "list"] as const;
  const list = useInfiniteQuery({
    queryKey: [...listKey, filter, query],
    initialPageParam: null as InboxCursor | null,
    queryFn: ({ pageParam, signal }) => {
      const params = cursorParams(pageParam);
      params.set("filter", filter);
      params.set("q", query);
      return inboxFetch<InboxList>(`${url}?${params}`, { signal });
    },
    getNextPageParam: (page) => page.next,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: LIST_INTERVAL,
    retry: false,
  });

  useEffect(() => {
    const visibleViewport = window.visualViewport;
    const panel = viewport.current;
    if (!(visibleViewport && panel)) {
      return;
    }
    function update() {
      panel?.style.setProperty(
        "--whatsapp-viewport",
        `${visibleViewport?.height}px`
      );
    }
    update();
    visibleViewport.addEventListener("resize", update);
    return () => visibleViewport.removeEventListener("resize", update);
  }, []);

  function selectChat(id: string | null) {
    const next = new URL(window.location.href);
    if (id) {
      next.searchParams.set("chat", id);
    } else {
      next.searchParams.delete("chat");
    }
    window.history.pushState(null, "", next);
  }

  const noAccess = accessLost(list.error);
  const rows = deduplicateRows(noAccess ? [] : (list.data?.pages ?? []));
  const attention = noAccess ? 0 : (list.data?.pages[0]?.attentionCount ?? 0);

  return (
    <section
      aria-label="Bandeja de WhatsApp"
      className="grid h-[calc(var(--whatsapp-viewport,100dvh)-8rem)] min-w-0 overflow-hidden rounded-xl border bg-background md:h-[calc(100dvh-2rem)] md:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]"
      ref={viewport}
    >
      <aside
        aria-label="Lista de conversaciones"
        className={cn(
          "min-h-0 min-w-0 flex-col md:flex md:border-r",
          chatId ? "hidden" : "flex"
        )}
      >
        <div className="space-y-3 border-b bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <MessageCircle aria-hidden="true" className="size-5 text-primary" />
            <h1 className="font-heading text-lg">WhatsApp</h1>
            {attention > 0 && (
              <span className="ml-auto rounded-full bg-primary/10 px-2 py-1 text-primary text-xs">
                {attention} por atender
              </span>
            )}
          </div>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute top-2.5 left-3 size-4 text-muted-foreground"
            />
            <Input
              aria-label="Buscar por nombre o teléfono"
              className="bg-background pl-9"
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nombre o teléfono"
              type="search"
              value={search}
            />
          </div>
          <fieldset className="flex flex-wrap gap-1">
            <legend className="sr-only">Filtros</legend>
            {filters
              .filter(({ id }) => id !== "simulation" || sandboxEnabled)
              .map(({ id, label }) => (
                <Button
                  aria-pressed={filter === id}
                  className="h-7 px-2 text-xs"
                  key={id}
                  onClick={() => setFilter(id)}
                  size="sm"
                  type="button"
                  variant={filter === id ? "default" : "outline"}
                >
                  {label}
                </Button>
              ))}
          </fieldset>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filter === "simulation" && (
            <p className="border-b px-3 py-2 text-muted-foreground text-xs">
              Simulaciones locales · sin envíos a Meta
            </p>
          )}
          {list.isPaused && (
            <output className="block p-3 text-muted-foreground text-sm">
              Sin conexión. La lista se actualizará al reconectar.
            </output>
          )}
          {list.isPending && !list.isPaused && (
            <p className="animate-pulse p-4 text-muted-foreground text-sm">
              Cargando conversaciones…
            </p>
          )}
          {list.isError && (
            <div className="space-y-2 p-3 text-sm">
              <output className="block">
                {noAccess
                  ? "El módulo o esta vista ya no están disponibles."
                  : "No se pudo actualizar la lista."}
              </output>
              <Button
                onClick={() => list.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Reintentar
              </Button>
            </div>
          )}
          {list.isSuccess && rows.length === 0 && (
            <p className="p-4 text-muted-foreground text-sm">
              No hay conversaciones para esta vista.
            </p>
          )}
          <ul>
            {rows.map((row) => (
              <ChatListRow
                currentUserId={currentUserId}
                key={row.id}
                onSelect={selectChat}
                row={row}
                selected={row.id === chatId}
              />
            ))}
          </ul>
          {list.hasNextPage && !noAccess && (
            <Button
              className="m-3"
              disabled={list.isFetching}
              onClick={() => list.fetchNextPage()}
              size="sm"
              type="button"
              variant="outline"
            >
              Cargar más
            </Button>
          )}
        </div>
      </aside>
      {chatId ? (
        <WhatsAppChat
          currentUserId={currentUserId}
          draft={drafts.current.get(chatId)}
          key={chatId}
          listKey={listKey}
          onBack={() => selectChat(null)}
          onDraft={(draft) => drafts.current.set(chatId, draft)}
          orgSlug={orgSlug}
          url={`${url}/${encodeURIComponent(chatId)}`}
        />
      ) : (
        <div className="hidden place-content-center gap-3 bg-muted/20 p-6 text-center text-muted-foreground md:grid">
          <MessageCircle aria-hidden="true" className="mx-auto size-8" />
          <p>Elegí una conversación para ver el historial.</p>
        </div>
      )}
    </section>
  );
}

const whitespace = /\s+/;

function deduplicateRows(pages: InboxList[]) {
  const rows = new Map<string, InboxList["rows"][number]>();
  for (const page of pages) {
    for (const row of page.rows) {
      if (!rows.has(row.id)) {
        rows.set(row.id, row);
      }
    }
  }
  return [...rows.values()];
}

function ChatListRow({
  row,
  selected,
  currentUserId,
  onSelect,
}: {
  row: InboxList["rows"][number];
  selected: boolean;
  currentUserId: string;
  onSelect: (id: string) => void;
}) {
  const name = row.customerName ?? row.customerPhone;
  const initials = name
    .trim()
    .split(whitespace)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  const at = row.lastMessageAt ? new Date(row.lastMessageAt) : null;
  return (
    <li className="border-b" key={row.id}>
      <button
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 p-3 text-left hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]",
          selected && "bg-primary/10"
        )}
        onClick={() => onSelect(row.id)}
        type="button"
      >
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary text-xs"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium text-sm">{name}</span>
            {at && (
              <time
                className="shrink-0 text-muted-foreground text-xs"
                dateTime={row.lastMessageAt ?? undefined}
              >
                {at.toDateString() === new Date().toDateString()
                  ? clock.format(at)
                  : day.format(at)}
              </time>
            )}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {row.preview?.direction === "OUTBOUND" && "Equipo · "}
            {row.preview
              ? row.preview.content || messageTypes[row.preview.type]
              : "Sin mensajes"}
          </span>
          <span className="mt-1 block text-muted-foreground text-xs">
            {stateLabel(row)}
            {row.assignedUserId === currentUserId && " · Vos"}
            {row.assignedUserId !== currentUserId &&
              row.assignedName &&
              ` · ${row.assignedName}`}
          </span>
        </span>
        {row.unread > 0 && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground text-xs">
            {row.unread >= 100 ? "99+" : row.unread}
            <span className="sr-only"> mensajes sin leer</span>
          </span>
        )}
      </button>
    </li>
  );
}
