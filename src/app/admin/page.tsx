import { AdminDashboardClient } from "@/components/admin/admin-dashboard-client";
import {
  getAllOrganizations,
  getTotalUniqueUsers,
} from "@/modules/organizations/service/organizations.service";

export default async function AdminDashboardPage() {
  const [organizations, totalUsers] = await Promise.all([
    getAllOrganizations(),
    getTotalUniqueUsers(),
  ]);

  return (
    <AdminDashboardClient
      initialOrganizations={organizations}
      initialTotalUsers={totalUsers}
    />
  );
}
