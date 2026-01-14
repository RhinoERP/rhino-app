import { createClient } from "@/lib/supabase/server";
import { createResendClient } from "../client";
import { InvitationEmail } from "../templates/invitation-email";

const EMAIL_NAME_SEPARATOR_REGEX = /[._-]/;

export type SendInvitationEmailParams = {
  to: string;
  organizationName: string;
  invitationToken: string;
  roleId?: string;
  employeeName?: string;
  invitationCode?: string;
  fromEmail?: string;
};

function extractNameFromEmail(email: string): string {
  const emailPart = email.split("@")[0];
  const nameParts = emailPart.split(EMAIL_NAME_SEPARATOR_REGEX);
  return nameParts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<void> {
  const resend = createResendClient();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const invitationUrl = `${baseUrl}/auth/accept-invite?token=${params.invitationToken}`;

  const fromEmail =
    params.fromEmail || process.env.RESEND_FROM_EMAIL || "team@rhinos.app";

  let roleName: string | undefined;
  if (params.roleId) {
    const supabase = await createClient();
    const { data: role } = await supabase
      .from("roles")
      .select("name")
      .eq("id", params.roleId)
      .single();

    if (role) {
      roleName = role.name;
    }
  }

  const employeeName = params.employeeName || extractNameFromEmail(params.to);

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: params.to,
    subject: "🦏 ¡Bienvenido al equipo! Tu acceso a Rhinosapp está listo",
    react: InvitationEmail({
      organizationName: params.organizationName,
      invitationUrl,
      employeeName,
      roleName,
      invitationCode: params.invitationCode,
    }),
  });

  if (error) {
    throw new Error(`Error enviando email: ${error.message}`);
  }
}
