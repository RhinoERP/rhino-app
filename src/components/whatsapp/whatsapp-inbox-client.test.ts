import { expect, it, vi } from "vitest";
import type { InboxItem } from "@/modules/whatsapp/inbox-contract";
import { syncTimeline } from "./whatsapp-inbox-client";

function message(n: number, delivery: "SENT" | "READ" = "SENT"): InboxItem {
  const at = `2026-11-07T13:21:00.${String(n).padStart(6, "0")}+00:00`;
  return {
    id: String(n),
    kind: "message",
    type: "TEXT",
    at,
    displayAt: at,
    content: "fixture",
    direction: "OUTBOUND",
    origin: "HUMAN",
    senderName: "Operador",
    delivery,
    audioStatus: null,
    audioPlayable: false,
  };
}

it("fills a reconnect gap across pages and deduplicates the rolling window", async () => {
  const old = { rows: [message(1), message(2)], older: null };
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce({ rows: [message(6), message(7)], more: true })
    .mockResolvedValueOnce({ rows: [message(3), message(4)], more: true })
    .mockResolvedValueOnce({
      rows: [message(5), message(6, "READ")],
      more: true,
    });
  const result = await syncTimeline(old, fetchPage);
  expect(result.rows.map((row) => row.id)).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
  ]);
  expect(result.rows[5]).toMatchObject({ delivery: "READ" });
  expect(fetchPage.mock.calls).toEqual([[], [message(2)], [message(4)]]);
});

it("refreshes delivery without a new message and preserves the oldest page boundary", async () => {
  const older = message(1);
  const fetchPage = vi
    .fn()
    .mockResolvedValue({ rows: [message(2, "READ")], more: true });
  const result = await syncTimeline(
    { rows: [older, message(2)], older },
    fetchPage
  );
  expect(result.rows).toEqual([older, message(2, "READ")]);
  expect(result.older).toEqual(older);
  expect(fetchPage).toHaveBeenCalledTimes(1);
});
