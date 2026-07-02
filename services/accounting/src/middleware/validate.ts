import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

/**
 * Factory que retorna un middleware Express que valida req.body contra un schema Zod.
 * En caso de error lanza al error handler centralizado (errorMiddleware).
 *
 * Uso:
 *   router.post('/eventos', validateBody(EventoVentaSchema), handler)
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Reemplazar req.body con el valor parseado/coerced por Zod
    req.body = result.data;
    next();
  };
}

/**
 * Factory que valida req.query contra un schema Zod.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
}
