import { redirect } from "next/navigation";
import { ReportsPage } from "@/components/reports/reports-page";
import {
  availableDatasets,
  resolveReportAccess,
} from "@/modules/reports/run-report";

export default async function ReportesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const access = await resolveReportAccess(orgSlug).catch(() => null);
  if (!(access && availableDatasets(access).length)) {
    redirect(`/org/${orgSlug}`);
  }
  return <ReportsPage isManager={access.isManager} orgSlug={orgSlug} />;
}
