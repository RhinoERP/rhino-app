import type { ReactNode } from "react";
import { FinanzasNav } from "@/components/finances/shared/finanzas-nav";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";

type FinanzasLayoutProps = {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
};

export default async function FinanzasLayout({
  children,
  params,
}: FinanzasLayoutProps) {
  const { orgSlug } = await params;
  await guardOrganizationPermissionAccess(orgSlug, READ_PERMISSIONS.finances);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Finanzas</h1>
          <p className="text-muted-foreground text-sm">
            Seguimiento financiero del establecimiento.
          </p>
        </div>
        <FinanzasNav orgSlug={orgSlug} />
      </div>

      {children}
    </div>
  );
}
