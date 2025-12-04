import type { User } from "@supabase/supabase-js";
import { Suspense } from "react";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Aceptar invitación</CardTitle>
              <CardDescription>
                Únete a la organización usando el enlace de invitación.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptInviteForm
                initialErrorMessage={errorMessage}
                inviteInfo={inviteInfo}
                token={normalizedToken}
                user={user}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage(props: AcceptInvitePageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-sm">
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Aceptar invitación</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">
                    Cargando invitación…
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      }
    >
      <AcceptInvitePageContent {...props} />
    </Suspense>
  );
}
