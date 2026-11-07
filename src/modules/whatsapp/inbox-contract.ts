import { z } from "zod";

const id = z.uuid();
const date = z.iso.datetime({ offset: true });
const status = z.enum(["ACTIVE", "PAUSED", "HANDOFF", "CLOSED"]);
const direction = z.enum(["INBOUND", "OUTBOUND"]);
const messageType = z.enum([
  "TEXT",
  "AUDIO",
  "DOCUMENT",
  "IMAGE",
  "VIDEO",
  "INTERACTIVE",
  "SYSTEM",
]);

export const inboxFilterSchema = z.enum([
  "all",
  "attention",
  "mine",
  "agent",
  "simulation",
]);
export type InboxFilter = z.infer<typeof inboxFilterSchema>;

export const inboxCursorSchema = z.object({ at: date, id });
export type InboxCursor = z.infer<typeof inboxCursorSchema>;

const customer = z.object({
  id,
  customerName: z.string().nullable(),
  customerPhone: z.string(),
  status,
  assignedUserId: id.nullable(),
  humanClaimedAt: date.nullable(),
});

export const inboxListSchema = z.object({
  attentionCount: z.number().int().nonnegative(),
  rows: z.array(
    customer.extend({
      at: date,
      assignedName: z.string().nullable(),
      lastMessageAt: date.nullable(),
      unread: z.number().int().nonnegative(),
      preview: z
        .object({
          direction,
          type: messageType,
          content: z.string().nullable(),
        })
        .nullable(),
    })
  ),
});
export type InboxList = z.infer<typeof inboxListSchema> & {
  next: InboxCursor | null;
};

const commandStatus = z.enum(["PENDING", "SENDING", "UNKNOWN", "CANCELLED"]);
export const inboxDetailSchema = customer.extend({
  handoffReason: z.string().nullable(),
  controlVersion: z.number().int().nonnegative(),
  deliveryBlock: z.enum(["SENDING", "UNKNOWN"]).nullable(),
  windowEndsAt: date.nullable(),
  isSimulator: z.boolean(),
  canManage: z.boolean(),
  canSend: z.boolean(),
  audioEnabled: z.boolean(),
  readCursor: inboxCursorSchema.nullable(),
  operators: z.array(z.object({ id, name: z.string() })),
  pendingOrder: z.object({ status: z.string(), createdAt: date }).nullable(),
  preSales: z.array(
    z.object({
      id,
      number: z.string().nullable(),
      date: z.string().nullable(),
      status: z.string(),
    })
  ),
  commands: z.array(
    inboxCursorSchema.extend({
      status: commandStatus,
      text: z.string().nullable(),
      windowExpired: z.boolean(),
    })
  ),
});
export type InboxDetail = z.infer<typeof inboxDetailSchema>;

const item = inboxCursorSchema.extend({ displayAt: date });
export const inboxHistorySchema = z.array(
  z.discriminatedUnion("kind", [
    item.extend({
      kind: z.literal("event"),
      actorName: z.string().nullable(),
      type: z.enum([
        "HANDOFF",
        "CLAIM",
        "TRANSFER",
        "PAUSE",
        "RESUME",
        "DELIVERY_REVIEW",
      ]),
    }),
    item.extend({
      kind: z.literal("message"),
      type: messageType,
      direction,
      content: z.string().nullable(),
      origin: z.enum(["AGENT", "HUMAN", "LEGACY"]),
      senderName: z.string().nullable(),
      delivery: z.enum([
        "RECEIVED",
        "QUEUED",
        "SENT",
        "DELIVERED",
        "READ",
        "FAILED",
      ]),
      audioStatus: z
        .enum(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED"])
        .nullable(),
      audioPlayable: z.boolean(),
    }),
  ])
);
export type InboxItem = z.infer<typeof inboxHistorySchema>[number];
export type InboxHistory = { rows: InboxItem[]; more: boolean };
