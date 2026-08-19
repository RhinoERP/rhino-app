import { ensure } from "@/modules/organizations/utils/with-permission-guard";

/**
 * Permisos suficientes para LEER información de cobranzas.
 * Incluye los tres niveles: ver propias, ver todas y gestionar.
 */
export const COLLECTIONS_READ_PERMISSIONS = [
  "collections.read",
  "collections.read.all",
  "collections.manage",
];

export async function ensureCollectionsRead(orgSlug: string): Promise<void> {
  await ensure(COLLECTIONS_READ_PERMISSIONS, orgSlug);
}
