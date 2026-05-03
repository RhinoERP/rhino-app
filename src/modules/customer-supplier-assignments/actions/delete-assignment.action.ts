"use server";

import { deleteAssignment } from "../service/assignments.service";

export async function deleteAssignmentAction(
  orgSlug: string,
  assignmentId: string
) {
  return await deleteAssignment(orgSlug, assignmentId);
}
