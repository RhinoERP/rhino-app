import { notFound } from "next/navigation";
import { UsagePanel } from "@/components/commercial-ai/usage-panel";
import { getUsageSummary } from "@/modules/commercial-ai/service/usage.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";

export default async function OrgAiUsagePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    notFound();
  }
  const usage = await getUsageSummary(organization.id);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl">IA Comercial · consumo y topes</h2>
        <p className="text-muted-foreground text-sm">
          Cuánto gasta {organization.name} en IA este mes y hasta cuánto puede
          gastar. Al llegar al tope, la IA se apaga y el módulo sigue con
          reglas.
        </p>
      </div>
      <UsagePanel
        admin={{ organizationId: organization.id, orgSlug }}
        usage={usage}
      />
    </div>
  );
}
