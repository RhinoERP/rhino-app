import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { getJournalEntryById } from "../modules/journal/journal.service";
import { AppError } from "../utils/errors";

const router: ReturnType<typeof Router> = Router();

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
      if (!id || Array.isArray(id)) {
        next(AppError.badRequest("id de asiento requerido"));
        return;
      }

      const entry = await getJournalEntryById(id);
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
