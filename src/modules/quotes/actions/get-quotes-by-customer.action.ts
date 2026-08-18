"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { READ_PERMISSIONS } from "@/modules/organizations/utils/permission-groups";
import { ensure } from "@/modules/organizations/utils/with-permission-guard";

export type QuoteForCustomer = {
  id: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string | null;
  creator_name: string | null;
  parent_quote_id: string | null;
  children: QuoteForCustomer[];
};

export type PaginatedQuotes = {
  parents: QuoteForCustomer[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getQuotesByCustomerAction(
  orgSlug: string,
  customerId: string,
  page = 1,
  pageSize = 5
): Promise<PaginatedQuotes> {
  await ensure(READ_PERMISSIONS.quotes, orgSlug);
  const supabase = await createClient();

  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return { parents: [], total: 0, page, pageSize };
  }

  const { count: total, error: countError } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .is("parent_quote_id", null);

  if (countError) {
    throw new Error(`Error al contar presupuestos: ${countError.message}`);
  }

  const totalParents = total ?? 0;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: parents, error: parentsError } = await supabase
    .from("quotes")
    .select("id, status, total_amount, currency, created_at, created_by")
    .eq("organization_id", org.id)
    .eq("customer_id", customerId)
    .is("parent_quote_id", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (parentsError) {
    throw new Error(
      `Error al obtener presupuestos del cliente: ${parentsError.message}`
    );
  }

  const parentIds = (parents ?? []).map((p) => p.id);

  let children: Array<{
    id: string;
    parent_quote_id: string;
    status: string;
    total_amount: number;
    currency: string;
    created_at: string | null;
    created_by: string | null;
  }> = [];

  if (parentIds.length > 0) {
    const { data: childrenData, error: childrenError } = await supabase
      .from("quotes")
      .select(
        "id, parent_quote_id, status, total_amount, currency, created_at, created_by" as "*"
      )
      .in("parent_quote_id", parentIds)
      .order("created_at", { ascending: true });

    if (childrenError) {
      throw new Error(
        `Error al obtener versiones canceladas: ${childrenError.message}`
      );
    }

    children =
      (childrenData as unknown as Array<{
        id: string;
        parent_quote_id: string;
        status: string;
        total_amount: number;
        currency: string;
        created_at: string | null;
        created_by: string | null;
      }>) ?? [];
  }

  const { data: members } = await supabase.rpc(
    "get_organization_members_with_users",
    { org_slug_param: orgSlug }
  );

  const userMap = new Map(
    (members ?? []).map((m) => [m.user_id, m.full_name || m.email])
  );

  const toQuote = (q: {
    id: string;
    status: string;
    total_amount: number;
    currency: string;
    created_at: string | null;
    created_by: string | null;
  }): QuoteForCustomer => ({
    id: q.id,
    status: q.status,
    total_amount: q.total_amount,
    currency: q.currency,
    created_at: q.created_at,
    creator_name: q.created_by ? (userMap.get(q.created_by) ?? null) : null,
    parent_quote_id: null,
    children: [],
  });

  const childrenByParent = new Map<string, QuoteForCustomer[]>();
  for (const c of children) {
    const list = childrenByParent.get(c.parent_quote_id) ?? [];
    list.push({ ...toQuote(c), parent_quote_id: c.parent_quote_id });
    childrenByParent.set(c.parent_quote_id, list);
  }

  const parentsWithChildren: QuoteForCustomer[] = (parents ?? []).map((p) => ({
    ...toQuote(p),
    children: childrenByParent.get(p.id) ?? [],
  }));

  return {
    parents: parentsWithChildren,
    total: totalParents,
    page,
    pageSize,
  };
}
