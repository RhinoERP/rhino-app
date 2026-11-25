import { expect, it, vi } from "vitest";
import type { InboxItem } from "@/modules/whatsapp/inbox-contract";
import { prepareMessageAttempt, syncTimeline } from "./whatsapp-inbox-client";

it("reuses an uncertain attempt for normalized text, even after editing away and back or a control change", () => {
  const attempt = prepareMessageAttempt({ text: "Hola" }, 1);
  const edited = { text: "Otro texto", attempt };
  const restored = { ...edited, text: "  Hola\n" };
  expect(prepareMessageAttempt(restored, 2)).toBe(attempt);
  expect(attempt.expectedControlVersion).toBe(1);
});

it("creates a new identity for a different message or an explicitly resolved attempt", () => {
  const attempt = prepareMessageAttempt({ text: "Hola" }, 1);
  const next = prepareMessageAttempt({ text: "Otro texto", attempt }, 2);
  const resolved = prepareMessageAttempt({ text: "Hola" }, 2);
  expect(next).toMatchObject({ text: "Otro texto", expectedControlVersion: 2 });
  expect(next.clientRequestId).not.toBe(attempt.clientRequestId);
  expect(resolved.clientRequestId).not.toBe(attempt.clientRequestId);
});

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
