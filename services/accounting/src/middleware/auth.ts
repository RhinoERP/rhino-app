import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors";

/**
 * Verifica el header X-Service-Token usando comparación en tiempo constante.
 * Previene timing attacks al comparar hashes SHA-256 en lugar de strings directos.
 *
 * El token lo inyecta el proxy del monolito (src/app/api/contabilidad/[...route]/route.ts).
 * Nunca llega al browser.
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = req.headers["x-service-token"];

  if (!process.env.SERVICE_TOKEN) {
    next(new AppError("SERVICE_TOKEN not configured", 500));
    return;
  }

  if (!token || typeof token !== "string") {
    next(AppError.unauthorized());
    return;
  }

  // Hash ambos tokens para garantizar buffers del mismo largo antes del timingSafeEqual
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(process.env.SERVICE_TOKEN).digest();

  if (!timingSafeEqual(a, b)) {
    next(AppError.unauthorized());
    return;
  }

  next();
}
