import type { ReactNode } from "react";
import { TesoreriaNav } from "@/components/tesoreria/shared/tesoreria-nav";
import { guardOrganizationPermissionAccess } from "@/modules/organizations/service/module-access.service";

type Props = {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
};

export default async function TesoreriaLayout({ children, params }: Props) {
  const { orgSlug } = await params;
  await guardOrganizationPermissionAccess(orgSlug, "finances.read");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Tesorería</h1>
          <p className="text-muted-foreground text-sm">
            Control bancario, movimientos y gestión de cheques propios.
          </p>
        </div>
        <TesoreriaNav orgSlug={orgSlug} />
      </div>
      {children}
    </div>
  );
}
