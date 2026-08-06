"use server";

import {
  getAllPayablesForExport,
  getAllReceivablesForExport,
} from "@/modules/collections/service/collections.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export async function getReceivablesExportAction(orgSlug: string) {
  await ensure(["collections.read", "collections.manage"], orgSlug);
  try {
    return await getAllReceivablesForExport(orgSlug);
  } catch (error) {
    console.error("Error in getReceivablesExportAction:", error);
    return [];
  }
}

export async function getPayablesExportAction(orgSlug: string) {
  await ensure(["collections.read", "collections.manage"], orgSlug);
  try {
    return await getAllPayablesForExport(orgSlug);
  } catch (error) {
    console.error("Error in getPayablesExportAction:", error);
    return [];
  }
}
