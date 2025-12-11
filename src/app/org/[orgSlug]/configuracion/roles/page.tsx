import {
  getAllPermissions,
  getOrganizationRolesBySlug,
} from "@/modules/organizations/service/roles.service";
import { RolesDataTable } from "./data-table";

type RolesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function RolesPage({ params }: RolesPageProps) {
  const { orgSlug } = await params;
  const [roles, permissions] = await Promise.all([
    getOrganizationRolesBySlug(orgSlug),
    getAllPermissions(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Roles</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona los roles y permisos de tu organización.
          </p>
        </div>
      </div>

      <RolesDataTable
        data={roles}
        orgSlug={orgSlug}
        permissions={permissions}
      />
    </div>
  );
}
