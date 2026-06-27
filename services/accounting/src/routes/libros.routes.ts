import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  exportDiario,
  exportDiarioExcel,
  queryDiario,
} from "../modules/libros/diario.service";
import {
  exportIIBB,
  exportIIBBExcel,
  queryLibroIIBB,
} from "../modules/libros/iibb.service";
import {
  exportIVA,
  exportIVAExcel,
  queryLibroIVA,
} from "../modules/libros/iva.service";
import {
  exportMayor,
  exportMayorExcel,
  queryMayor,
} from "../modules/libros/mayor.service";
import {
  DiarioQuerySchema,
  IVAQuerySchema,
  type LibroExportFormat,
  LibroQuerySchema,
  MayorQuerySchema,
} from "../schemas/libros.schema";
import { AppError } from "../utils/errors";

const router: ReturnType<typeof Router> = Router();

function sendExportResponse(
  res: Response,
  buffer: Buffer,
  fileName: string,
  format: Exclude<LibroExportFormat, "json">
): void {
  let contentType = "text/plain; charset=utf-8";

  if (format === "xlsx") {
    contentType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else if (format === "csv") {
    contentType = "text/csv; charset=utf-8";
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(buffer);
}

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

      if (parsed.data.format !== "json") {
        const buffer =
          parsed.data.format === "xlsx"
            ? await exportDiarioExcel(parsed.data)
            : await exportDiario(parsed.data, parsed.data.format);

        sendExportResponse(
          res,
          buffer,
          `libro-diario-${parsed.data.desde}-${parsed.data.hasta}.${parsed.data.format}`,
          parsed.data.format
        );
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

      if (parsed.data.format !== "json") {
        const buffer =
          parsed.data.format === "xlsx"
            ? await exportMayorExcel(cuentaId, parsed.data)
            : await exportMayor(cuentaId, parsed.data, parsed.data.format);

        sendExportResponse(
          res,
          buffer,
          `libro-mayor-${cuentaId}.${parsed.data.format}`,
          parsed.data.format
        );
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

      if (parsed.data.format !== "json") {
        const buffer =
          parsed.data.format === "xlsx"
            ? await exportIVAExcel(parsed.data)
            : await exportIVA(parsed.data, parsed.data.format);

        sendExportResponse(
          res,
          buffer,
          `libro-iva-${parsed.data.tipo}-${parsed.data.desde}-${parsed.data.hasta}.${parsed.data.format}`,
          parsed.data.format
        );
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

      if (parsed.data.format !== "json") {
        const buffer =
          parsed.data.format === "xlsx"
            ? await exportIIBBExcel(parsed.data)
            : await exportIIBB(parsed.data, parsed.data.format);

        sendExportResponse(
          res,
          buffer,
          `libro-iibb-${parsed.data.desde}-${parsed.data.hasta}.${parsed.data.format}`,
          parsed.data.format
        );
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
