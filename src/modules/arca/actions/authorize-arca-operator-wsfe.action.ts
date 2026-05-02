"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { authorizeArcaOperatorWsfe } from "../server/operator-profiles.service";
import type {
  ArcaActionResult,
  ArcaEnvironment,
  ArcaOperatorAuthorizationResult,
} from "../types";

export async function authorizeArcaOperatorWsfeAction(
  environment: ArcaEnvironment
): Promise<ArcaActionResult<ArcaOperatorAuthorizationResult>> {
  try {
    const result = await authorizeArcaOperatorWsfe(environment);

    revalidatePath("/admin/arca");

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: toArcaUserMessage(error),
    };
  }
}
