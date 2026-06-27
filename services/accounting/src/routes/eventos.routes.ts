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

function isManualEvent(event: { tipoEvento: string }): boolean {
  return event.tipoEvento === "ASIENTO_MANUAL";
}

function createJournalLine(params: {
  cuentaId: string;
  lado: "DEBE" | "HABER";
  monto: string;
}) {
  const { cuentaId, lado, monto } = params;

  return {
    cuentaId,
    debe: lado === "DEBE" ? monto : "0",
    haber: lado === "HABER" ? monto : "0",
    pendienteImputacion: false,
  };
}

function createMissingAccountError(index: number, lado: "DEBE" | "HABER") {
  return new AppError(
    `Línea ${index} (${lado}) no tiene cuenta asignada. Edite la línea antes de confirmar el asiento.`,
    422
  );
}

function createManualJournalLines(lineasManuales: LineasManuales) {
  return lineasManuales.map((linea) =>
    createJournalLine({
      cuentaId: linea.cuentaId,
      lado: linea.lado,
      monto: linea.monto,
    })
  );
}

function createResolvedJournalLines(params: {
  lineas: ResolvedLine[];
  lineasEditadas: LineasEditadas;
}) {
  const { lineas, lineasEditadas } = params;

  return lineas.map((linea, index) => {
    const override = lineasEditadas.find(
      (editedLine) => editedLine.index === index
    );
    const cuentaId = override?.cuentaId ?? linea.cuentaId;
    const monto = override?.monto ?? linea.monto;

    if (!cuentaId) {
      throw createMissingAccountError(index, linea.lado);
    }

    return createJournalLine({
      cuentaId,
      lado: linea.lado,
      monto,
    });
  });
}

async function buildJournalLines(params: {
  event: Request["body"];
  lineasEditadas: LineasEditadas;
  lineasManuales: LineasManuales;
}) {
  const { event, lineasEditadas, lineasManuales } = params;

  if (isManualEvent(event)) {
    const lineas = createManualJournalLines(lineasManuales);

    if (lineas.length === 0) {
      throw new AppError(
        "El asiento manual debe incluir al menos una línea contable.",
        422
      );
    }

    return lineas;
  }

  const resolvedEvent = await resolveEvent(event);

  return [
    ...createResolvedJournalLines({
      lineas: resolvedEvent.lineas,
      lineasEditadas,
    }),
    ...createManualJournalLines(lineasManuales),
  ];
}

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
      const lineas = await buildJournalLines({
        event,
        lineasEditadas,
        lineasManuales,
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
