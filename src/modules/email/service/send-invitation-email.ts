import { createResendClient } from "../client";
import { InvitationEmail } from "../templates/invitation-email";

export type SendInvitationEmailParams = {
  to: string;
  organizationName: string;
  invitationToken: string;
  invitationCode?: string;
  fromEmail?: string;
};

export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<void> {
  const resend = createResendClient();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const invitationUrl = `${baseUrl}/auth/accept-invite?token=${params.invitationToken}`;

  const fromEmail =
    params.fromEmail || process.env.RESEND_FROM_EMAIL || "noreply@rhinos.app";

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: params.to,
    subject: `Invitación para unirte a ${params.organizationName}`,
    react: InvitationEmail({
      organizationName: params.organizationName,
      invitationUrl,
      invitationCode: params.invitationCode,
    }),
  });

  if (error) {
    throw new Error(`Error enviando email: ${error.message}`);
  }
}
