import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client";
import { getAllOrganizations } from "@/modules/organizations/service/organizations.service";

export default async function AdminDashboardPage() {
  const organizations = await getAllOrganizations();

  return <AdminDashboardClient initialOrganizations={organizations} />;
}
