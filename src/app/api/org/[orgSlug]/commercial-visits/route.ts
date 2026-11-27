import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  customerSitesSchema,
  decideSiteProposalSchema,
  proposeSiteSchema,
  type RouteDayResult,
  reviewQueueSchema,
  routeAdminListSchema,
  routeDayResultSchema,
  saveCustomerSiteSchema,
  siteProposalsSchema,
  visitAdminDaySchema,
  visitCommandSchema,
  visitDayResultSchema,
  visitDaySchema,
  visitDocumentCandidatesSchema,
  visitDocumentHistorySchema,
} from "@/modules/commercial-visits/contracts";
import { withDocumentActorNames } from "@/modules/commercial-visits/service/document-actors.service";
import { withRouteActorNames } from "@/modules/commercial-visits/service/route-actors.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { getSalesAccessContext } from "@/modules/sales/service/sales.service";

type Context = { params: Promise<{ orgSlug: string }> };
export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function rpcErrorResponse(
  error: { message: string; code?: string },
  fallback: string
) {
  if (error.code === "PGRST202" || error.code === "42883") {
    return NextResponse.json(
      {
        error: "Falta aplicar una migración de visitas comerciales.",
      },
      { status: 503, headers: PRIVATE_HEADERS }
    );
  }
  if (error.code === "42501") {
    return NextResponse.json(
      { error: error.message },
      { status: 403, headers: PRIVATE_HEADERS }
    );
  }
  if (error.code === "22023") {
    return NextResponse.json(
      { error: error.message },
      { status: 400, headers: PRIVATE_HEADERS }
    );
  }
  if (error.code === "23505" || error.code === "23503") {
    return NextResponse.json(
      {
        error:
          "El documento o punto cambió mientras se guardaba. Actualizá y volvé a intentarlo.",
      },
      { status: 409, headers: PRIVATE_HEADERS }
    );
  }
  return NextResponse.json(
    { error: fallback },
    { status: 500, headers: PRIVATE_HEADERS }
  );
}

async function presentVisitResponse(data: unknown, routes: boolean) {
  if (!routes) {
    return data;
  }
  return await withRouteActorNames(data as RouteDayResult);
}

// These RPCs are introduced in the commercial_visit_pilot migration. The
// generated Supabase types are refreshed from the deployed schema separately.
async function callVisitRpc(name: string, args: Record<string, unknown>) {
  const client = await createClient();
  const rpc = client.rpc.bind(client) as unknown as (
    functionName: string,
    parameters: Record<string, unknown>
  ) => Promise<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
  return rpc(name, args);
}

async function authorize(orgSlug: string, adminOnly: boolean) {
  const access = await getSalesAccessContext(orgSlug);
  if (
    !access.userId ||
    (adminOnly
      ? !access.isOrganizationAdmin
      : !(access.canManage || access.isOrganizationAdmin))
  ) {
    return null;
  }
  return getOrganizationBySlug(orgSlug);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each view maps to one scoped RPC and response schema
function getView(request: NextRequest): {
  name: string;
  schema: z.ZodType;
  args: Record<string, unknown>;
  adminOnly: boolean;
  kind: "routes" | "history" | "other";
} | null {
  const view = request.nextUrl.searchParams.get("view");
  const day = request.nextUrl.searchParams.get("day");
  const visitId = request.nextUrl.searchParams.get("visitId");
  if (view === "review") {
    return {
      name: "commercial_site_review_queue",
      schema: reviewQueueSchema,
      args: {},
      adminOnly: true,
      kind: "other",
    };
  }
  if (view === "sites") {
    const customerId = request.nextUrl.searchParams.get("customerId");
    if (!z.uuid().safeParse(customerId).success) {
      return null;
    }
    return {
      name: "commercial_site_catalog",
      schema: customerSitesSchema,
      args: { p_customer: customerId },
      adminOnly: false,
      kind: "other",
    };
  }
  if (view === "mapSites") {
    return {
      name: "commercial_site_catalog",
      schema: customerSitesSchema,
      args: {},
      adminOnly: false,
      kind: "other",
    };
  }
  if (view === "siteProposals") {
    const customerId = request.nextUrl.searchParams.get("customerId");
    if (customerId && !z.uuid().safeParse(customerId).success) {
      return null;
    }
    return {
      name: "commercial_site_proposal_queue",
      schema: siteProposalsSchema,
      args: { p_customer: customerId || null },
      adminOnly: !customerId,
      kind: "other",
    };
  }
  if (view === "adminRoutes") {
    return {
      name: "commercial_route_admin_list",
      schema: routeAdminListSchema,
      args: {},
      adminOnly: true,
      kind: "other",
    };
  }
  if (view === "candidates" || view === "history") {
    if (!z.uuid().safeParse(visitId).success) {
      return null;
    }
    return {
      name:
        view === "history"
          ? "commercial_site_document_history"
          : "commercial_visit_document_candidates",
      schema:
        view === "history"
          ? visitDocumentHistorySchema
          : visitDocumentCandidatesSchema,
      args: { p_visit: visitId },
      adminOnly: false,
      kind: view === "history" ? "history" : "other",
    };
  }
  if (!visitDaySchema.safeParse(day).success) {
    return null;
  }
  if (view === "adminDay") {
    return {
      name: "commercial_site_admin_day",
      schema: visitAdminDaySchema,
      args: { p_day: day },
      adminOnly: true,
      kind: "other",
    };
  }
  if (view === "routes") {
    return {
      name: "commercial_site_route_day",
      schema: routeDayResultSchema,
      args: { p_day: day },
      adminOnly: false,
      kind: "routes",
    };
  }
  return {
    name: "commercial_visit_day",
    schema: visitDayResultSchema,
    args: { p_day: day },
    adminOnly: false,
    kind: "other",
  };
}

export async function GET(request: NextRequest, context: Context) {
  const { orgSlug } = await context.params;
  const config = getView(request);
  if (!config) {
    return NextResponse.json(
      { error: "Fecha o visita inválida" },
      { status: 400, headers: PRIVATE_HEADERS }
    );
  }
  const org = await authorize(orgSlug, config.adminOnly);
  if (!org) {
    return NextResponse.json(
      { error: "Sin permiso" },
      { status: 403, headers: PRIVATE_HEADERS }
    );
  }
  const { data, error } = await callVisitRpc(config.name, {
    p_org: org.id,
    ...config.args,
  });
  if (error) {
    return rpcErrorResponse(error, "No se pudieron cargar las visitas");
  }
  const parsed = config.schema.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Respuesta de visitas inválida" },
      { status: 500, headers: PRIVATE_HEADERS }
    );
  }
  const result =
    config.kind === "history"
      ? await withDocumentActorNames(
          parsed.data as Parameters<typeof withDocumentActorNames>[0]
        )
      : await presentVisitResponse(parsed.data, config.kind === "routes");
  return NextResponse.json(result, { headers: PRIVATE_HEADERS });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: commands map to separate validated RPC calls
export async function POST(request: NextRequest, context: Context) {
  const { orgSlug } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const command = z
    .union([
      visitCommandSchema,
      saveCustomerSiteSchema,
      proposeSiteSchema,
      decideSiteProposalSchema,
    ])
    .safeParse(body);
  if (!command.success) {
    return NextResponse.json(
      { error: z.prettifyError(command.error) },
      { status: 400, headers: PRIVATE_HEADERS }
    );
  }
  const adminOnly =
    command.data.action === "decideLocation" ||
    command.data.action === "saveSite" ||
    command.data.action === "decideSiteProposal";
  const org = await authorize(orgSlug, adminOnly);
  if (!org) {
    return NextResponse.json(
      { error: "Sin permiso" },
      { status: 403, headers: PRIVATE_HEADERS }
    );
  }
  const input = command.data;
  let name: string;
  let args: Record<string, unknown>;
  switch (input.action) {
    case "createRoute":
      name = "commercial_route_create";
      args = { p_org: org.id, p_day: input.day };
      break;
    case "addToRoute":
      name = "commercial_route_add_site_visit";
      args = {
        p_org: org.id,
        p_route: input.routeId,
        p_customer: input.customerId,
        p_site: input.siteId,
      };
      break;
    case "reorder":
      name = "commercial_route_reorder";
      args = {
        p_org: org.id,
        p_route: input.routeId,
        p_visits: input.visitIds,
      };
      break;
    case "closeRoute":
      name = "commercial_route_close";
      args = {
        p_org: org.id,
        p_route: input.routeId,
        p_reasons: input.reasons,
      };
      break;
    case "reopenRoute":
      name = "commercial_route_reopen";
      args = { p_org: org.id, p_route: input.routeId };
      break;
    case "correctVisit":
      name = "commercial_visit_correct";
      args = { p_org: org.id, p_visit: input.visitId, p_reason: input.reason };
      break;
    case "add":
      name = "commercial_visit_add";
      args = { p_org: org.id, p_customer: input.customerId, p_day: input.day };
      break;
    case "confirmVisit":
      name = "commercial_visit_confirm";
      args = {
        p_org: org.id,
        p_visit: input.visitId,
        p_manual: input.manual,
        p_lat: input.manual ? null : input.latitude,
        p_lng: input.manual ? null : input.longitude,
        p_accuracy: input.manual ? null : input.accuracyM,
        p_quotes: input.quoteIds,
        p_orders: input.orderIds,
        p_none: input.noDocuments,
      };
      break;
    case "linkDocument":
      name = "commercial_visit_link_later";
      args = {
        p_org: org.id,
        p_visit: input.visitId,
        p_type: input.documentType,
        p_document: input.documentId,
      };
      break;
    case "proposeLocation":
      name = "commercial_site_location_propose";
      args = {
        p_org: org.id,
        p_visit: input.visitId,
        p_method: input.method,
        p_lat: input.latitude,
        p_lng: input.longitude,
        p_accuracy: input.accuracyM ?? null,
        p_address: input.address ?? null,
        p_city: input.city ?? null,
      };
      break;
    case "decideLocation":
      name = "commercial_site_location_decide";
      args = {
        p_org: org.id,
        p_proposal: input.proposalId,
        p_approve: input.approved,
        p_reason: input.reason ?? null,
      };
      break;
    case "saveSite":
      name = "commercial_site_save_with_postcode";
      args = {
        p_org: org.id,
        p_customer: input.customerId,
        p_site: input.siteId ?? null,
        p_name: input.name,
        p_address: input.address,
        p_city: input.city,
        p_postal_code: input.postalCode,
        p_notes: input.notes ?? null,
        p_active: input.active,
        p_lat: input.latitude,
        p_lng: input.longitude,
      };
      break;
    case "proposeSite":
      name = "commercial_site_propose_from_customer";
      args = {
        p_org: org.id,
        p_customer: input.customerId,
        p_site: input.siteId ?? null,
        p_name: input.name,
        p_address: input.address,
        p_city: input.city,
        p_postal_code: input.postalCode,
        p_lat: input.latitude,
        p_lng: input.longitude,
      };
      break;
    case "decideSiteProposal":
      name = "commercial_site_proposal_decide";
      args = {
        p_org: org.id,
        p_proposal: input.proposalId,
        p_approve: input.approved,
        p_reason: input.reason ?? null,
      };
      break;
    default:
      return NextResponse.json(
        { error: "Acción inválida" },
        { status: 400, headers: PRIVATE_HEADERS }
      );
  }
  let { data, error } = await callVisitRpc(name, args);
  // Keep existing site editing usable in test environments awaiting the new
  // migration. Postal codes are never silently discarded.
  if (
    input.action === "saveSite" &&
    !input.postalCode &&
    (error?.code === "PGRST202" || error?.code === "42883")
  ) {
    ({ data, error } = await callVisitRpc("commercial_site_save", {
      p_org: args.p_org,
      p_customer: args.p_customer,
      p_site: args.p_site,
      p_name: args.p_name,
      p_address: args.p_address,
      p_city: args.p_city,
      p_notes: args.p_notes,
      p_active: args.p_active,
      p_lat: args.p_lat,
      p_lng: args.p_lng,
    }));
  }
  if (error) {
    if (
      input.action === "saveSite" &&
      (error.code === "PGRST202" || error.code === "42883")
    ) {
      return NextResponse.json(
        {
          error:
            "Falta aplicar la migración de códigos postales de sucursales.",
        },
        { status: 503, headers: PRIVATE_HEADERS }
      );
    }
    return rpcErrorResponse(error, "No se pudo guardar la visita");
  }
  return NextResponse.json(
    { ok: true, id: data },
    { headers: PRIVATE_HEADERS }
  );
}
