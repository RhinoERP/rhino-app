import { redirect } from "next/navigation";
import { ArcaInvoicesTable } from "@/components/arca/invoices/arca-invoices-table";
import { getAuthorizedArcaInvoicesByOrgSlug } from "@/modules/arca/server/invoices.service";
import { getOrganizationLayoutData } from "@/modules/organizations/service/organizations.service";

type ArcaInvoicesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function ArcaInvoicesPage({
  params,
}: ArcaInvoicesPageProps) {
  const { orgSlug } = await params;
  const layoutData = await getOrganizationLayoutData(orgSlug);

  if (!layoutData) {
    redirect("/");
  }

  const { organizations, permissions } = layoutData;
  const organization = organizations.find((org) => org.slug === orgSlug);

  if (!organization) {
    redirect("/");
  }

  const canViewInvoices = permissions.includes("arca.read");

  if (!canViewInvoices) {
    redirect(`/org/${orgSlug}`);
  }

  const invoices = await getAuthorizedArcaInvoicesByOrgSlug(orgSlug);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Facturas ARCA</h1>
        <p className="text-muted-foreground text-sm">
          Consulta y descarga todas las facturas fiscales emitidas para{" "}
          {organization.name}.
        </p>
      </div>

      <ArcaInvoicesTable invoices={invoices} orgSlug={orgSlug} />
    </div>
  );
}
