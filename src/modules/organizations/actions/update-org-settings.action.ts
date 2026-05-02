"use server";

import type { OrgSettings } from "../service/org-settings.service";
import { updateOrgSettings } from "../service/org-settings.service";

type UpdateOrgSettingsResult =
  | { success: true; settings: OrgSettings }
  | { success: false; error: string };

export async function updateOrgSettingsAction(
  orgSlug: string,
  patch: Partial<OrgSettings>
): Promise<UpdateOrgSettingsResult> {
  try {
    const settings = await updateOrgSettings(orgSlug, patch);
    return { success: true, settings };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al actualizar la configuración",
    };
  }
}
