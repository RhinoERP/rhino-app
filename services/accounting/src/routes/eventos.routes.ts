import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { validateBody } from "../middleware/validate";
import { resolveAccountCode } from "../modules/accounts/accounts.queries";
import { resolveEvent } from "../modules/chart/rules.engine";
import type { ResolvedLine } from "../modules/chart/rules.types";
import { callCreateJournalEntry } from "../modules/journal/journal.service";
import { AnyEventoSchema } from "../schemas/eventos.schema";
import { AppError } from "../utils/errors";

type LineasAsignadas = Array<{ index: number; cuentaId: string }>;
const lineasStore = new WeakMap<Request, LineasAsignadas>();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router: ReturnType<typeof Router> = Router();

// ------------------------------------------------------------
// POST /preview
// Resuelve el evento contra las reglas y retorna el asiento
// previsualizad sin persistir nada.
// ------------------------------------------------------------
router.post(
  "/preview",
  validateBody(AnyEventoSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const preview = await resolveEvent(req.body);
      res.json({ ok: true, data: preview });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------
// POST /eventos
// Valida, resuelve y persiste el asiento via PL/pgSQL.
// Idempotente: misma idempotencyKey retorna el mismo asientoId.
// Body puede incluir lineasAsignadas para sobreescribir cuentas
// seleccionables/suspenso antes de persistir.
// ------------------------------------------------------------
router.post(
  "/eventos",
  // Stash lineasAsignadas BEFORE validateBody — Zod strips unknown fields from req.body
  (req: Request, _res: Response, next: NextFunction): void => {
    lineasStore.set(
      req,
      Array.isArray(req.body?.lineasAsignadas)
        ? (req.body.lineasAsignadas as LineasAsignadas)
        : []
    );
    next();
  },
  validateBody(AnyEventoSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = req.body;
      const preview = await resolveEvent(event);

      // Permitir que el cliente sobreescriba cuentas seleccionables
      // enviando { lineasAsignadas: [{ index: number, cuentaId: string }] }
      // cuentaId puede ser un UUID o un accountCode semántico (ej: 'CAJA_PESOS')
      const lineasAsignadasRaw: LineasAsignadas = lineasStore.get(req) ?? [];

      // Resolver accountCodes semánticos → UUID cuando sea necesario
      const lineasAsignadas = await Promise.all(
        lineasAsignadasRaw.map(async (a) => {
          if (UUID_RE.test(a.cuentaId)) {
            return a;
          }
          const resolved = await resolveAccountCode(a.cuentaId, event.orgId);
          return { index: a.index, cuentaId: resolved ?? a.cuentaId };
        })
      );

      const lineas = preview.lineas.map((l: ResolvedLine, idx: number) => {
        const override = lineasAsignadas.find((a) => a.index === idx);
        const cuentaId = override ? override.cuentaId : l.cuentaId;
        if (!cuentaId) {
          throw new AppError(
            `Línea ${idx} (${l.lado}) no tiene cuenta asignada. Las líneas seleccionables requieren que se envíe lineasAsignadas con el índice correspondiente.`,
            422
          );
        }
        return {
          cuentaId,
          debe: l.lado === "DEBE" ? l.monto : "0",
          haber: l.lado === "HABER" ? l.monto : "0",
          pendienteImputacion: false,
        };
      });

      const datos = (event as { datos: Record<string, unknown> }).datos;

      const asientoId = await callCreateJournalEntry({
        orgId: event.orgId,
        tipoEvento: event.tipoEvento,
        referenciaId: event.referenciaId,
        referenciaTabla: event.referenciaTabla,
        fecha: event.fecha,
        descripcion: event.descripcion,
        idempotencyKey: event.idempotencyKey,
        creadoPor: (datos.usuarioId as string | undefined) ?? undefined,
        lineas,
      });

      res.status(201).json({ ok: true, data: { asientoId } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
