import { notFound } from "next/navigation";
import { ReglasTab } from "@/components/accounting/plan-cuentas-page";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

type Props = { params: Promise<{ orgSlug: string }> };

export default async function ReglasContablesPage({ params }: Props) {
  const { orgSlug } = await params;
  const org = await getOrganizationBySlug(orgSlug);

  if (!org) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-xl">Reglas contables</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Reglas de imputación definidas para cada evento contable.
        </p>
      </div>
      <ReglasTab orgId={org.id} />
    </div>
  );
}
