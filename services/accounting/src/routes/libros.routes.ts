import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  exportDiarioExcel,
  queryDiario,
} from "../modules/libros/diario.service";
import {
  exportIIBBExcel,
  queryLibroIIBB,
} from "../modules/libros/iibb.service";
import { exportIVAExcel, queryLibroIVA } from "../modules/libros/iva.service";
import { exportMayorExcel, queryMayor } from "../modules/libros/mayor.service";
import {
  DiarioQuerySchema,
  IVAQuerySchema,
  LibroQuerySchema,
  MayorQuerySchema,
} from "../schemas/libros.schema";
import { AppError } from "../utils/errors";

const router: ReturnType<typeof Router> = Router();

// ------------------------------------------------------------
// GET /diario?org_id=&desde=&hasta=&page=&page_size=&format=
// ------------------------------------------------------------
router.get(
  "/diario",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = DiarioQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        next(
          new AppError(JSON.stringify(parsed.error.flatten().fieldErrors), 400)
        );
        return;
      }

      if (parsed.data.format === "xlsx") {
        const buffer = await exportDiarioExcel(parsed.data);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="libro-diario-${parsed.data.desde}-${parsed.data.hasta}.xlsx"`
        );
        res.send(buffer);
        return;
      }

      const result = await queryDiario(parsed.data);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------
// GET /mayor/:cuentaId?org_id=&desde=&hasta=&format=
// ------------------------------------------------------------
router.get(
  "/mayor/:cuentaId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cuentaId: rawCuentaId } = req.params;
      const cuentaId = Array.isArray(rawCuentaId)
        ? rawCuentaId[0]
        : rawCuentaId;
      if (!cuentaId) {
        next(AppError.badRequest("cuentaId requerido"));
        return;
      }

      const parsed = MayorQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        next(
          new AppError(JSON.stringify(parsed.error.flatten().fieldErrors), 400)
        );
        return;
      }

      if (parsed.data.format === "xlsx") {
        const buffer = await exportMayorExcel(cuentaId, parsed.data);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="libro-mayor-${cuentaId}.xlsx"`
        );
        res.send(buffer);
        return;
      }

      const result = await queryMayor(cuentaId, parsed.data);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------
// GET /libros/iva?org_id=&desde=&hasta=&tipo=&format=
// Cuando format=xlsx retorna ambas sheets (ventas + compras)
// ------------------------------------------------------------
router.get(
  "/libros/iva",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = IVAQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        next(
          new AppError(JSON.stringify(parsed.error.flatten().fieldErrors), 400)
        );
        return;
      }

      if (parsed.data.format === "xlsx") {
        const buffer = await exportIVAExcel(parsed.data);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="libro-iva-${parsed.data.desde}-${parsed.data.hasta}.xlsx"`
        );
        res.send(buffer);
        return;
      }

      const result = await queryLibroIVA(parsed.data);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------
// GET /libros/iibb?org_id=&desde=&hasta=&format=
// ------------------------------------------------------------
router.get(
  "/libros/iibb",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = LibroQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        next(
          new AppError(JSON.stringify(parsed.error.flatten().fieldErrors), 400)
        );
        return;
      }

      if (parsed.data.format === "xlsx") {
        const buffer = await exportIIBBExcel(parsed.data);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="libro-iibb-${parsed.data.desde}-${parsed.data.hasta}.xlsx"`
        );
        res.send(buffer);
        return;
      }

      const result = await queryLibroIIBB(parsed.data);
      res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
