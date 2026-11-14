"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  explainReport,
  ReportAiError,
  specFromQuestion,
} from "../reports/ai-report";
import {
  canUseDataset,
  datasetById,
  type ReportSpec,
  sanitizeSpec,
} from "../reports/catalog";
import {
  availableDatasets,
  ReportError,
  type ReportResult,
  resolveReportAccess,
  runReport,
} from "../reports/run-report";
import { isAiEnabled } from "../service/ai-client";
import { AiBudgetExceededError } from "../service/usage.service";

export type SavedReport = {
  id: string;
  name: string;
  spec: ReportSpec;
  shared: boolean;
  mine: boolean;
  userName: string | null;
  updatedAt: string;
};

export type ReportsHome = {
  datasets: string[];
  saved: SavedReport[];
  aiEnabled: boolean;
};

type Fail = { success: false; error: string };

function fail(error: unknown, fallback: string): Fail {
  if (
    error instanceof ReportError ||
    error instanceof ReportAiError ||
    error instanceof AiBudgetExceededError
  ) {
    return { success: false, error: error.message };
  }
  if (error instanceof Error && error.message.includes("acceso")) {
    return { success: false, error: error.message };
  }
  console.error("Reportes:", error);
  return { success: false, error: fallback };
}

async function loadSaved(
  orgId: string,
  userId: string
): Promise<SavedReport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_ai_saved_reports" as never)
    .select("id, name, spec, shared, user_id, user_name, updated_at")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    console.warn("Reportes guardados:", error.message);
    return [];
  }
  return (
    (data ?? []) as {
      id: string;
      name: string;
      spec: ReportSpec;
      shared: boolean;
      user_id: string;
      user_name: string | null;
      updated_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    spec: r.spec,
    shared: r.shared,
    mine: r.user_id === userId,
    userName: r.user_name,
    updatedAt: r.updated_at,
  }));
}

/** Lo que el usuario puede ver y sus reportes guardados. */
export async function getReportsHomeAction(
  orgSlug: string
): Promise<{ success: true; data: ReportsHome } | Fail> {
  try {
    const access = await resolveReportAccess(orgSlug);
    return {
      success: true,
      data: {
        datasets: availableDatasets(access).map((d) => d.id),
        saved: await loadSaved(access.organizationId, access.userId),
        aiEnabled: isAiEnabled(),
      },
    };
  } catch (error) {
    return fail(error, "No pude abrir los reportes.");
  }
}

export async function runReportAction(
  orgSlug: string,
  spec: Partial<ReportSpec>
): Promise<{ success: true; report: ReportResult } | Fail> {
  try {
    const access = await resolveReportAccess(orgSlug);
    return { success: true, report: await runReport(access, spec) };
  } catch (error) {
    return fail(error, "No pude armar el reporte. Probá de nuevo.");
  }
}

const questionSchema = z.string().trim().min(3).max(600);

/** "Pedíselo a RHINO": arma el reporte a partir de una frase. */
export async function askReportAction(
  orgSlug: string,
  question: string,
  current?: Partial<ReportSpec> | null
): Promise<{ success: true; report: ReportResult } | Fail> {
  const parsed = questionSchema.safeParse(question);
  if (!parsed.success) {
    return { success: false, error: "Contame qué querés ver." };
  }
  if (!isAiEnabled()) {
    return {
      success: false,
      error:
        "La IA no está activada: armá el reporte con las opciones de abajo.",
    };
  }
  try {
    const access = await resolveReportAccess(orgSlug);
    const spec = await specFromQuestion(
      access,
      availableDatasets(access),
      parsed.data,
      current ?? null
    );
    return { success: true, report: await runReport(access, spec) };
  } catch (error) {
    return fail(
      error,
      "No pude armar ese reporte. Probá decirlo de otra forma."
    );
  }
}

export async function explainReportAction(
  orgSlug: string,
  spec: Partial<ReportSpec>
): Promise<{ success: true; text: string } | Fail> {
  if (!isAiEnabled()) {
    return { success: false, error: "La IA no está activada." };
  }
  try {
    const access = await resolveReportAccess(orgSlug);
    const report = await runReport(access, spec);
    return { success: true, text: await explainReport(access, report) };
  } catch (error) {
    return fail(error, "No pude analizar el reporte.");
  }
}

const saveSchema = z.object({
  name: z.string().trim().min(1, "Ponele un nombre.").max(120),
  shared: z.boolean(),
  id: z.uuid().optional(),
});

export async function saveReportAction(
  orgSlug: string,
  input: { name: string; shared: boolean; id?: string },
  spec: Partial<ReportSpec>
): Promise<{ success: true; saved: SavedReport[] } | Fail> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }
  try {
    const access = await resolveReportAccess(orgSlug);
    // Se guarda la especificación ya validada contra el catálogo.
    const clean = sanitizeSpec(spec);
    const dataset = clean ? datasetById(clean.dataset) : undefined;
    if (!(clean && dataset && canUseDataset(dataset, access.permissions))) {
      throw new ReportError("Ese reporte no se puede guardar.");
    }
    const supabase = await createClient();
    const row = {
      organization_id: access.organizationId,
      user_id: access.userId,
      user_name: access.userName,
      name: parsed.data.name,
      spec: { ...clean, title: parsed.data.name },
      shared: parsed.data.shared,
      updated_at: new Date().toISOString(),
    };
    const table = supabase.from("commercial_ai_saved_reports" as never);
    const { error } = parsed.data.id
      ? await table
          .update(row as never)
          .eq("id", parsed.data.id)
          .eq("user_id", access.userId)
      : await table.insert(row as never);
    if (error) {
      throw new ReportError(`No se pudo guardar: ${error.message}`);
    }
    return {
      success: true,
      saved: await loadSaved(access.organizationId, access.userId),
    };
  } catch (error) {
    return fail(error, "No pude guardar el reporte.");
  }
}

export async function deleteReportAction(
  orgSlug: string,
  id: string
): Promise<{ success: true; saved: SavedReport[] } | Fail> {
  if (!z.uuid().safeParse(id).success) {
    return { success: false, error: "Reporte inválido" };
  }
  try {
    const access = await resolveReportAccess(orgSlug);
    const supabase = await createClient();
    const { error } = await supabase
      .from("commercial_ai_saved_reports" as never)
      .delete()
      .eq("id", id)
      .eq("user_id", access.userId);
    if (error) {
      throw new ReportError(`No se pudo borrar: ${error.message}`);
    }
    return {
      success: true,
      saved: await loadSaved(access.organizationId, access.userId),
    };
  } catch (error) {
    return fail(error, "No pude borrar el reporte.");
  }
}
