"use server";

import { countAssignmentsByOrg } from "../service/assignments.service";

export async function countAssignmentsByOrgAction(
  orgSlug: string
): Promise<number> {
  try {
    return await countAssignmentsByOrg(orgSlug);
  } catch {
    return 0;
  }
}
