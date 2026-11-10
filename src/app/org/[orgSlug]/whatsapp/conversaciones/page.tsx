import { WhatsAppInbox } from "@/components/whatsapp/whatsapp-inbox";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { getWhatsAppUserAccess } from "@/modules/whatsapp/server/conversation-control";

export default async function WhatsAppConversationsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await ensure("whatsapp.read", orgSlug);
  const { organization, userId } = await getWhatsAppUserAccess(
    orgSlug,
    "whatsapp.read"
  );

  return (
    <WhatsAppInbox
      currentUserId={userId}
      key={`${organization.id}:${userId}`}
      orgSlug={orgSlug}
      sandboxEnabled={organization.whatsapp_sandbox_enabled === true}
    />
  );
}
