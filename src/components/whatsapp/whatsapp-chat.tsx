"use client";

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { controlWhatsAppConversationAction } from "@/modules/whatsapp/actions/control-whatsapp-conversation.action";
import { reviewWhatsAppDeliveryAction } from "@/modules/whatsapp/actions/review-whatsapp-delivery.action";
import { sendWhatsAppManualMessageAction } from "@/modules/whatsapp/actions/send-whatsapp-manual-message.action";
import type {
  InboxDetail,
  InboxHistory,
} from "@/modules/whatsapp/inbox-contract";
import {
  type ControlOperation,
  type Review,
  WhatsAppChatHeader,
} from "./whatsapp-chat-controls";
import {
  accessLost,
  CHAT_INTERVAL,
  compareCursor,
  cursorParams,
  dateTime,
  inboxFetch,
  type LiveHistory,
  mergeTimeline,
  syncTimeline,
} from "./whatsapp-inbox-client";

import { WhatsAppTimeline } from "./whatsapp-timeline";

export type WhatsAppDraft = {
  text: string;
  attempt?: { clientRequestId: string; expectedControlVersion: number };
};
const emptyDraft: WhatsAppDraft = { text: "" };
function subscribeConnection(update: () => void) {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  document.addEventListener("visibilitychange", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
    document.removeEventListener("visibilitychange", update);
  };
}

type ChatProps = {
  currentUserId: string;
  draft?: WhatsAppDraft;
  listKey: readonly string[];
  onBack: () => void;
  onDraft: (draft: WhatsAppDraft) => void;
  orgSlug: string;
  url: string;
};

export function WhatsAppChat({
  currentUserId,
  draft: savedDraft,
  listKey,
  onBack,
  onDraft,
  orgSlug,
  url,
}: ChatProps) {
  const queryClient = useQueryClient();
  const online = useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
    () => true
  );
  const key = ["whatsapp-inbox", orgSlug, currentUserId, url] as const;
  const detail = useQuery({
    queryKey: [...key, "detail"],
    queryFn: ({ signal }) => inboxFetch<InboxDetail>(url, { signal }),
    gcTime: 0,
    staleTime: 0,
    refetchInterval: CHAT_INTERVAL,
    retry: false,
  });
  const history = useInboxHistory(url, key);
  const { live, older } = history;
  const [seen, setSeen] = useState<string>();
  const rows = mergeTimeline(
    ...(older.data?.pages.map((page) => page.rows) ?? []),
    live.data?.rows ?? []
  );
  const last = rows.at(-1)?.id;
  const lastInbound = rows.findLast(
    (row) => row.kind === "message" && row.direction === "INBOUND"
  );
  const readCursor = detail.data?.readCursor;
  const markId =
    lastInbound && (!readCursor || compareCursor(lastInbound, readCursor) > 0)
      ? lastInbound.id
      : null;
  const inaccessible =
    accessLost(detail.error) ||
    accessLost(live.error) ||
    accessLost(older.error);
  useMarkRead({
    pollAt: detail.dataUpdatedAt,
    inaccessible,
    last,
    listKey,
    markId,
    online,
    seen,
    url,
  });

  const chat = inaccessible ? undefined : detail.data;
  const interactive =
    online && !detail.isError && !live.isError && !inaccessible;
  const actions = useChatActions({
    chat,
    currentUserId,
    draft: savedDraft,
    interactive,
    key,
    listKey,
    onDraft,
    orgSlug,
  });

  return (
    <section
      aria-label="Chat de WhatsApp"
      className="flex min-h-0 min-w-0 flex-col"
    >
      <WhatsAppChatHeader
        chat={chat}
        currentUserId={currentUserId}
        disabled={actions.busy || !interactive}
        onBack={onBack}
        onControl={actions.control}
        onReview={actions.review}
        orgSlug={orgSlug}
      />
      {inaccessible ? (
        <output className="p-4 text-muted-foreground text-sm">
          Esta conversación ya no está disponible.
        </output>
      ) : (
        <>
          {!interactive && (
            <ChatConnectionNotice
              online={online}
              onRetry={() => queryClient.invalidateQueries({ queryKey: key })}
            />
          )}
          {chat?.deliveryBlock && (
            <output className="border-b bg-amber-50 p-2 text-amber-900 text-sm dark:bg-amber-950 dark:text-amber-100">
              {chat.deliveryBlock === "SENDING"
                ? "Finalizando un envío en curso. Puede llegar aunque cambie el control."
                : "Hay un envío sin confirmar. Revisalo desde la ficha antes de enviar o devolver el control."}
            </output>
          )}
          <WhatsAppTimeline
            canRestore={actions.canRestore}
            chat={chat}
            history={history}
            onRestore={(text) => actions.updateDraft({ text })}
            onSeen={setSeen}
            rows={rows}
            seen={seen}
            url={url}
          />
          {chat && (
            <ChatComposer
              busy={actions.busy}
              canSend={actions.canSend}
              chat={chat}
              composerError={actions.composerError}
              currentUserId={currentUserId}
              draft={actions.draft}
              onSend={actions.send}
              onTextChange={(text) => {
                actions.setComposerError("");
                actions.updateDraft({ text });
              }}
              withinWindow={actions.withinWindow}
            />
          )}
        </>
      )}
    </section>
  );
}

function ChatConnectionNotice({
  online,
  onRetry,
}: {
  online: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b bg-muted p-2 text-sm">
      <output>
        {online
          ? "No se pudo actualizar el chat."
          : "Sin conexión. Los envíos están pausados."}
      </output>
      {online && (
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function useInboxHistory(url: string, key: readonly string[]) {
  const queryClient = useQueryClient();
  const liveKey = [...key, "live"];
  const live = useQuery({
    queryKey: liveKey,
    queryFn: ({ signal }) =>
      syncTimeline(queryClient.getQueryData<LiveHistory>(liveKey), (cursor) => {
        const params = cursorParams(cursor);
        if (cursor) {
          params.set("direction", "after");
        }
        return inboxFetch<InboxHistory>(`${url}/mensajes?${params}`, {
          signal,
        });
      }),
    gcTime: 0,
    staleTime: 0,
    refetchInterval: CHAT_INTERVAL,
    retry: false,
  });
  const [olderRequested, setOlderRequested] = useState(false);
  const older = useInfiniteQuery({
    queryKey: [...key, "older"],
    initialPageParam: live.data?.older ?? null,
    queryFn: ({ pageParam, signal }) =>
      inboxFetch<InboxHistory>(`${url}/mensajes?${cursorParams(pageParam)}`, {
        signal,
      }),
    getNextPageParam: (page) => (page.more ? (page.rows[0] ?? null) : null),
    enabled: olderRequested && Boolean(live.data?.older),
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });

  return { live, older, olderRequested, setOlderRequested };
}

function useChatActions({
  chat,
  currentUserId,
  draft: savedDraft,
  interactive,
  key,
  listKey,
  onDraft,
  orgSlug,
}: Pick<
  ChatProps,
  "currentUserId" | "draft" | "listKey" | "onDraft" | "orgSlug"
> & { chat?: InboxDetail; interactive: boolean; key: readonly string[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(savedDraft ?? emptyDraft);
  const [busy, setBusy] = useState(false);
  const [composerError, setComposerError] = useState("");
  const actionInFlight = useRef(false);
  const owner =
    chat?.status === "HANDOFF" &&
    chat.humanClaimedAt &&
    chat.assignedUserId === currentUserId;
  const withinWindow = Boolean(
    chat?.windowEndsAt && Date.parse(chat.windowEndsAt) > Date.now()
  );
  const canSend = Boolean(
    interactive &&
      chat?.canManage &&
      chat.canSend &&
      owner &&
      !chat.deliveryBlock &&
      withinWindow
  );
  const canRestore = Boolean(
    chat?.canManage &&
      chat.canSend &&
      chat.status !== "CLOSED" &&
      !busy &&
      !draft.text
  );
  function updateDraft(next: WhatsAppDraft) {
    setDraft(next);
    onDraft(next);
  }

  async function runAction(run: () => Promise<boolean>) {
    if (!(interactive && navigator.onLine) || actionInFlight.current) {
      return false;
    }
    actionInFlight.current = true;
    setBusy(true);
    try {
      return await run();
    } catch {
      toast.error("No se pudo confirmar la operación. Volvé a intentar.");
      return false;
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: listKey }),
      ]);
      setBusy(false);
      actionInFlight.current = false;
    }
  }

  const actionInput = {
    orgSlug,
    conversationId: chat?.id,
    expectedControlVersion: chat?.controlVersion,
  };

  function control(operation: ControlOperation, assignedUserId?: string) {
    runAction(async () => {
      const result = await controlWhatsAppConversationAction({
        ...actionInput,
        operation,
        assignedUserId,
      });
      if (!result.success) {
        toast.error(result.error ?? "No se pudo actualizar el control.");
      } else if (operation === "RESUME") {
        toast.success("La IA atenderá los mensajes nuevos de este chat.");
      }
      return result.success;
    });
  }

  function review(input: Review) {
    return runAction(async () => {
      const result = await reviewWhatsAppDeliveryAction({
        ...actionInput,
        ...input,
      });
      if (!result.success) {
        toast.error(result.error ?? "No se pudo registrar la revisión.");
      }
      return result.success;
    });
  }

  function send() {
    const text = draft.text.trim();
    if (!(chat && canSend && text)) {
      return;
    }
    runAction(async () => {
      setComposerError("");
      const attempt = draft.attempt ?? {
        clientRequestId: crypto.randomUUID(),
        expectedControlVersion: chat.controlVersion,
      };
      updateDraft({ text: draft.text, attempt });
      try {
        const result = await sendWhatsAppManualMessageAction({
          ...actionInput,
          ...attempt,
          text,
        });
        if (result.success) {
          updateDraft(emptyDraft);
          return true;
        }
        if (result.code) {
          updateDraft({ text: draft.text });
        }
        setComposerError(
          result.error ?? "No se pudo confirmar el comando de envío."
        );
      } catch {
        setComposerError(
          "No se pudo confirmar el comando. Si reintentás el mismo texto se conserva la clave de envío."
        );
      }
      return false;
    });
  }

  return {
    busy,
    canRestore,
    canSend,
    composerError,
    control,
    draft,
    review,
    send,
    setComposerError,
    updateDraft,
    withinWindow,
  };
}

function useMarkRead({
  pollAt,
  inaccessible,
  last,
  listKey,
  markId,
  online,
  seen,
  url,
}: {
  pollAt: number;
  inaccessible: boolean;
  last?: string;
  listKey: readonly string[];
  markId: string | null;
  online: boolean;
  seen?: string;
  url: string;
}) {
  const queryClient = useQueryClient();
  const visible = useSyncExternalStore(
    subscribeConnection,
    () => document.visibilityState === "visible",
    () => false
  );
  const lastMarked = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retry a failed personal read on a successful poll.
  useEffect(() => {
    if (
      !(online && visible && markId && !inaccessible && seen === last) ||
      lastMarked.current === markId
    ) {
      return;
    }
    lastMarked.current = markId;
    const controller = new AbortController();
    inboxFetch<void>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: markId }),
      signal: controller.signal,
    })
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: listKey,
        })
      )
      .catch(() => {
        if (lastMarked.current === markId) {
          lastMarked.current = null;
        }
      });
    return () => controller.abort();
  }, [
    pollAt,
    inaccessible,
    last,
    markId,
    online,
    listKey,
    queryClient,
    seen,
    url,
    visible,
  ]);
}

function ChatComposer({
  chat,
  currentUserId,
  withinWindow,
  busy,
  canSend,
  draft,
  composerError,
  onTextChange,
  onSend,
}: {
  chat: InboxDetail;
  currentUserId: string;
  withinWindow: boolean;
  busy: boolean;
  canSend: boolean;
  draft: WhatsAppDraft;
  composerError: string;
  onTextChange: (text: string) => void;
  onSend: () => void;
}) {
  return (
    <form
      className="shrink-0 space-y-1 border-t bg-background p-2 sm:p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      {chat.canManage && chat.canSend && chat.status !== "CLOSED" ? (
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Mensaje para el cliente"
            className="min-h-10 resize-none"
            disabled={busy}
            maxLength={4000}
            onChange={(event) => {
              onTextChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="Escribí un mensaje"
            rows={2}
            value={draft.text}
          />
          <Button
            aria-label="Enviar mensaje"
            disabled={busy || !canSend || !draft.text.trim()}
            size="icon"
            type="submit"
          >
            <Send aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <ComposerNote
        chat={chat}
        currentUserId={currentUserId}
        withinWindow={withinWindow}
      />
      {composerError && (
        <p className="text-destructive text-xs" role="alert">
          {composerError}
        </p>
      )}
    </form>
  );
}

function ComposerNote({
  chat,
  currentUserId,
  withinWindow,
}: {
  chat: InboxDetail;
  currentUserId: string;
  withinWindow: boolean;
}) {
  let note = chat.windowEndsAt
    ? `Texto libre hasta ${dateTime.format(new Date(chat.windowEndsAt))}. Shift+Enter agrega una línea.`
    : "";
  if (!withinWindow) {
    note =
      "La ventana de 24 horas está cerrada. El próximo mensaje del cliente volverá a habilitar el texto libre.";
  }
  if (!chat.humanClaimedAt) {
    note = "Podés preparar un borrador. Tomá la conversación para enviar.";
  } else if (chat.assignedUserId !== currentUserId) {
    note = "Otro operador atiende esta conversación.";
  }
  if (!(chat.canManage && chat.canSend) || chat.status === "CLOSED") {
    note = chat.isSimulator
      ? "Simulación local · sólo observación de mensajes."
      : "Sólo lectura.";
  }
  return <p className="text-muted-foreground text-xs">{note}</p>;
}
