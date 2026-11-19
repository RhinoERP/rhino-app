import WhatsAppConfigurationPage from "../../whatsapp/configuracion/page";

export default function WhatsAppSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  return <WhatsAppConfigurationPage params={params} />;
}
