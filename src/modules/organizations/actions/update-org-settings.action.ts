"use server";

import { revalidatePath } from "next/cache";
import type { OrgSettings } from "../service/org-settings.service";
import { updateOrgSettings } from "../service/org-settings.service";
import { ensure } from "../utils/with-permission-guard";

type UpdateOrgSettingsResult =
  | { success: true; settings: OrgSettings }
  | { success: false; error: string };

export async function updateOrgSettingsAction(
  orgSlug: string,
  patch: Partial<OrgSettings>
): Promise<UpdateOrgSettingsResult> {
  await ensure("organization.admin", orgSlug);
  try {
    const {
      remittance_mask_printing_enabled: _platformFeatureFlag,
      ...allowedPatch
    } = patch;
    const settings = await updateOrgSettings(orgSlug, allowedPatch);
    revalidatePath(`/org/${orgSlug}/configuracion`);
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
