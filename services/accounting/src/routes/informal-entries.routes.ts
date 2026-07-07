import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { validateBody } from "../middleware/validate";
import { resolveAccountCode } from "../modules/accounts/accounts.queries";
import { resolveEvent } from "../modules/chart/rules.engine";
import type { ResolvedLine } from "../modules/chart/rules.types";
import {
  asentarInformalEntry,
  callCreateInformalEntry,
  cancelInformalEntry,
  formalizarInformalEntry,
  getInformalEntryById,
  listInformalEntries,
} from "../modules/journal/informal-entries.service";
import { AnyEventoSchema } from "../schemas/eventos.schema";
import { AppError } from "../utils/errors";

const router: ReturnType<typeof Router> = Router();
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

const VALID_SOURCE_TYPES = [
  "NOTA_DE_VENTA",
  "FACTURA_PENDIENTE",
  "COBRO",
  "ORDEN_PAGO",
  "COMPRA",
  "NOTA_DE_CREDITO",
] as const;
type ValidSourceType = (typeof VALID_SOURCE_TYPES)[number];
function isValidSourceType(v: string): v is ValidSourceType {
  return (VALID_SOURCE_TYPES as readonly string[]).includes(v);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getOrgIdFromQuery(req: Request): string {
  const orgIdParam = req.query.org_id;
  let orgId: string | undefined;

  if (typeof orgIdParam === "string") {
    orgId = orgIdParam;
  } else if (Array.isArray(orgIdParam) && typeof orgIdParam[0] === "string") {
    orgId = orgIdParam[0];
  }

  if (!orgId) {
    throw new AppError("org_id es requerido", 400);
  }

  return orgId;
}

async function resolveAccountCodeOrId(cuentaId: string, orgId: string) {
  if (UUID_RE.test(cuentaId)) {
    return cuentaId;
  }

  const resolved = await resolveAccountCode(cuentaId, orgId);
  return resolved ?? cuentaId;
}

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
      const sourceType = (req as Request & { _sourceType?: string })
        ._sourceType;

      if (!(sourceType && isValidSourceType(sourceType))) {
        throw new AppError(
          `source_type es requerido y debe ser uno de: ${VALID_SOURCE_TYPES.join(", ")}.`,
          400
        );
      }

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

        return {
          cuentaId: cuentaId ?? null,
          debe: l.lado === "DEBE" ? monto : "0",
          haber: l.lado === "HABER" ? monto : "0",
        };
      });

      for (const linea of lineasManuales) {
        lineas.push({
          cuentaId: linea.cuentaId,
          debe: linea.lado === "DEBE" ? linea.monto : "0",
          haber: linea.lado === "HABER" ? linea.monto : "0",
        });
      }

      // Rechazar asientos con líneas sin cuenta asignada.
      const hasMissingAccount = lineas.some((l) => !l.cuentaId);
      if (hasMissingAccount) {
        throw new AppError(
          "El asiento informal tiene líneas sin cuenta asignada. Completá la asignación antes de guardar.",
          422
        );
      }

      const lineasCompletas = lineas as Array<{
        cuentaId: string;
        debe: string;
        haber: string;
      }>;

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
        lineas: lineasCompletas,
      });

      res.status(201).json({ ok: true, data: { informalEntryId } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/informal-entries/:id/cancelar",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getOrgIdFromQuery(req);
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      if (!id) {
        throw new AppError("ID del asiento informal es requerido", 400);
      }

      await cancelInformalEntry(id, orgId);

      res.status(200).json({ ok: true, data: { informalEntryId: id } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/informal-entries/:id/asentar",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getOrgIdFromQuery(req);
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      if (!id) {
        throw new AppError("ID del asiento informal es requerido", 400);
      }

      await asentarInformalEntry(id, orgId);

      res.status(200).json({ ok: true, data: { informalEntryId: id } });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------
// POST /informal-entries/:id/formalizar
// Mueve las líneas del asiento informal a journal_entries.
// ------------------------------------------------------------
router.post(
  "/informal-entries/:id/formalizar",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = getOrgIdFromQuery(req);
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      if (!id) {
        throw new AppError("ID del asiento informal es requerido", 400);
      }

      const lineasEditadasRaw = Array.isArray(req.body?.lineasEditadas)
        ? (req.body.lineasEditadas as LineasEditadas)
        : [];
      const lineasManualesRaw = Array.isArray(req.body?.lineasManuales)
        ? (req.body.lineasManuales as LineasManuales)
        : [];
      const entry = await getInformalEntryById(id, orgId);

      if (!entry) {
        throw new AppError("Asiento informal no encontrado", 404);
      }

      const lineasEditadas = await Promise.all(
        lineasEditadasRaw.map(async (linea) => ({
          ...linea,
          cuentaId: linea.cuentaId
            ? await resolveAccountCodeOrId(linea.cuentaId, entry.org_id)
            : undefined,
        }))
      );
      const lineasManuales = await Promise.all(
        lineasManualesRaw.map(async (linea) => ({
          ...linea,
          cuentaId: await resolveAccountCodeOrId(linea.cuentaId, entry.org_id),
        }))
      );

      const journalEntryId = await formalizarInformalEntry(id, orgId, {
        lineasEditadas,
        lineasManuales,
      });

      res.status(200).json({ ok: true, data: { journalEntryId } });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------
// GET /informal-entries/:id
// Obtiene un asiento informal con sus líneas.
// Query params: org_id (requerido para validar pertenencia)
// ------------------------------------------------------------
router.get(
  "/informal-entries/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const { org_id } = req.query;

      if (!id) {
        throw new AppError("ID del asiento informal es requerido", 400);
      }

      if (!org_id || typeof org_id !== "string") {
        throw new AppError("org_id es requerido", 400);
      }

      const entry = await getInformalEntryById(id, org_id);

      if (!entry) {
        throw new AppError("Asiento informal no encontrado", 404);
      }

      res.json({ ok: true, data: entry });
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
          estado_formalizacion === "CANCELADO" ||
          estado_formalizacion === "ASENTADO"
            ? estado_formalizacion
            : undefined,
        sourceType:
          source_type === "NOTA_DE_VENTA" ||
          source_type === "FACTURA_PENDIENTE" ||
          source_type === "COBRO" ||
          source_type === "ORDEN_PAGO" ||
          source_type === "COMPRA" ||
          source_type === "NOTA_DE_CREDITO"
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
