import type { User } from "@supabase/supabase-js";
import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthCard } from "@/components/auth/auth-card";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

type InvitationLookupResponse = {
  active: boolean;
  organization_name: string;
  invited_email: string | null;
};

type PageSearchParams = {
  token?: string;
};

type AcceptInvitePageProps = {
  searchParams: Promise<PageSearchParams>;
};

async function AcceptInvitePageContent({
  searchParams,
}: AcceptInvitePageProps) {
  const { token } = await searchParams;

  const normalizedToken: string | null = token ?? null;

  let user: User | null = null;
  let inviteInfo: InvitationLookupResponse | null = null;
  let errorMessage: string | null = null;

  if (normalizedToken) {
    try {
      const supabase = await createServerSupabaseClient();

      const [{ data: userRes }, { data: inviteRes, error: inviteError }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase.rpc("lookup_organization_invitation", {
            p_token: normalizedToken,
          }),
        ]);

      if (inviteError) {
        throw inviteError;
      }

      const invite = (inviteRes ?? null) as InvitationLookupResponse | null;

      user = userRes?.user ?? null;
      inviteInfo = invite;

      if (!invite || invite.active === false) {
        errorMessage = "Invitación inválida o expirada.";
      }
    } catch (error) {
      console.error("Error loading invitation:", error);
      errorMessage = "Ocurrió un error al cargar la invitación.";
    }
  } else {
    errorMessage = "Falta el token de invitación en la URL.";
  }

  return (
    <AuthCard
      description="Únete a la organización usando el enlace de invitación"
      title="Aceptar invitación"
    >
      <AcceptInviteForm
        initialErrorMessage={errorMessage}
        inviteInfo={inviteInfo}
        token={normalizedToken}
        user={user}
      />
    </AuthCard>
  );
}

export default function AcceptInvitePage(props: AcceptInvitePageProps) {
  return (
    <Suspense
      fallback={
        <AuthCard title="Aceptar invitación">
          <p className="text-muted-foreground text-sm">Cargando invitación…</p>
        </AuthCard>
      }
    >
      <AcceptInvitePageContent {...props} />
    </Suspense>
  );
}
