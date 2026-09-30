import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  findActiveJournalEntryIdByReference,
  getJournalEntryById,
} from "../modules/journal/journal.service";
import { AppError } from "../utils/errors";

const router: ReturnType<typeof Router> = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------------------------------
// GET /asientos/by-reference
// Asiento formal activo de un comprobante; permite recuperar el id tras
// una formalización cuyo resultado no llegó a persistirse.
// Query params: org_id, referencia_id, referencia_tabla, tipo_evento
// ------------------------------------------------------------
router.get(
  "/by-reference",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { org_id, referencia_id, referencia_tabla, tipo_evento } =
        req.query;

      if (
        !(
          typeof org_id === "string" &&
          typeof referencia_id === "string" &&
          typeof referencia_tabla === "string" &&
          typeof tipo_evento === "string"
        )
      ) {
        next(
          AppError.badRequest(
            "org_id, referencia_id, referencia_tabla y tipo_evento son requeridos"
          )
        );
        return;
      }

      if (!(UUID_RE.test(org_id) && UUID_RE.test(referencia_id))) {
        next(AppError.badRequest("org_id y referencia_id deben ser UUID"));
        return;
      }

      const id = await findActiveJournalEntryIdByReference({
        orgId: org_id,
        referenciaId: referencia_id,
        referenciaTabla: referencia_tabla,
        tipoEvento: tipo_evento,
      });

      if (!id) {
        next(AppError.notFound("Asiento no encontrado"));
        return;
      }

      res.json({ ok: true, data: { id } });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------
// GET /asientos/:id
// Retorna cabecera + líneas del asiento. Necesario para el modal
// en modo SUSPENSO (PendientesPanel) y para rollback.
// ------------------------------------------------------------
router.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const orgIdParam = req.query.org_id;
      const orgIdArrayValue = Array.isArray(orgIdParam) ? orgIdParam[0] : null;
      let orgId: string | undefined;

      if (typeof orgIdParam === "string") {
        orgId = orgIdParam;
      } else if (typeof orgIdArrayValue === "string") {
        orgId = orgIdArrayValue;
      }

      if (!id || Array.isArray(id)) {
        next(AppError.badRequest("id de asiento requerido"));
        return;
      }

      if (!orgId) {
        next(AppError.badRequest("org_id requerido"));
        return;
      }

      const entry = await getJournalEntryById(id, orgId);
      if (!entry) {
        next(AppError.notFound(`Asiento ${id} no encontrado`));
        return;
      }

      res.json({ ok: true, data: entry });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
