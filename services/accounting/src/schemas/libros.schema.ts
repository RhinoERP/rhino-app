import { z } from "zod";

// Express query params can arrive as string | string[]; normalize to first element then validate.
const queryString = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v[0] : v));

const isoDate = queryString.pipe(
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD")
);

// ------------------------------------------------------------
// Query params compartidos por todos los libros
// ------------------------------------------------------------
export const LibroQuerySchema = z.object({
  org_id: queryString.pipe(z.string().uuid()),
  desde: isoDate,
  hasta: isoDate,
  format: z.enum(["json", "xlsx"]).default("json"),
});

export type LibroQuery = z.infer<typeof LibroQuerySchema>;

// ------------------------------------------------------------
// Libro Diario — filtros adicionales
// ------------------------------------------------------------
export const DiarioQuerySchema = LibroQuerySchema.extend({
  cuenta_id: queryString.pipe(z.string().uuid()).optional(),
  tipo_evento: queryString.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(500).default(100),
});

export type DiarioQuery = z.infer<typeof DiarioQuerySchema>;

// ------------------------------------------------------------
// Libro Mayor — requiere cuenta_id en params (no query)
// ------------------------------------------------------------
export const MayorQuerySchema = LibroQuerySchema.omit({ format: true }).extend({
  format: z.enum(["json", "xlsx"]).default("json"),
});

export type MayorQuery = z.infer<typeof MayorQuerySchema>;

// ------------------------------------------------------------
// Libro IVA — filtro de tipo
// ------------------------------------------------------------
export const IVAQuerySchema = LibroQuerySchema.extend({
  tipo: z.enum(["ventas", "compras"]).default("ventas"),
});

export type IVAQuery = z.infer<typeof IVAQuerySchema>;

// ------------------------------------------------------------
// Chart of accounts — crear y actualizar
// ------------------------------------------------------------
export const CreateCuentaSchema = z.object({
  orgId: z.string().uuid(),
  codigo: z.string().min(1).max(20),
  nombre: z.string().min(1).max(200),
  accountCode: z.string().min(1).max(50).optional(),
  tipo: z.enum(["ACTIVO", "PASIVO", "PN", "INGRESO", "EGRESO"]),
  naturaleza: z.enum(["DEUDORA", "ACREEDORA"]),
  permiteMovimientos: z.boolean().default(true),
  padreId: z.string().uuid().optional(),
});

export const UpdateCuentaSchema = CreateCuentaSchema.partial().extend({
  activa: z.boolean().optional(),
});

export type CreateCuentaInput = z.infer<typeof CreateCuentaSchema>;
export type UpdateCuentaInput = z.infer<typeof UpdateCuentaSchema>;

// ------------------------------------------------------------
// Chart of accounts — listar
// ------------------------------------------------------------
export const ListCuentasQuerySchema = z.object({
  org_id: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .transform((v) => (Array.isArray(v) ? v[0] : v)),
  solo_activas: z.enum(["true", "false"]).optional().default("true"),
});

export type ListCuentasQuery = z.infer<typeof ListCuentasQuerySchema>;
