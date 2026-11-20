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
        <h2 className="font-heading text-xl">IA Comercial · créditos</h2>
        <p className="text-muted-foreground text-sm">
          Plan de créditos de {organization.name}, lo que consumió este mes y lo
          que compró. Sin créditos, la IA y el asistente por WhatsApp se pausan.
        </p>
      </div>
      <UsagePanel
        admin={{ organizationId: organization.id, orgSlug }}
        usage={usage}
      />
    </div>
  );
}
