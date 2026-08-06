import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";

/**
 * Verifica que el usuario tenga el permiso requerido antes de ejecutar
 * la lógica de negocio. Si no lo tiene, Next.js redirige automáticamente.
 *
 * Se usa como primera línea de un server action:
 * ```ts
 * export async function createPurchaseAction(input: CreatePurchaseInput) {
 *   await ensure("purchases.manage", input.orgSlug);
 *   // ... lógica de negocio
 * }
 * ```
 */
export async function ensure(
  permission: string | string[],
  orgSlug: string
): Promise<void> {
  await guardOrganizationPermissionAccess(orgSlug, permission);
}
