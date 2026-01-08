import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SellerMobileHome } from "@/components/mobile/seller-home";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";

type OrganizationPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

// Mobile device regex pattern
const MOBILE_USER_AGENT_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export default async function OrganizationPage({
  params,
}: OrganizationPageProps) {
  const { orgSlug } = await params;

  // Get user permissions to determine the first accessible page
  const layoutData = await getOrganizationLayoutData(orgSlug);

  if (!layoutData) {
    redirect("/");
  }

  const { permissions, user } = layoutData;

  // Check if request is from mobile device
  const headersList = await headers();
  const userAgent = headersList.get("user-agent") || "";
  const isMobileDevice = MOBILE_USER_AGENT_REGEX.test(userAgent);

  // On mobile, show the seller home page instead of redirecting
  if (isMobileDevice) {
    return (
      <SellerMobileHome
        orgSlug={orgSlug}
        userName={user?.user_metadata?.full_name as string | undefined}
      />
    );
  }

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
