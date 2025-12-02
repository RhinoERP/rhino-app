import { getOrganizationRolesBySlug } from "@/modules/organizations/service/roles.service";
import { columns } from "./columns";
import { DataTable } from "./data-table";

type RolesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function RolesPage({ params }: RolesPageProps) {
  const { orgSlug } = await params;
  const roles = await getOrganizationRolesBySlug(orgSlug);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Roles</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona los roles y permisos de tu organización.
          </p>
        </div>
      </div>

      <DataTable columns={columns} data={roles} />
    </div>
  );
}
