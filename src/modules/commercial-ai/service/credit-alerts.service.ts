import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-client";
import { createResendClient } from "@/modules/email/client";
import type { CreditStatus } from "../credits";

/**
 * Avisa por mail a los administradores de la empresa cuando quedan pocos
 * créditos y cuando se terminan. Un aviso de cada tipo por mes.
 */

type Admin = ReturnType<typeof createAdminClient>;

const DAY_OF_MONTH = /-\d{2}$/;
const TRAILING_SLASH = /\/$/;
const MANAGER_PERMISSIONS = ["organization.admin", "commercial_ai.manage"];
const numberFormat = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 0,
});

function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
    .format(new Date())
    .replace(DAY_OF_MONTH, "-01");
}

/** Marca el aviso del mes; devuelve false si ya se había mandado. */
async function claimAlert(
  admin: Admin,
  organizationId: string,
  column: "low_alert_month" | "out_alert_month",
  month: string
): Promise<boolean> {
  const { data } = await admin
    .from("commercial_ai_wallets")
    .update({ [column]: month })
    .eq("organization_id", organizationId)
    .or(`${column}.is.null,${column}.neq.${month}`)
    .select("organization_id");
  return Boolean(data?.length);
}

async function managerEmails(
  admin: Admin,
  organizationId: string
): Promise<string[]> {
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id, role_id, is_owner, is_active")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  const roleIds = [
    ...new Set(
      (members ?? []).map((m) => m.role_id).filter((id): id is string => !!id)
    ),
  ];
  const { data: rolePermissions } = roleIds.length
    ? await admin
        .from("role_permissions")
        .select("role_id, permissions(key)")
        .in("role_id", roleIds)
    : { data: [] };
  const managerRoles = new Set(
    (rolePermissions ?? [])
      .filter((row) => {
        const related = (row as { permissions: unknown }).permissions;
        const list = Array.isArray(related) ? related : [related];
        return list.some((item) =>
          MANAGER_PERMISSIONS.includes(
            (item as { key?: string } | null)?.key ?? ""
          )
        );
      })
      .map((row) => row.role_id as string)
  );
  const userIds = (members ?? [])
    .filter((m) => m.is_owner || (m.role_id && managerRoles.has(m.role_id)))
    .map((m) => m.user_id as string);
  const users = await Promise.all(
    userIds.map((id) => admin.auth.admin.getUserById(id))
  );
  return users
    .map((result) => result.data.user?.email)
    .filter((email): email is string => !!email);
}

export async function notifyLowCredits(
  organizationId: string,
  status: CreditStatus
): Promise<void> {
  if (status.level === "ok" || !process.env.RESEND_API_KEY) {
    return;
  }
  const admin = createAdminClient();
  const out = status.level === "agotado";
  const claimed = await claimAlert(
    admin,
    organizationId,
    out ? "out_alert_month" : "low_alert_month",
    currentMonth()
  );
  if (!claimed) {
    return;
  }
  const [{ data: organization }, to] = await Promise.all([
    admin
      .from("organizations")
      .select("name, slug")
      .eq("id", organizationId)
      .maybeSingle(),
    managerEmails(admin, organizationId),
  ]);
  if (!(organization && to.length)) {
    return;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://rhinosapp.com";
  const link = `${base.replace(TRAILING_SLASH, "")}/org/${organization.slug}/ia-comercial/creditos`;
  const subject = out
    ? `${organization.name}: se terminaron los créditos de IA Comercial`
    : `${organization.name}: quedan pocos créditos de IA Comercial`;
  const body = out
    ? "Se terminaron los créditos de IA Comercial. RHINO por WhatsApp y la IA de la app quedan en pausa hasta que compres más o empiece el mes que viene."
    : `Quedan ${numberFormat.format(status.available ?? 0)} créditos de IA Comercial (unas ${numberFormat.format(Math.floor((status.available ?? 0) / 3))} respuestas por WhatsApp).`;
  await createResendClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL || "team@rhinos.app",
    to,
    subject,
    html: `<p>${body}</p><p><a href="${link}">Ver consumo y comprar créditos</a></p><p>— Rhinos</p>`,
  });
}
