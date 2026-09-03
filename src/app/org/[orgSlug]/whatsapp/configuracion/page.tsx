import { WhatsAppIntegrationConfigForm } from "@/components/whatsapp/whatsapp-integration-config-form";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  getWhatsAppConfigurationOptions,
  getWhatsAppIntegrationByOrgSlug,
} from "@/modules/whatsapp/service/whatsapp-integrations.service";

type WhatsAppConfigurationPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function WhatsAppConfigurationPage({
  params,
}: WhatsAppConfigurationPageProps) {
  const { orgSlug } = await params;
  await ensure("whatsapp.configure", orgSlug);

  const [integration, options] = await Promise.all([
    getWhatsAppIntegrationByOrgSlug(orgSlug),
    getWhatsAppConfigurationOptions(orgSlug),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">WhatsApp comercial</h1>
        <p className="text-muted-foreground text-sm">
          Prepará la configuración comercial del asistente antes de conectar el
          canal de WhatsApp.
        </p>
      </div>
      <WhatsAppIntegrationConfigForm
        integration={integration}
        orgSlug={orgSlug}
        priceLists={options.priceLists}
        responsibleUsers={options.responsibleUsers}
      />
    </div>
  );
}
