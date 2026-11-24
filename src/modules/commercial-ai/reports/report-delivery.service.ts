import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { getCreditStatus } from "../service/usage.service";
import {
  type SellerTarget,
  sellerInWindow,
  sendSellerTemplate,
  sendSellerText,
} from "../whatsapp/seller-assistant.service";
import type { ReportSpec } from "./catalog";
import { type ReportAccess, ReportError, runReport } from "./run-report";
import {
  argentinaClock,
  isScheduleDue,
  type ReportSchedule,
  reportToWhatsApp,
  sanitizeSchedule,
} from "./whatsapp-report";

/*
 * Reportes guardados que llegan por WhatsApp. Si el usuario escribió en las
 * últimas 24 h va el reporte completo; si no, Meta solo deja mandar una
 * plantilla aprobada (WHATSAPP_REPORT_TEMPLATE, parámetros {{1}} nombre y
 * {{2}} reporte, botón "Ver reporte") y el texto queda guardado hasta que lo
 * toca.
 */

type SavedRow = {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  spec: ReportSpec;
  whatsapp_schedule: unknown;
  whatsapp_last_sent_at: string | null;
};

export type DeliveryOutcome =
  | "texto"
  | "plantilla"
  | "sin_whatsapp"
  | "sin_creditos"
  | "sin_plantilla";

/** Lo que este usuario puede ver, sin sesión (mismas reglas que en la app). */
export async function reportAccessForUser(
  admin: SupabaseClient,
  organizationId: string,
  userId: string
): Promise<ReportAccess | null> {
  const [{ data: member }, { data: org }, { data: auth }] = await Promise.all([
    admin
      .from("organization_members")
      .select("role_id, is_owner, is_active, disabled_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("slug")
      .eq("id", organizationId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  if (!(member && org) || member.disabled_at || member.is_active === false) {
    return null;
  }
  const { data: perms } = await admin
    .from("role_permissions")
    .select("permissions(key)")
    .eq("role_id", member.role_id);
  const permissions = (
    (perms ?? []) as unknown as { permissions: { key: string } | null }[]
  )
    .map((p) => p.permissions?.key)
    .filter((k): k is string => Boolean(k));
  if (member.is_owner) {
    permissions.push("organization.admin");
  }
  const isManager =
    permissions.includes("organization.admin") ||
    permissions.includes("commercial_ai.manage");
  if (!(isManager || permissions.includes("commercial_ai.read"))) {
    return null;
  }
  const user = auth.user;
  return {
    orgSlug: org.slug as string,
    organizationId,
    userId,
    userName:
      (user?.user_metadata?.full_name as string | undefined) ??
      user?.email ??
      "Usuario",
    isManager,
    permissions,
  };
}

/** El WhatsApp cargado del usuario y el número de la empresa. */
export async function sellerTargetFor(
  admin: SupabaseClient,
  organizationId: string,
  userId: string
): Promise<SellerTarget | null> {
  const [{ data: phone }, { data: integration }] = await Promise.all([
    admin
      .from("commercial_ai_seller_phones")
      .select("phone")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("whatsapp_integrations")
      .select("phone_number_id")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);
  if (!(phone?.phone && integration?.phone_number_id)) {
    return null;
  }
  return {
    organizationId,
    userId,
    phone: phone.phone as string,
    phoneNumberId: integration.phone_number_id as string,
  };
}

const TRAILING_SLASH = /\/$/;

function reportLink(slug: string, reportId: string): string | null {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return base
    ? `${base.replace(TRAILING_SLASH, "")}/org/${slug}/ia-comercial?seccion=reportes&reporte=${reportId}`
    : null;
}

/** Arma el reporte con los permisos de su dueño y se lo manda por WhatsApp. */
export async function deliverSavedReport(
  admin: SupabaseClient,
  row: SavedRow
): Promise<DeliveryOutcome> {
  const [access, target] = await Promise.all([
    reportAccessForUser(admin, row.organization_id, row.user_id),
    sellerTargetFor(admin, row.organization_id, row.user_id),
  ]);
  if (!(access && target)) {
    return "sin_whatsapp";
  }
  if ((await getCreditStatus(row.organization_id)).level === "agotado") {
    return "sin_creditos";
  }
  target.userName = access.userName;
  const report = await runReport(
    access,
    { ...row.spec, title: row.name },
    { withoutSession: true }
  );
  const text = reportToWhatsApp(report, reportLink(access.orgSlug, row.id));
  const now = new Date().toISOString();

  if (await sellerInWindow(admin, target)) {
    await sendSellerText(target, text);
    await admin
      .from("commercial_ai_saved_reports" as never)
      .update({ whatsapp_last_sent_at: now } as never)
      .eq("id", row.id);
    return "texto";
  }
  const template = process.env.WHATSAPP_REPORT_TEMPLATE ?? "";
  const firstName = access.userName.split(" ")[0] ?? "";
  const sent = await sendSellerTemplate(target, template, [
    firstName,
    row.name,
  ]);
  if (!sent) {
    return "sin_plantilla";
  }
  await admin
    .from("commercial_ai_saved_reports" as never)
    .update({
      whatsapp_last_sent_at: now,
      whatsapp_pending_text: text,
      whatsapp_pending_at: now,
    } as never)
    .eq("id", row.id);
  return "plantilla";
}

const SAVED_COLUMNS =
  "id, organization_id, user_id, name, spec, whatsapp_schedule, whatsapp_last_sent_at";

/** "Mandámelo ahora": prueba desde la app. */
export async function deliverSavedReportNow(
  reportId: string,
  userId: string
): Promise<DeliveryOutcome> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data } = await admin
    .from("commercial_ai_saved_reports")
    .select(SAVED_COLUMNS)
    .eq("id", reportId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    throw new ReportError("No encontré ese reporte.");
  }
  return deliverSavedReport(admin, data as unknown as SavedRow);
}

export type ScheduleRunResult = Record<
  DeliveryOutcome | "fallidos" | "revisados",
  number
>;

/** Cron de cada hora: manda los reportes que tocan en esta hora argentina. */
export async function runDueReportSchedules(
  now = new Date()
): Promise<ScheduleRunResult> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const result: ScheduleRunResult = {
    revisados: 0,
    texto: 0,
    plantilla: 0,
    sin_whatsapp: 0,
    sin_creditos: 0,
    sin_plantilla: 0,
    fallidos: 0,
  };
  const { data } = await admin
    .from("commercial_ai_saved_reports")
    .select(SAVED_COLUMNS)
    .not("whatsapp_schedule", "is", null);
  const clock = argentinaClock(now);
  for (const row of (data ?? []) as unknown as SavedRow[]) {
    const schedule: ReportSchedule | null = sanitizeSchedule(
      row.whatsapp_schedule
    );
    if (
      !(
        schedule &&
        isScheduleDue(schedule, clock, row.whatsapp_last_sent_at, now)
      )
    ) {
      continue;
    }
    result.revisados += 1;
    try {
      result[await deliverSavedReport(admin, row)] += 1;
    } catch (error) {
      console.error("IA Comercial: falló el reporte programado", row.id, error);
      result.fallidos += 1;
    }
  }
  return result;
}
