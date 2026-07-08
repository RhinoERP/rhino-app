import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";

/**
 * Error handler centralizado de Express.
 * Debe registrarse DESPUÉS de todos los routers con app.use(errorMiddleware).
 */
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ ok: false, error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: "Validation error",
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // Error inesperado — loguear y retornar 500 sin exponer internals
  console.error("[error]", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
}
