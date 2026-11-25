import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

export function getStockReadScope(
  permissions: readonly string[]
): "inventory" | "mercadolibre" | null {
  if (
    permissions.includes("organization.admin") ||
    permissions.some((permission) =>
      READ_PERMISSIONS.inventory.includes(permission)
    )
  ) {
    return "inventory";
  }
  return permissions.includes("mercadolibre.access") ? "mercadolibre" : null;
}
