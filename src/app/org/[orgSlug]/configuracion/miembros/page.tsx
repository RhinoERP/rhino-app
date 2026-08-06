import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActiveInvitationsBySlug } from "@/modules/organizations/service/invitations.service";
import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getOrganizationRolesBySlug } from "@/modules/organizations/service/roles.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { MembersDataTable } from "./data-table";
import { InvitationsDataTable } from "./invitations-data-table";

type MiembrosPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function MiembrosPage({ params }: MiembrosPageProps) {
  const { orgSlug } = await params;
  const [members, roles, invitations, org] = await Promise.all([
    getOrganizationMembersBySlug(orgSlug),
    getOrganizationRolesBySlug(orgSlug),
    getActiveInvitationsBySlug(orgSlug),
    getOrganizationBySlug(orgSlug),
  ]);

  const commissionsEnabled = isOrganizationModuleEnabled(org, "commissions");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Miembros</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona los miembros y las invitaciones de tu organización.
          </p>
        </div>
      </div>

      <Tabs className="w-full" defaultValue="members">
        <TabsList className="mb-2">
          <TabsTrigger value="members">Miembros</TabsTrigger>
          <TabsTrigger value="invitations">Invitaciones</TabsTrigger>
        </TabsList>
        <TabsContent className="space-y-4" value="members">
          <MembersDataTable
            commissionsEnabled={commissionsEnabled}
            data={members}
            orgSlug={orgSlug}
            roles={roles}
          />
        </TabsContent>
        <TabsContent className="space-y-4" value="invitations">
          <InvitationsDataTable
            data={invitations}
            orgSlug={orgSlug}
            roles={roles}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
