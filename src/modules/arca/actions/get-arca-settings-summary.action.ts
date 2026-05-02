"use server";

import { toArcaUserMessage } from "../errors";
import { getArcaSettingsSummary } from "../server/settings.service";
import type { ArcaActionResult, ArcaSettingsSummary } from "../types";

export async function getArcaSettingsSummaryAction(
  orgSlug: string
): Promise<ArcaActionResult<ArcaSettingsSummary>> {
  try {
    const summary = await getArcaSettingsSummary(orgSlug);

    return {
      success: true,
      data: summary,
    };
  } catch (error) {
    return {
      success: false,
      error: toArcaUserMessage(error),
    };
  }
}
