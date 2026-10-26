"use server";

import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";
import { listPosSalesAccountingInbox } from "../service/pos-accounting-inbox.service";
import type { PosSaleAccountingInboxItem } from "../types";
import {
  isPosSaleAccountingActionable,
  type PosAccountingInboxStatus,
} from "../utils/accounting-inbox";

export async function getPosSalesAccountingInboxAction(input: {
  orgSlug: string;
  status?: PosAccountingInboxStatus;
}): Promise<PosSaleAccountingInboxItem[]> {
  await ensure("accounting.manage", input.orgSlug);

  const org = await getOrganizationBySlug(input.orgSlug);
  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const status =
    input.status && isPosSaleAccountingActionable(input.status)
      ? input.status
      : undefined;

  return listPosSalesAccountingInbox({ orgId: org.id, status });
}
