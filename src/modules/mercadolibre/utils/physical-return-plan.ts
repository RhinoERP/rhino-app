import { z } from "zod";
import { truncateToDecimals } from "@/lib/decimal";

const MAX_QUANTITY = 9_007_199_254;
const quantity = z
  .number()
  .finite()
  .nonnegative()
  .max(MAX_QUANTITY)
  .refine(
    (value) => truncateToDecimals(value, 6) === value,
    "La cantidad admite hasta seis decimales."
  );
const units = z.number().int().nonnegative().max(MAX_QUANTITY);

export const createMeliPhysicalReturnSchema = z
  .object({
    saleId: z.uuid(),
    idempotencyKey: z.uuid(),
    returnDate: z.iso.date(),
    reason: z.string().trim().min(5).max(500),
    allowDefaultFallback: z.boolean().default(false),
    items: z
      .array(
        z
          .object({
            sourceMovementId: z.uuid(),
            quantity,
            unitQuantity: units.default(0),
            restock: z.boolean(),
          })
          .strict()
          .refine(
            (item) => item.quantity > 0 || item.unitQuantity > 0,
            "Indicá la mercadería efectivamente recibida."
          )
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((input, context) => {
    const unique = new Set(
      input.items.map((item) => item.sourceMovementId.toLowerCase())
    );
    if (unique.size !== input.items.length) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message:
          "Una salida original no puede repetirse en la misma devolución.",
      });
    }
  });

export type MeliPhysicalReturnInput = z.input<
  typeof createMeliPhysicalReturnSchema
>;
export type MeliReturnOrigin = {
  movementId: string;
  saleId: string;
  quantity: number;
  /** Signed pieces from the immutable OUTBOUND; null means no piece tracking. */
  unitQuantity: number | null;
  returnedQuantity: number;
  returnedUnits: number;
};

function stockTicks(value: number) {
  const parsed = quantity.parse(value);
  const ticks = Number(parsed.toFixed(6).replace(".", ""));
  if (!Number.isSafeInteger(ticks)) {
    throw new Error("La cantidad supera la precisión de stock admitida.");
  }
  return ticks;
}

function remainingOriginStock(origin: MeliReturnOrigin) {
  if (origin.quantity <= 0) {
    throw new Error(
      "La salida original no tiene una cantidad de stock válida."
    );
  }
  const remaining =
    stockTicks(origin.quantity) - stockTicks(origin.returnedQuantity);
  const originalUnits = origin.unitQuantity === null ? 0 : -origin.unitQuantity;
  const remainingUnits =
    units.parse(originalUnits) - units.parse(origin.returnedUnits);
  if (remaining < 0 || remainingUnits < 0) {
    throw new Error(
      "El historial de devoluciones supera la salida original. Revisá el origen."
    );
  }
  return { remaining, remainingUnits };
}

export function sumMeliReturnQuantities(values: number[]) {
  const ticks = values.reduce((total, value) => total + stockTicks(value), 0);
  if (!Number.isSafeInteger(ticks)) {
    throw new Error(
      "La cantidad acumulada supera la precisión de stock admitida."
    );
  }
  return ticks / 1_000_000;
}

export function getMeliReturnAvailability(origin: MeliReturnOrigin) {
  const { remaining, remainingUnits } = remainingOriginStock(origin);
  return { quantity: remaining / 1_000_000, unitQuantity: remainingUnits };
}

/** Serialize the validated intent for atomic commit/replay, without re-reading availability. */
export function serializeMeliPhysicalReturn(
  input: z.output<typeof createMeliPhysicalReturnSchema>
) {
  return {
    sales_order_id: input.saleId.toLowerCase(),
    return_date: input.returnDate,
    reason: input.reason,
    allow_default_fallback: input.allowDefaultFallback,
    items: input.items
      .map((item) => ({
        source_movement_id: item.sourceMovementId.toLowerCase(),
        quantity: item.quantity,
        unit_quantity: item.unitQuantity,
        restock: item.restock,
      }))
      .sort((left, right) =>
        left.source_movement_id.localeCompare(right.source_movement_id)
      ),
  };
}

/** Preview only. The database revalidates cumulative quantities under the source-sale lock. */
export function buildMeliPhysicalReturnPlan(
  raw: MeliPhysicalReturnInput,
  origins: MeliReturnOrigin[]
) {
  const input = createMeliPhysicalReturnSchema.parse(raw);
  const byId = new Map(
    origins.map((origin) => [origin.movementId.toLowerCase(), origin])
  );
  if (byId.size !== origins.length) {
    throw new Error("La consulta de orígenes devolvió salidas repetidas.");
  }
  for (const item of input.items) {
    const origin = byId.get(item.sourceMovementId.toLowerCase());
    if (!origin || origin.saleId.toLowerCase() !== input.saleId.toLowerCase()) {
      throw new Error("La salida original no pertenece a esta venta Meli.");
    }
    const { remaining, remainingUnits } = remainingOriginStock(origin);
    if (origin.unitQuantity === null && item.unitQuantity !== 0) {
      throw new Error("La salida original no registra piezas por separado.");
    }
    if (
      stockTicks(item.quantity) > remaining ||
      item.unitQuantity > remainingUnits
    ) {
      throw new Error(
        "La devolución supera la mercadería pendiente de recibir de esa salida."
      );
    }
  }
  return serializeMeliPhysicalReturn(input);
}
