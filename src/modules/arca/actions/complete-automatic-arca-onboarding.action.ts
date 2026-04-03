"use server";

import { revalidatePath } from "next/cache";
import { getArcaErrorDiagnostic, toArcaUserMessage } from "../errors";
import { completeAutomaticArcaOnboarding } from "../server/automation-onboarding.service";
import type {
  ArcaActionResult,
  ArcaSettingsSummary,
  AutomaticArcaOnboardingInput,
  AutomaticArcaOnboardingResult,
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

export async function completeAutomaticArcaOnboardingAction(
  input: AutomaticArcaOnboardingInput
): Promise<ArcaActionResult<AutomaticArcaOnboardingResult>> {
  try {
    const result = await completeAutomaticArcaOnboarding(input);

    revalidatePath(`/org/${input.orgSlug}/configuracion/arca`);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: toArcaUserMessage(error),
      summary: await safeGetSummary(input.orgSlug),
      diagnostic: getArcaErrorDiagnostic(error),
    };
  }
}
