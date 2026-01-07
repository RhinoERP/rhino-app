import { redirect } from "next/navigation";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";

type OrganizationPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function OrganizationPage({
  params,
}: OrganizationPageProps) {
  const { orgSlug } = await params;

  // Get user permissions to determine the first accessible page
  const layoutData = await getOrganizationLayoutData(orgSlug);

  if (!layoutData) {
    redirect("/");
  }

  const { permissions } = layoutData;

  // Helper to check if user has permission
  const can = (permission: string) => permissions.includes(permission);

  // Define navigation items in order of priority
  const navRoutes = [
    {
      path: `/org/${orgSlug}/torre-de-control`,
      requiredPermission: undefined, // Torre de Control is always accessible
    },
    {
      path: `/org/${orgSlug}/stock`,
      requiredPermission: undefined,
    },
    {
      path: `/org/${orgSlug}/clientes`,
      requiredPermission: "customers.read",
    },
    {
      path: `/org/${orgSlug}/ventas`,
      requiredPermission: undefined,
    },
    {
      path: `/org/${orgSlug}/cobranzas`,
      requiredPermission: undefined,
    },
    {
      path: `/org/${orgSlug}/proveedores`,
      requiredPermission: "suppliers.read",
    },
    {
      path: `/org/${orgSlug}/compras`,
      requiredPermission: undefined,
    },
    {
      path: `/org/${orgSlug}/precios/listas-de-precios`,
      requiredPermission: undefined,
    },
  ];

  // Find the first accessible route
  const firstAccessibleRoute = navRoutes.find((route) => {
    if (!route.requiredPermission) {
      return true;
    }
    return can(route.requiredPermission);
  });

  // Redirect to the first accessible route (defaults to Torre de Control)
  redirect(firstAccessibleRoute?.path ?? `/org/${orgSlug}/torre-de-control`);
}
