import type {
  InboxCursor,
  InboxHistory,
  InboxItem,
} from "@/modules/whatsapp/inbox-contract";

export const LIST_INTERVAL = 10_000;
export const CHAT_INTERVAL = 3000;

export class InboxRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("No se pudo consultar WhatsApp");
    this.status = status;
  }
}

export function accessLost(error: unknown) {
  return (
    error instanceof InboxRequestError && [401, 403, 404].includes(error.status)
  );
}

export async function inboxFetch<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) {
    throw new InboxRequestError(response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function cursorParams(cursor?: InboxCursor | null) {
  return new URLSearchParams(cursor ? { at: cursor.at, id: cursor.id } : {});
}

export const messageTypes = {
  TEXT: "Mensaje",
  AUDIO: "Audio",
  IMAGE: "Imagen",
  DOCUMENT: "Documento",
  VIDEO: "Video",
  INTERACTIVE: "Mensaje interactivo",
  SYSTEM: "Mensaje del sistema",
};

export function stateLabel(chat: {
  status: string;
  humanClaimedAt: string | null;
}) {
  if (chat.humanClaimedAt) {
    return "Atención humana";
  }
  return (
    {
      ACTIVE: "Atiende la IA",
      PAUSED: "Bot pausado",
      HANDOFF: "Esperando atención",
      CLOSED: "Cerrada",
    }[chat.status] ?? chat.status
  );
}

export const clock = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});
export const day = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" });
export const dateTime = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function compareCursor(a: InboxCursor, b: InboxCursor) {
  // PostgreSQL formats every cursor in the same time zone, at microsecond precision.
  return a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at);
}

export function mergeTimeline(...pages: InboxItem[][]) {
  const items = new Map<string, InboxItem>();
  for (const page of pages) {
    for (const item of page) {
      items.set(item.id, item);
    }
  }
  return [...items.values()].sort(compareCursor);
}

export type LiveHistory = {
  rows: InboxItem[];
  older: InboxCursor | null;
};

export async function syncTimeline(
  previous: LiveHistory | undefined,
  getPage: (cursor?: InboxCursor) => Promise<InboxHistory>
): Promise<LiveHistory> {
  const latest = await getPage();
  const latestStart = latest.rows[0];
  let tail = previous?.rows.at(-1);
  const gap: InboxItem[] = [];

  // Recover any range skipped by the rolling window after a long disconnect.
  while (
    tail &&
    latestStart &&
    latest.more &&
    compareCursor(tail, latestStart) < 0
  ) {
    const page = await getPage(tail);
    gap.push(...page.rows);
    if (!page.more) {
      break;
    }
    const last = page.rows.at(-1);
    if (!last || compareCursor(last, tail) <= 0) {
      throw new Error("El cursor de WhatsApp no avanzó");
    }
    tail = last;
  }
  const oldestAvailable = latest.more ? (latestStart ?? null) : null;
  return {
    rows: mergeTimeline(previous?.rows ?? [], latest.rows, gap),
    older: previous?.rows.length ? previous.older : oldestAvailable,
  };
}
