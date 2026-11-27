"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ReportSpec } from "./catalog";
import {
  availableDatasets,
  checkedSpec,
  ReportError,
  type ReportResult,
  resolveReportAccess,
  runReport,
} from "./run-report";

export type SavedReport = {
  id: string;
  name: string;
  spec: ReportSpec;
  shared: boolean;
  mine: boolean;
  userName: string | null;
};

export type ReportsHome = { datasets: string[]; saved: SavedReport[] };
type Failure = { success: false; error: string };

function failure(error: unknown): Failure {
  if (error instanceof ReportError) {
    return { success: false, error: error.message };
  }
  if (error instanceof z.ZodError) {
    return {
      success: false,
      error: error.issues[0]?.message ?? "Revisá los datos del reporte.",
    };
  }
  console.error("Reportes:", error);
  return { success: false, error: "No se pudo completar la operación." };
}

async function savedReports(
  organizationId: string,
  userId: string,
  allowedDatasets: Set<string>
): Promise<SavedReport[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("report_saved_views" as never)
    .select("id, name, spec, shared, user_id, user_name")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(100);
  // Permite usar el constructor antes de aplicar la migración de guardados.
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    return [];
  }
  if (error) {
    throw new ReportError(
      `No se pudieron leer los reportes guardados: ${error.message}`
    );
  }
  return (
    (data ?? []) as {
      id: string;
      name: string;
      spec: ReportSpec;
      shared: boolean;
      user_id: string;
      user_name: string | null;
    }[]
  )
    .filter((row) => allowedDatasets.has(row.spec?.dataset))
    .map((row) => ({
      id: row.id,
      name: row.name,
      spec: row.spec,
      shared: row.shared,
      mine: row.user_id === userId,
      userName: row.user_name,
    }));
}

export async function getReportsHomeAction(
  orgSlug: string
): Promise<{ success: true; data: ReportsHome } | Failure> {
  try {
    const access = await resolveReportAccess(orgSlug);
    const datasets = availableDatasets(access).map((dataset) => dataset.id);
    return {
      success: true,
      data: {
        datasets,
        saved: await savedReports(
          access.organizationId,
          access.userId,
          new Set(datasets)
        ),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function runReportAction(
  orgSlug: string,
  spec: Partial<ReportSpec>
): Promise<{ success: true; report: ReportResult } | Failure> {
  try {
    const access = await resolveReportAccess(orgSlug);
    return { success: true, report: await runReport(access, spec) };
  } catch (error) {
    return failure(error);
  }
}

const saveSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  shared: z.boolean(),
});

function reportWriteError(error: {
  code?: string;
  message: string;
}): ReportError {
  return new ReportError(
    error.code === "42P01" || error.code === "PGRST205"
      ? "Para guardar reportes falta aplicar la migración de reportes guardados."
      : `No se pudo guardar: ${error.message}`
  );
}

export async function saveReportAction(
  orgSlug: string,
  input: { id?: string; name: string; shared: boolean },
  spec: Partial<ReportSpec>
): Promise<{ success: true; saved: SavedReport[] } | Failure> {
  try {
    const parsed = saveSchema.parse(input);
    const access = await resolveReportAccess(orgSlug);
    const { spec: clean } = checkedSpec(access, spec);
    const db = await createClient();
    const row = {
      organization_id: access.organizationId,
      user_id: access.userId,
      user_name: access.userName,
      name: parsed.name,
      shared: parsed.shared,
      spec: { ...clean, title: parsed.name },
      updated_at: new Date().toISOString(),
    };
    const table = db.from("report_saved_views" as never);
    if (parsed.id) {
      const { data, error } = await table
        .update(row as never)
        .eq("id", parsed.id)
        .eq("organization_id", access.organizationId)
        .eq("user_id", access.userId)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        if (error) {
          throw reportWriteError(error);
        }
        throw new ReportError("No encontré ese reporte para editar.");
      }
    } else {
      const { error } = await table.insert(row as never);
      if (error) {
        throw reportWriteError(error);
      }
    }
    return {
      success: true,
      saved: await savedReports(
        access.organizationId,
        access.userId,
        new Set(availableDatasets(access).map((dataset) => dataset.id))
      ),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteReportAction(
  orgSlug: string,
  id: string
): Promise<{ success: true; saved: SavedReport[] } | Failure> {
  try {
    if (!z.uuid().safeParse(id).success) {
      throw new ReportError("Reporte inválido.");
    }
    const access = await resolveReportAccess(orgSlug);
    const db = await createClient();
    const { error } = await db
      .from("report_saved_views" as never)
      .delete()
      .eq("id", id)
      .eq("organization_id", access.organizationId)
      .eq("user_id", access.userId);
    if (error) {
      throw new ReportError(`No se pudo borrar: ${error.message}`);
    }
    return {
      success: true,
      saved: await savedReports(
        access.organizationId,
        access.userId,
        new Set(availableDatasets(access).map((dataset) => dataset.id))
      ),
    };
  } catch (error) {
    return failure(error);
  }
}
