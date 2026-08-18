import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

/**
 * Permisos suficientes para LEER información de cobranzas.
 * Incluye los tres niveles: ver propias, ver todas y gestionar.
 */
export const COLLECTIONS_READ_PERMISSIONS = READ_PERMISSIONS.collections;

export async function ensureCollectionsRead(orgSlug: string): Promise<void> {
  await ensure(COLLECTIONS_READ_PERMISSIONS, orgSlug);
}
