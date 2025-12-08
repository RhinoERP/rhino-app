import { InvitationsTable } from "@/components/organization/invitations-table";
import { MembersDataTable } from "@/components/organization/members-data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActiveInvitationsBySlug } from "@/modules/organizations/service/invitations.service";
import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";
import { getOrganizationRolesBySlug } from "@/modules/organizations/service/roles.service";

type MiembrosPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function MiembrosPage({ params }: MiembrosPageProps) {
  const { orgSlug } = await params;
  const [members, roles, invitations] = await Promise.all([
    getOrganizationMembersBySlug(orgSlug),
    getOrganizationRolesBySlug(orgSlug),
    getActiveInvitationsBySlug(orgSlug),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Miembros</h1>
          <p className="text-muted-foreground text-sm">
            Gestiona los miembros y invitaciones de tu organización.
          </p>
        </div>
      </div>

      <Tabs className="w-full" defaultValue="members">
        <TabsList className="mb-2">
          <TabsTrigger value="members">Miembros</TabsTrigger>
          <TabsTrigger value="invitations">Invitaciones</TabsTrigger>
        </TabsList>
        <TabsContent className="space-y-4" value="members">
          <MembersDataTable data={members} orgSlug={orgSlug} roles={roles} />
        </TabsContent>
        <TabsContent className="space-y-4" value="invitations">
          <InvitationsTable
            data={invitations}
            orgSlug={orgSlug}
            roles={roles}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
