import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  type PurchaseHistoryDocument,
  type PurchaseHistoryFilters,
  type PurchaseHistoryItem,
  type PurchaseHistoryMetrics,
  purchaseHistoryFiltersSchema,
  purchaseHistorySearch,
} from "../chess-history";

type Client = Awaited<ReturnType<typeof createClient>>;

async function getContext(orgSlug: string) {
  const org = await getOrganizationBySlug(orgSlug);
  if (!org) {
    return null;
  }
  const client = await createClient();
  const { data, error } = await client.rpc(
    "can_read_chess_purchase_history" as never,
    { p_org: org.id } as never
  );
  if (error) {
    throw new Error(
      `No se pudo verificar el acceso al historial: ${error.message}`
    );
  }
  return data ? { client, orgId: org.id } : null;
}

// Synchronous: PostgREST builders are thenable and must never be returned from async helpers.
function documentsQuery(
  client: Client,
  orgId: string,
  filters: PurchaseHistoryFilters
) {
  // biome-ignore lint/suspicious/noExplicitAny: historical tables pending generated Supabase types
  let query: any = client
    .from("historical_purchase_documents" as never)
    .select("*", { count: "exact" })
    .eq("organization_id", orgId);
  if (filters.search) {
    query = query.or(purchaseHistorySearch(filters.search));
  }
  if (filters.documentCode) {
    query = query.eq("document_code", filters.documentCode);
  }
  if (filters.dateFrom) {
    query = query.gte("document_date", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("document_date", filters.dateTo);
  }
  const sort = filters.sort?.[0];
  query = sort
    ? query.order(sort.id, { ascending: !sort.desc })
    : query.order("document_date", { ascending: false });
  return query.order("id", { ascending: true });
}

export async function getPurchaseHistoryPage(
  orgSlug: string,
  params: PurchaseHistoryFilters & { page: number; pageSize: number }
) {
  const filters = purchaseHistoryFiltersSchema.parse(params);
  const context = await getContext(orgSlug);
  if (!context) {
    return null;
  }
  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Math.floor(params.pageSize) || 20));
  const query = documentsQuery(context.client, context.orgId, filters);
  const { data, count, error } = await query.range(
    (page - 1) * pageSize,
    page * pageSize - 1
  );
  if (error) {
    throw new Error(
      `No se pudieron consultar las compras históricas: ${error.message}`
    );
  }
  return {
    data: (data ?? []) as PurchaseHistoryDocument[],
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

export async function getPurchaseHistoryDetail(
  orgSlug: string,
  documentId: string
) {
  const context = await getContext(orgSlug);
  if (!context) {
    return null;
  }
  const { client, orgId } = context;
  const [{ data: document, error }, { data: items, error: itemError }] =
    await Promise.all([
      client
        .from("historical_purchase_documents" as never)
        .select("*")
        .eq("organization_id", orgId)
        .eq("id", documentId)
        .maybeSingle(),
      client
        .from("historical_purchase_document_items" as never)
        .select("*")
        .eq("organization_id", orgId)
        .eq("historical_document_id", documentId)
        .order("source_row"),
    ]);
  if (error || itemError) {
    throw new Error(
      `No se pudo abrir el comprobante: ${(error ?? itemError)?.message}`
    );
  }
  return document
    ? {
        document: document as PurchaseHistoryDocument,
        items: (items ?? []) as PurchaseHistoryItem[],
      }
    : null;
}

export async function getPurchaseHistoryMetrics(
  orgSlug: string,
  rawFilters: PurchaseHistoryFilters
) {
  const filters = purchaseHistoryFiltersSchema.parse(rawFilters);
  const context = await getContext(orgSlug);
  if (!context) {
    return null;
  }
  const { data, error } = await context.client.rpc(
    "get_chess_historical_purchase_metrics" as never,
    {
      p_org: context.orgId,
      p_search: filters.search ?? "",
      p_type: filters.documentCode ?? "",
      p_from: filters.dateFrom ?? null,
      p_to: filters.dateTo ?? null,
    } as never
  );
  if (error) {
    throw new Error(
      `No se pudieron calcular las métricas históricas: ${error.message}`
    );
  }
  return data as unknown as PurchaseHistoryMetrics;
}

export async function getPurchaseHistoryExport(
  orgSlug: string,
  rawFilters: PurchaseHistoryFilters,
  offset = 0
) {
  const filters = purchaseHistoryFiltersSchema.parse(rawFilters);
  const context = await getContext(orgSlug);
  if (!context) {
    throw new Error(
      "No tienes permisos para exportar estas compras históricas"
    );
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Página de exportación inválida");
  }
  const batchSize = 500;
  const { data, error, count } = await documentsQuery(
    context.client,
    context.orgId,
    filters
  ).range(offset, offset + batchSize - 1);
  if (error) {
    throw new Error(
      `No se pudieron exportar las compras históricas: ${error.message}`
    );
  }
  if (count === null) {
    throw new Error("No se pudo verificar la cantidad a exportar");
  }
  return {
    data: (data ?? []) as PurchaseHistoryDocument[],
    totalCount: count as number,
  };
}
