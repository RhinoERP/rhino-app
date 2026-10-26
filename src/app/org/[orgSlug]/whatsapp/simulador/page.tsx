import { WhatsAppAgentSimulator } from "@/components/whatsapp/whatsapp-agent-simulator";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getWhatsAppSimulationOptions } from "@/modules/whatsapp/server/simulation";

export default async function WhatsAppSimulatorPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await ensure("whatsapp.read", orgSlug);
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) {
    throw new Error("Organización no encontrada");
  }
  const options = await getWhatsAppSimulationOptions(organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">
          Simulador del agente de WhatsApp
        </h1>
        <p className="text-muted-foreground text-sm">
          Probá el flujo comercial con datos reales sin conectar un número de
          WhatsApp.
        </p>
      </div>
      <WhatsAppAgentSimulator options={options} orgSlug={orgSlug} />
    </div>
  );
}
