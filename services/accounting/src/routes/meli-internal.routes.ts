import { Router } from "express";
import { sql } from "kysely";
import { z } from "zod";
import { db } from "../db/client";
import {
  createAndVerifyMeliJournalFoundation,
  findMeliJournalFoundation,
  findMeliPaymentReversalFoundation,
  inspectMeliInvoiceFoundation,
  meliJournalInput,
  meliReversalInput,
  meliReversalSourceInput,
  reverseVerifiedMeliPaymentFoundation,
  verifyMeliReversalSourceFoundation,
} from "../modules/journal/meli-journal.foundation";
import { AppError } from "../utils/errors";

const router: ReturnType<typeof Router> = Router();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const periodChange = z
  .object({
    orgId: z.string().uuid(),
    periodStart: z
      .string()
      .regex(ISO_DATE)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return (
          !Number.isNaN(date.getTime()) &&
          date.toISOString().slice(0, 10) === value &&
          value.endsWith("-01")
        );
      }),
    expectedStatus: z.enum(["UNCONFIGURED", "OPEN", "CLOSED"]),
    newStatus: z.enum(["OPEN", "CLOSED"]),
    actorId: z.string().uuid(),
    reason: z
      .string()
      .min(5)
      .max(500)
      .refine((value) => value === value.trim()),
    requestKey: z.string().uuid(),
  })
  .strict()
  .refine((value) => value.expectedStatus !== value.newStatus);

const publishJournal = z
  .object({
    saleId: z.string().uuid(),
    payload: meliJournalInput,
  })
  .strict()
  .refine(
    ({ payload }) =>
      payload.originType === "invoice" ||
      payload.componentKey === "fiscal" ||
      payload.originType === "payment",
    "Origen contable Meli inválido"
  );

router.post("/journal/publish", async (req, res, next) => {
  try {
    const parsed = publishJournal.safeParse(req.body);
    if (!parsed.success) {
      next(AppError.badRequest("Solicitud de publicación Meli inválida"));
      return;
    }
    const { saleId, payload } = parsed.data;
    if (
      (payload.originType === "invoice" &&
        payload.originId.toLowerCase() !== saleId.toLowerCase()) ||
      (payload.originType === "payment" && payload.componentKey.length === 0)
    ) {
      next(AppError.badRequest("El asiento no coincide con su venta"));
      return;
    }
    if (payload.originType !== "invoice") {
      const invoice = await inspectMeliInvoiceFoundation(
        payload.orgId,
        saleId,
        db
      );
      if (!invoice) {
        next(
          new AppError(
            "La factura Meli debe estar contabilizada antes de este origen.",
            409
          )
        );
        return;
      }
    }
    const period = await sql<{ status: string }>`
      SELECT status FROM accounting.meli_posting_periods
      WHERE org_id = ${payload.orgId}::uuid
        AND period_start = date_trunc('month', ${payload.date}::date::timestamp)::date
    `.execute(db);
    if (period.rows[0]?.status !== "OPEN") {
      next(new AppError("El período Meli está cerrado o no configurado.", 409));
      return;
    }
    const journalEntryId = await createAndVerifyMeliJournalFoundation(
      payload,
      db
    );
    res.json({ ok: true, data: { journalEntryId } });
  } catch (error) {
    next(error);
  }
});

router.post("/reversal/publish", async (req, res, next) => {
  try {
    const parsed = meliReversalSourceInput.safeParse(req.body);
    if (!parsed.success) {
      next(AppError.badRequest("Solicitud de reversión Meli inválida"));
      return;
    }
    const entryId = await reverseVerifiedMeliPaymentFoundation(parsed.data, db);
    res.json({ ok: true, data: { reversalEntryId: entryId } });
  } catch (error) {
    next(error);
  }
});

router.post("/journal/period/change", async (req, res, next) => {
  try {
    const parsed = periodChange.safeParse(req.body);
    if (!parsed.success) {
      next(AppError.badRequest("Solicitud de cambio de período Meli inválida"));
      return;
    }
    const input = parsed.data;
    const result = await sql<{
      status: "OPEN" | "CLOSED";
      idempotent: boolean;
    }>`
      SELECT status, idempotent FROM accounting.change_meli_posting_period(
        ${input.orgId}::uuid, ${input.periodStart}::date,
        ${input.expectedStatus}::text, ${input.newStatus}::text,
        ${input.actorId}::uuid, ${input.reason}::text, ${input.requestKey}::uuid
      )
    `.execute(db);
    const row = z
      .object({ status: z.enum(["OPEN", "CLOSED"]), idempotent: z.boolean() })
      .parse(result.rows[0]);
    if (row.status !== input.newStatus) {
      throw new Error("La respuesta del cambio de período no coincide.");
    }
    res.json({ ok: true, data: row });
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      if (error.code === "40001") {
        next(
          new AppError("El período cambió. Consultá su estado actual.", 409)
        );
        return;
      }
      if (error.code === "22023") {
        next(
          new AppError(
            "La solicitud de cambio de período es incompatible con la clave existente.",
            409
          )
        );
        return;
      }
    }
    next(error);
  }
});

router.post("/journal/period/inspect", async (req, res, next) => {
  try {
    const parsed = z
      .object({
        orgId: z.string().uuid(),
        date: z
          .string()
          .regex(ISO_DATE)
          .refine((value) => {
            const date = new Date(`${value}T00:00:00.000Z`);
            return (
              !Number.isNaN(date.getTime()) &&
              date.toISOString().slice(0, 10) === value
            );
          }),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      next(AppError.badRequest("Solicitud de período Meli inválida"));
      return;
    }
    const result = await sql<{ status: "OPEN" | "CLOSED" }>`
      SELECT status FROM accounting.meli_posting_periods
      WHERE org_id = ${parsed.data.orgId}::uuid
        AND period_start = date_trunc('month', ${parsed.data.date}::date::timestamp)::date
    `.execute(db);
    res.json({
      ok: true,
      data: { status: result.rows[0]?.status ?? "UNCONFIGURED" },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/journal/invoice/inspect", async (req, res, next) => {
  try {
    const parsed = z
      .object({ orgId: z.string().uuid(), saleId: z.string().uuid() })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      next(
        AppError.badRequest("Solicitud de revisión de factura Meli inválida")
      );
      return;
    }
    const result = await inspectMeliInvoiceFoundation(
      parsed.data.orgId,
      parsed.data.saleId,
      db
    );
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/journal/lookup", async (req, res, next) => {
  try {
    const parsed = meliJournalInput.safeParse(req.body);
    if (
      !parsed.success ||
      (parsed.data.originType !== "payment" &&
        parsed.data.componentKey !== "fiscal")
    ) {
      next(AppError.badRequest("Solicitud de recuperación Meli inválida"));
      return;
    }
    const id = await findMeliJournalFoundation(parsed.data, db);
    res.json({ ok: true, data: { journalEntryId: id ?? null } });
  } catch (error) {
    next(error);
  }
});

router.post("/reversal/lookup", async (req, res, next) => {
  try {
    const parsed = meliReversalInput.safeParse(req.body);
    if (!parsed.success) {
      next(
        AppError.badRequest(
          "Solicitud de recuperación de reversión Meli inválida"
        )
      );
      return;
    }
    const id = await findMeliPaymentReversalFoundation(parsed.data, db);
    res.json({ ok: true, data: { reversalEntryId: id ?? null } });
  } catch (error) {
    next(error);
  }
});

router.post("/reversal/source/inspect", async (req, res, next) => {
  try {
    const parsed = meliReversalSourceInput.safeParse(req.body);
    if (!parsed.success) {
      next(
        AppError.badRequest("Solicitud de revisión de reversión Meli inválida")
      );
      return;
    }
    const result = await verifyMeliReversalSourceFoundation(parsed.data, db);
    res.json({ ok: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
