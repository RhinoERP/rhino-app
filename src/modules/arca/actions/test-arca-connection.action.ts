"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { testArcaConnection } from "../server/onboarding.service";
import type {
  ArcaActionResult,
  ArcaConnectionTestResult,
  ArcaSettingsSummary,
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

export async function testArcaConnectionAction(
  orgSlug: string
): Promise<ArcaActionResult<ArcaConnectionTestResult>> {
  try {
    const result = await testArcaConnection(orgSlug);

    revalidatePath(`/org/${orgSlug}/configuracion/arca`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: toArcaUserMessage(error),
      summary: await safeGetSummary(orgSlug),
    };
  }
}
