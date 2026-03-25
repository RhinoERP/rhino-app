import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type { Organization } from "@/modules/organizations/types";
import { ArcaAuthorizationError, ArcaValidationError } from "../errors";

export type OrganizationArcaAccess = Pick<
  Organization,
  "id" | "name" | "slug" | "cuit"
>;

export type OrganizationArcaUserAccess = {
  organization: OrganizationArcaAccess;
  userId: string;
  isOwner: boolean;
  canManage: boolean;
  permissions: string[];
};

export async function getCurrentUserOrganizationArcaAccess(
  orgSlug: string
): Promise<OrganizationArcaUserAccess> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (!userId) {
    throw new ArcaAuthorizationError(
      "Debés iniciar sesión para administrar ARCA."
    );
  }

  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization?.id) {
    throw new ArcaValidationError("Organización no encontrada.");
  }

  const [{ data: membership, error: membershipError }, permissionsResult] =
    await Promise.all([
      supabase
        .from("organization_members")
        .select("is_active, is_owner")
        .eq("organization_id", organization.id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.rpc("get_user_org_permissions_by_slug", {
        target_org_slug: orgSlug,
      }),
    ]);

  if (membershipError) {
    throw new ArcaAuthorizationError(
      "No se pudo verificar tu acceso a la organización."
    );
  }

  if (!membership?.is_active) {
    throw new ArcaAuthorizationError(
      "No tenés acceso activo a esta organización."
    );
  }

  const permissions = permissionsResult.error
    ? []
    : ((permissionsResult.data ?? []) as string[]);

  if (!(membership.is_owner || permissions.includes("organization.admin"))) {
    return {
      organization,
      userId,
      isOwner: membership.is_owner,
      canManage: false,
      permissions,
    };
  }

  return {
    organization,
    userId,
    isOwner: membership.is_owner,
    canManage: true,
    permissions,
  };
}

export async function assertCanManageOrganizationArca(
  orgSlug: string
): Promise<OrganizationArcaAccess> {
  const access = await getCurrentUserOrganizationArcaAccess(orgSlug);

  if (!access.canManage) {
    throw new ArcaAuthorizationError(
      "Necesitás permisos de administrador para gestionar ARCA."
    );
  }

  return access.organization;
}
