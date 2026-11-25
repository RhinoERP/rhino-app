import { z } from "zod";
import type { Database } from "@/types/supabase";

export type ManagedWarehouse =
  Database["public"]["Tables"]["warehouses"]["Row"];

export type WarehouseAssignmentMember = {
  userId: string;
  name: string;
  email: string | null;
  roleName: string;
  hasAllAccess: boolean;
  warehouseIds: string[];
};

export type WarehouseAdministrationData = {
  warehouses: ManagedWarehouse[];
  members: WarehouseAssignmentMember[];
};

export const warehouseFormSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio"),
    code: z.string().trim(),
    isActive: z.boolean(),
    wholesaleEnabled: z.boolean(),
    directSaleEnabled: z.boolean(),
  })
  .refine((values) => values.wholesaleEnabled || values.directSaleEnabled, {
    path: ["wholesaleEnabled"],
    message: "Habilitá al menos un canal de venta",
  });

export type WarehouseFormValues = z.infer<typeof warehouseFormSchema>;

export const saveWarehouseSchema = warehouseFormSchema.and(
  z.object({
    orgSlug: z.string().trim().min(1),
    warehouseId: z.uuid().optional(),
  })
);
export type SaveWarehouseInput = z.infer<typeof saveWarehouseSchema>;

export const warehouseAssignmentsFormSchema = z.object({
  warehouseIds: z
    .array(z.uuid())
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Hay depósitos repetidos en la selección"
    ),
});
export type WarehouseAssignmentsValues = z.infer<
  typeof warehouseAssignmentsFormSchema
>;

export const replaceWarehouseAssignmentsSchema =
  warehouseAssignmentsFormSchema.and(
    z.object({
      orgSlug: z.string().trim().min(1),
      userId: z.uuid(),
    })
  );
export type ReplaceWarehouseAssignmentsInput = z.infer<
  typeof replaceWarehouseAssignmentsSchema
>;
