"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { saveArcaSettings } from "../server/settings.service";
import type {
  ArcaActionResult,
  ArcaSettingsSummary,
  SaveArcaSettingsInput,
} from "../types";

async function safeGetSummary(
  orgSlug: string
): Promise<ArcaSettingsSummary | undefined> {
  try {
    const { getArcaSettingsSummary } = await import(
      "../server/settings.service"
    );
    return await getArcaSettingsSummary(orgSlug);
  } catch {
    return;
  }
}

export async function saveArcaSettingsAction(
  input: SaveArcaSettingsInput
): Promise<ArcaActionResult<ArcaSettingsSummary>> {
  try {
    const summary = await saveArcaSettings(input);

    revalidatePath(`/org/${input.orgSlug}/configuracion/arca`);

    return {
      success: true,
      data: summary,
    };
  } catch (error) {
    return {
      success: false,
      error: toArcaUserMessage(error),
      summary: await safeGetSummary(input.orgSlug),
    };
  }
}
