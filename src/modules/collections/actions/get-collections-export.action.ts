"use server";

import {
  getAllPayablesForExport,
  getAllReceivablesForExport,
} from "@/modules/collections/service/collections.service";

export async function getReceivablesExportAction(orgSlug: string) {
  try {
    return await getAllReceivablesForExport(orgSlug);
  } catch (error) {
    console.error("Error in getReceivablesExportAction:", error);
    return [];
  }
}

export async function getPayablesExportAction(orgSlug: string) {
  try {
    return await getAllPayablesForExport(orgSlug);
  } catch (error) {
    console.error("Error in getPayablesExportAction:", error);
    return [];
  }
}
