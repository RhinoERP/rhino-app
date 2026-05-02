"use server";

import { getOrganizationMembersWithUsersAdmin } from "../service/members.service";

export type SellerOption = {
  id: string;
  name: string;
  email: string | undefined;
};

export async function getOrgSellersAction(
  orgSlug: string
): Promise<SellerOption[]> {
  try {
    const members = await getOrganizationMembersWithUsersAdmin(orgSlug);

    return members
      .filter((m) => m.is_active && m.user_id != null)
      .map((m) => ({
        id: m.user_id,
        name: m.user?.name || m.user?.email || m.user_id,
        email: m.user?.email,
      }));
  } catch {
    return [];
  }
}
