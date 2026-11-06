import { WhatsAppInbox } from "@/components/whatsapp/whatsapp-inbox";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import {
  getWhatsAppControlOperators,
  getWhatsAppUserAccess,
} from "@/modules/whatsapp/server/conversation-control";
import { getWhatsAppInboxByOrgSlug } from "@/modules/whatsapp/service/whatsapp-conversations.service";

type WhatsAppConversationsPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default async function WhatsAppConversationsPage({
  params,
}: WhatsAppConversationsPageProps) {
  const { orgSlug } = await params;
  await ensure("whatsapp.read", orgSlug);
  const access = await getWhatsAppUserAccess(orgSlug, "whatsapp.read");
  const [conversations, operators] = await Promise.all([
    getWhatsAppInboxByOrgSlug(orgSlug),
    getWhatsAppControlOperators(access.organization.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Conversaciones de WhatsApp</h1>
        <p className="text-muted-foreground text-sm">
          Revisá derivaciones y administrá quién atiende cada conversación.
        </p>
      </div>
      <WhatsAppInbox
        canManage={access.canManage}
        conversations={conversations}
        currentUserId={access.userId}
        operators={operators}
        orgSlug={orgSlug}
      />
    </div>
  );
}
