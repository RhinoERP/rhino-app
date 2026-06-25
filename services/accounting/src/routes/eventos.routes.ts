import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { validateBody } from "../middleware/validate";
import { resolveAccountCode } from "../modules/accounts/accounts.queries";
import { resolveEvent } from "../modules/chart/rules.engine";
import type { ResolvedLine } from "../modules/chart/rules.types";
import { callCreateJournalEntry } from "../modules/journal/journal.service";
import { AnyEventoSchema } from "../schemas/eventos.schema";
import { AppError } from "../utils/errors";

type LineasEditadas = Array<{
  index: number;
  cuentaId?: string;
  monto?: string;
}>;
type LineasManuales = Array<{
  lado: "DEBE" | "HABER";
  cuentaId: string;
  monto: string;
}>;
const lineasEditadasStore = new WeakMap<Request, LineasEditadas>();
const lineasManualesStore = new WeakMap<Request, LineasManuales>();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveAccountCodeOrId(cuentaId: string, orgId: string) {
  if (UUID_RE.test(cuentaId)) {
    return cuentaId;
  }

  const resolved = await resolveAccountCode(cuentaId, orgId);
  return resolved ?? cuentaId;
}

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
// Body puede incluir lineasEditadas y lineasManuales.
// ------------------------------------------------------------
router.post(
  "/eventos",
  // Stash line edits BEFORE validateBody — Zod strips unknown fields from req.body
  (req: Request, _res: Response, next: NextFunction): void => {
    lineasEditadasStore.set(
      req,
      Array.isArray(req.body?.lineasEditadas)
        ? (req.body.lineasEditadas as LineasEditadas)
        : []
    );
    lineasManualesStore.set(
      req,
      Array.isArray(req.body?.lineasManuales)
        ? (req.body.lineasManuales as LineasManuales)
        : []
    );
    next();
  },
  validateBody(AnyEventoSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = req.body;
      const preview = await resolveEvent(event);
      const lineasEditadasRaw = lineasEditadasStore.get(req) ?? [];
      const lineasManualesRaw = lineasManualesStore.get(req) ?? [];
      const lineasEditadas = await Promise.all(
        lineasEditadasRaw.map(async (linea) => ({
          ...linea,
          cuentaId: linea.cuentaId
            ? await resolveAccountCodeOrId(linea.cuentaId, event.orgId)
            : undefined,
        }))
      );
      const lineasManuales = await Promise.all(
        lineasManualesRaw.map(async (linea) => ({
          ...linea,
          cuentaId: await resolveAccountCodeOrId(linea.cuentaId, event.orgId),
        }))
      );

      const lineas = preview.lineas.map((l: ResolvedLine, idx: number) => {
        const override = lineasEditadas.find((linea) => linea.index === idx);
        const cuentaId = override?.cuentaId ?? l.cuentaId;
        const monto = override?.monto ?? l.monto;

        if (!cuentaId) {
          throw new AppError(
            `Línea ${idx} (${l.lado}) no tiene cuenta asignada. Edite la línea antes de confirmar el asiento.`,
            422
          );
        }

        return {
          cuentaId,
          debe: l.lado === "DEBE" ? monto : "0",
          haber: l.lado === "HABER" ? monto : "0",
          pendienteImputacion: false,
        };
      });

      for (const linea of lineasManuales) {
        lineas.push({
          cuentaId: linea.cuentaId,
          debe: linea.lado === "DEBE" ? linea.monto : "0",
          haber: linea.lado === "HABER" ? linea.monto : "0",
          pendienteImputacion: false,
        });
      }

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
