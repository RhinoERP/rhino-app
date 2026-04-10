"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { saveArcaOperatorProfile } from "../server/operator-profiles.service";
import type {
  ArcaActionResult,
  ArcaOperatorProfileSummary,
  SaveArcaOperatorProfileInput,
} from "../types";

export async function saveArcaOperatorProfileAction(
  input: SaveArcaOperatorProfileInput
): Promise<ArcaActionResult<ArcaOperatorProfileSummary>> {
  try {
    const summary = await saveArcaOperatorProfile(input);

    revalidatePath("/admin/arca");

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
