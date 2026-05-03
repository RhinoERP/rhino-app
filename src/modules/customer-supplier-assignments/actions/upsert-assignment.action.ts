"use server";

import { upsertAssignment } from "../service/assignments.service";
import type { UpsertAssignmentInput } from "../types";

export async function upsertAssignmentAction(
  orgSlug: string,
  input: UpsertAssignmentInput
) {
  return await upsertAssignment(orgSlug, input);
}
