import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthCard } from "@/components/auth/auth-card";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrganizationInvitationLookupResponse } from "@/modules/organizations/types";

type PageSearchParams = {
  token?: string;
};

type AcceptInvitePageProps = {
  searchParams: Promise<PageSearchParams>;
};

type InvitationPageState = {
  user: User | null;
  inviteInfo: OrganizationInvitationLookupResponse | null;
  errorMessage: string | null;
  loginRedirectUrl: string | null;
};

async function loadInvitationPageState(
  normalizedToken: string | null
): Promise<InvitationPageState> {
  const supabase = await createServerSupabaseClient();

  const state: InvitationPageState = {
    user: null,
    inviteInfo: null,
    errorMessage: null,
    loginRedirectUrl: null,
  };

  if (!normalizedToken) {
    state.errorMessage = "Falta el token de invitación en la URL.";
    return state;
  }

  try {
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

    const invite = (inviteRes ??
      null) as OrganizationInvitationLookupResponse | null;

    state.user = userRes?.user ?? null;
    state.inviteInfo = invite;

    if (!invite || invite.active === false) {
      state.errorMessage = "Invitación inválida o expirada.";
      return state;
    }

    if (invite.user_exists && !state.user) {
      const redirectTo = `/auth/accept-invite?token=${encodeURIComponent(
        normalizedToken
      )}`;
      state.loginRedirectUrl = `/auth/login?redirectTo=${encodeURIComponent(
        redirectTo
      )}`;
    }

    return state;
  } catch (error) {
    console.error("Error loading invitation:", error);
    state.errorMessage = "Ocurrió un error al cargar la invitación.";
    return state;
  }
}

async function AcceptInvitePageContent({
  searchParams,
}: AcceptInvitePageProps) {
  const { token } = await searchParams;
  const normalizedToken: string | null = token ?? null;

  const { errorMessage, inviteInfo, loginRedirectUrl, user } =
    await loadInvitationPageState(normalizedToken);

  if (loginRedirectUrl) {
    redirect(loginRedirectUrl);
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
