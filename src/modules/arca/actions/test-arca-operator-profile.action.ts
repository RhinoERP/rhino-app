"use server";

import { revalidatePath } from "next/cache";
import { toArcaUserMessage } from "../errors";
import { testArcaOperatorProfile } from "../server/operator-profiles.service";
import type {
  ArcaActionResult,
  ArcaEnvironment,
  ArcaOperatorProfileTestResult,
} from "../types";

export async function testArcaOperatorProfileAction(
  environment: ArcaEnvironment
): Promise<ArcaActionResult<ArcaOperatorProfileTestResult>> {
  try {
    const result = await testArcaOperatorProfile(environment);

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
