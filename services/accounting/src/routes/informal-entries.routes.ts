import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { validateBody } from "../middleware/validate";
import { resolveEvent } from "../modules/chart/rules.engine";
import type { ResolvedLine } from "../modules/chart/rules.types";
import {
  callCreateInformalEntry,
  formalizarInformalEntry,
  listInformalEntries,
} from "../modules/journal/informal-entries.service";
import { AnyEventoSchema } from "../schemas/eventos.schema";
import { AppError } from "../utils/errors";

const router: ReturnType<typeof Router> = Router();

// ------------------------------------------------------------
// POST /eventos/informal
// Resuelve el evento contra las reglas y persiste en informal_entries.
// Body: mismo que POST /eventos + source_type requerido.
// ------------------------------------------------------------
router.post(
  "/eventos/informal",
  (req: Request, _res: Response, next: NextFunction): void => {
    // Stash source_type before Zod strips unknown fields
    (req as Request & { _sourceType?: string })._sourceType =
      typeof req.body?.source_type === "string"
        ? (req.body.source_type as string)
        : undefined;
    next();
  },
  validateBody(AnyEventoSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = req.body;
      const sourceType = (req as Request & { _sourceType?: string })
        ._sourceType;

      if (
        sourceType !== "NOTA_DE_VENTA" &&
        sourceType !== "FACTURA_PENDIENTE"
      ) {
        throw new AppError(
          "source_type es requerido y debe ser NOTA_DE_VENTA o FACTURA_PENDIENTE",
          400
        );
      }

      const preview = await resolveEvent(event);

      const lineas = preview.lineas.map((l: ResolvedLine) => ({
        cuentaId: l.cuentaId ?? null,
        debe: l.lado === "DEBE" ? l.monto : "0",
        haber: l.lado === "HABER" ? l.monto : "0",
        pendienteImputacion: l.cuentaId == null,
      }));

      const datos = (event as { datos: Record<string, unknown> }).datos;

      const informalEntryId = await callCreateInformalEntry({
        orgId: event.orgId,
        tipoEvento: event.tipoEvento,
        referenciaId: event.referenciaId,
        referenciaTabla: event.referenciaTabla,
        fecha: event.fecha,
        descripcion: event.descripcion,
        idempotencyKey: `INFORMAL_${event.idempotencyKey}`,
        creadoPor: (datos.usuarioId as string | undefined) ?? undefined,
        sourceType,
        lineas,
      });

      res.status(201).json({ ok: true, data: { informalEntryId } });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------
// POST /informal-entries/:id/formalizar
// Copia las líneas del asiento informal a journal_entries.
// ------------------------------------------------------------
router.post(
  "/informal-entries/:id/formalizar",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      if (!id) {
        throw new AppError("ID del asiento informal es requerido", 400);
      }

      const journalEntryId = await formalizarInformalEntry(id);

      res.status(200).json({ ok: true, data: { journalEntryId } });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------
// GET /informal-entries
// Lista asientos informales con filtros opcionales.
// Query params: org_id (requerido), estado_formalizacion, source_type, desde, hasta
// ------------------------------------------------------------
router.get(
  "/informal-entries",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { org_id, estado_formalizacion, source_type, desde, hasta } =
        req.query;

      if (!org_id || typeof org_id !== "string") {
        throw new AppError("org_id es requerido", 400);
      }

      const entries = await listInformalEntries({
        orgId: org_id,
        estadoFormalizacion:
          estado_formalizacion === "PENDIENTE" ||
          estado_formalizacion === "FORMALIZADO" ||
          estado_formalizacion === "CANCELADO"
            ? estado_formalizacion
            : undefined,
        sourceType:
          source_type === "NOTA_DE_VENTA" || source_type === "FACTURA_PENDIENTE"
            ? source_type
            : undefined,
        desde: typeof desde === "string" ? desde : undefined,
        hasta: typeof hasta === "string" ? hasta : undefined,
      });

      res.json({ ok: true, data: entries });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
