import { WhatsAppInbox } from "@/components/whatsapp/whatsapp-inbox";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getWhatsAppInboxByOrgSlug } from "@/modules/whatsapp/service/whatsapp-conversations.service";

type WhatsAppConversationsPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function WhatsAppConversationsPage({
  params,
}: WhatsAppConversationsPageProps) {
  const { orgSlug } = await params;
  await ensure("whatsapp.read", orgSlug);
  const conversations = await getWhatsAppInboxByOrgSlug(orgSlug);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Conversaciones de WhatsApp</h1>
        <p className="text-muted-foreground text-sm">
          Revisá derivaciones y continuá las conversaciones desde Rhinos.
        </p>
      </div>
      <WhatsAppInbox conversations={conversations} orgSlug={orgSlug} />
    </div>
  );
}
