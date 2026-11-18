import { z } from "zod";

const lineSchema = z.object({
  name: z.string().min(1),
  sku: z.string(),
  brand: z.string().nullable(),
  variant_name: z.string().nullable(),
  unit_of_measure: z.enum(["UN", "KG", "LT", "MT"]),
  tracks_stock_units: z.boolean(),
});
const snapshotSchema = z.object({
  meli_items: z.record(z.string(), lineSchema).optional(),
});

export function readMeliLineSnapshots(snapshot: unknown) {
  if (snapshot === null || snapshot === undefined) {
    return;
  }
  return snapshotSchema.parse(snapshot).meli_items;
}
