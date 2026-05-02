"use server";

import { revalidatePath } from "next/cache";
import { getArcaErrorDiagnostic, toArcaUserMessage } from "../errors";
import { completeDelegatedArcaOnboarding } from "../server/delegated-onboarding.service";
import type {
  ArcaActionResult,
  ArcaSettingsSummary,
  DelegatedArcaOnboardingInput,
  DelegatedArcaOnboardingResult,
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

export async function completeDelegatedArcaOnboardingAction(
  input: DelegatedArcaOnboardingInput
): Promise<ArcaActionResult<DelegatedArcaOnboardingResult>> {
  try {
    const result = await completeDelegatedArcaOnboarding(input);

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
