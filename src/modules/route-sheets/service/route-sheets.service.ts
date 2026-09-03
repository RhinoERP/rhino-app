import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import {
  dispatchSaleOrder,
  getSalesAccessContext,
} from "@/modules/sales/service/sales.service";
import type { SalesOrderStatus } from "@/modules/sales/types";
import type { Database } from "@/types/supabase";
import type {
  AddSalesToRouteSheetInput,
  CreateRouteSheetInput,
  DeleteRouteSheetInput,
  RemoveSaleFromRouteSheetInput,
  RouteSheetPageData,
  RouteSheetSale,
  RouteSheetStatus,
  RouteSheetWithSales,
  UpdateRouteSheetStatusInput,
} from "../types";

export type {
  AddSalesToRouteSheetInput,
  CreateRouteSheetInput,
  DeleteRouteSheetInput,
  RemoveSaleFromRouteSheetInput,
  RouteSheetPageData,
  RouteSheetSale,
  RouteSheetStatus,
  RouteSheetWithSales,
  UpdateRouteSheetStatusInput,
} from "../types";

export type RouteSheet = Database["public"]["Tables"]["route_sheets"]["Row"];

type SalesOrderSale = Pick<
  Database["public"]["Tables"]["sales_orders"]["Row"],
  | "id"
  | "sale_number"
  | "total_amount"
  | "remittance_number"
  | "status"
  | "user_id"
  | "dispatched_at"
  | "sale_date"
  | "carrier_id"
> & {
  customer:
    | {
        business_name?: string | null;
        fantasy_name?: string | null;
        city?: string | null;
        delivery_city?: string | null;
        province?: string | null;
      }
    | Array<{
        business_name?: string | null;
        fantasy_name?: string | null;
        city?: string | null;
        delivery_city?: string | null;
        province?: string | null;
      }>
    | null;
};

const SALES_SELECT = `
  id,
  sale_number,
  total_amount,
  remittance_number,
  status,
  user_id,
  dispatched_at,
  sale_date,
  carrier_id,
  route_sheet_id,
  customer:customers(business_name, fantasy_name, city, delivery_city, province)
`;

function normalizeCustomerName(customer: SalesOrderSale["customer"]): string {
  const normalized = Array.isArray(customer) ? customer[0] : customer;
  return normalized?.business_name || normalized?.fantasy_name || "Cliente";
}

function normalizeCustomerField(
  customer: SalesOrderSale["customer"],
  field: "city" | "delivery_city" | "province"
): string | null {
  const normalized = Array.isArray(customer) ? customer[0] : customer;
  return normalized?.[field] || null;
}

function toRouteSheetSale(sale: SalesOrderSale): RouteSheetSale {
  return {
    id: sale.id,
    sale_number: sale.sale_number,
    customer_name: normalizeCustomerName(sale.customer),
    total_amount: Number(sale.total_amount ?? 0),
    remittance_number: sale.remittance_number,
    status: sale.status as SalesOrderStatus,
    user_id: sale.user_id,
    dispatched_at: sale.dispatched_at,
    sale_date: sale.sale_date,
    carrier_id: sale.carrier_id,
    customer_city: normalizeCustomerField(sale.customer, "city"),
    customer_delivery_city: normalizeCustomerField(
      sale.customer,
      "delivery_city"
    ),
    customer_province: normalizeCustomerField(sale.customer, "province"),
  };
}

function isOwnSale(
  userId: string | null,
  saleUserId: string | null,
  isAdmin: boolean,
  canManageAll: boolean
): boolean {
  if (isAdmin || canManageAll) {
    return true;
  }
  return Boolean(userId) && saleUserId === userId;
}

export async function getRouteSheetPageData(
  orgSlug: string
): Promise<RouteSheetPageData> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return { routeSheets: [], availableSales: [] };
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canRead) {
    throw new Error("No tienes permisos para ver hojas de ruta");
  }

  let salesQuery = supabase
    .from("sales_orders")
    .select(SALES_SELECT)
    .eq("organization_id", org.id)
    .not("route_sheet_id", "is", null);

  let availableQuery = supabase
    .from("sales_orders")
    .select(SALES_SELECT)
    .eq("organization_id", org.id)
    .is("route_sheet_id", null)
    .eq("status", "CONFIRMED");

  if (accessContext.scope === "own" && accessContext.userId) {
    salesQuery = salesQuery.eq("user_id", accessContext.userId);
    availableQuery = availableQuery.eq("user_id", accessContext.userId);
  }

  const [
    { data: sheets, error: sheetsError },
    { data: sales, error: salesError },
    { data: available, error: availableError },
  ] = await Promise.all([
    supabase
      .from("route_sheets")
      .select("*, carrier:carriers(id, name)")
      .eq("organization_id", org.id)
      .order("scheduled_date", { ascending: false }),
    salesQuery,
    availableQuery,
  ]);

  if (sheetsError || salesError || availableError) {
    throw new Error(
      `Error al obtener hojas de ruta: ${
        (sheetsError ?? salesError ?? availableError)?.message ??
        "error desconocido"
      }`
    );
  }

  const salesByRouteSheet = new Map<string, RouteSheetSale[]>();
  for (const sale of (sales ?? []) as unknown as SalesOrderSale[]) {
    const routeSheetId = (sale as { route_sheet_id?: string | null })
      .route_sheet_id;
    if (!routeSheetId) {
      continue;
    }
    const list = salesByRouteSheet.get(routeSheetId) ?? [];
    list.push(toRouteSheetSale(sale));
    salesByRouteSheet.set(routeSheetId, list);
  }

  const routeSheets: RouteSheetWithSales[] = (sheets ?? [])
    .filter((sheet) => {
      if (accessContext.scope === "own") {
        return salesByRouteSheet.has(sheet.id);
      }
      return true;
    })
    .map((sheet) => ({
      ...sheet,
      carrier: Array.isArray(sheet.carrier)
        ? (sheet.carrier[0] ?? null)
        : (sheet.carrier ?? null),
      sales: (salesByRouteSheet.get(sheet.id) ?? []).sort((a, b) =>
        String(a.sale_number ?? "").localeCompare(
          String(b.sale_number ?? ""),
          undefined,
          {
            numeric: true,
          }
        )
      ),
    }));

  const availableSales = ((available ?? []) as unknown as SalesOrderSale[])
    .map(toRouteSheetSale)
    .sort((a, b) =>
      String(a.sale_number ?? "").localeCompare(
        String(b.sale_number ?? ""),
        undefined,
        {
          numeric: true,
        }
      )
    );

  return { routeSheets, availableSales };
}

export async function createRouteSheet(
  input: CreateRouteSheetInput
): Promise<Database["public"]["Tables"]["route_sheets"]["Row"]> {
  if (!input.carrierId) {
    throw new Error("El transporte es requerido");
  }

  if (!input.scheduledDate) {
    throw new Error("La fecha programada es requerida");
  }

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(input.orgSlug);

  if (!accessContext.canManage) {
    throw new Error("No tienes permisos para crear hojas de ruta");
  }

  const { data, error } = await supabase
    .from("route_sheets")
    .insert({
      organization_id: org.id,
      carrier_id: input.carrierId,
      scheduled_date: input.scheduledDate,
      notes: input.notes?.trim() || null,
      status: "PENDING",
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo crear la hoja de ruta: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo crear la hoja de ruta");
  }

  return data;
}

const ALLOWED_TRANSITIONS: Record<RouteSheetStatus, RouteSheetStatus[]> = {
  PENDING: ["IN_PROGRESS", "COMPLETED"],
  IN_PROGRESS: ["PENDING", "COMPLETED"],
  COMPLETED: ["IN_PROGRESS"],
};

export async function updateRouteSheetStatus(
  input: UpdateRouteSheetStatusInput
): Promise<void> {
  const { orgSlug, routeSheetId, status } = input;

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canManage) {
    throw new Error("No tienes permisos para gestionar hojas de ruta");
  }

  const { data: sheet, error: sheetError } = await supabase
    .from("route_sheets")
    .select("id, carrier_id, status")
    .eq("id", routeSheetId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (sheetError || !sheet) {
    throw new Error("Hoja de ruta no encontrada");
  }

  const current = sheet.status as RouteSheetStatus;

  if (current === status) {
    return;
  }

  if (!ALLOWED_TRANSITIONS[current]?.includes(status)) {
    throw new Error("Transición de estado no permitida");
  }

  const shouldDispatch = current === "PENDING" && status === "IN_PROGRESS";

  if (shouldDispatch) {
    await dispatchPendingRouteSheetSales({
      orgSlug,
      orgId: org.id,
      routeSheetId,
      carrierId: sheet.carrier_id,
      accessContext,
    });
  }

  const { error } = await supabase
    .from("route_sheets")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", routeSheetId)
    .eq("organization_id", org.id);

  if (error) {
    throw new Error(`No se pudo actualizar la hoja de ruta: ${error.message}`);
  }
}

async function dispatchPendingRouteSheetSales(params: {
  orgSlug: string;
  orgId: string;
  routeSheetId: string;
  carrierId: string | null;
  accessContext: Awaited<ReturnType<typeof getSalesAccessContext>>;
}): Promise<void> {
  const { orgSlug, orgId, routeSheetId, carrierId, accessContext } = params;

  const supabase = await createClient();

  const { data: sales, error: salesError } = await supabase
    .from("sales_orders")
    .select("id, status, remittance_number, user_id")
    .eq("organization_id", orgId)
    .eq("route_sheet_id", routeSheetId)
    .eq("status", "CONFIRMED");

  if (salesError) {
    throw new Error(
      `Error al obtener las ventas de la hoja de ruta: ${salesError.message}`
    );
  }

  const pendingSales = sales ?? [];

  const unauthorizedSale = pendingSales.find(
    (sale) =>
      !isOwnSale(
        accessContext.userId,
        sale.user_id,
        accessContext.isOrganizationAdmin,
        accessContext.canManageAll
      )
  );
  if (unauthorizedSale) {
    throw new Error(
      "Esta hoja incluye ventas de otro usuario que no podés despachar. Pedí a un administrador que comience la hoja."
    );
  }

  const missingRemittance = pendingSales.find(
    (sale) => !sale.remittance_number?.trim()
  );
  if (missingRemittance) {
    throw new Error(
      "Una o más ventas de esta hoja no tienen número de remito asignado. Asigná los remitos y volvé a intentar."
    );
  }

  for (const sale of pendingSales) {
    await dispatchSaleOrder({
      orgSlug,
      saleId: sale.id,
      remittanceNumber: sale.remittance_number as string,
      carrierId,
      routeSheetId,
    });
  }
}

async function getRouteSheetForOrg(orgId: string, routeSheetId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("route_sheets")
    .select("id, carrier_id, status")
    .eq("id", routeSheetId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Hoja de ruta no encontrada");
  }

  return data;
}

export async function addSalesToRouteSheet(
  input: AddSalesToRouteSheetInput
): Promise<void> {
  const { orgSlug, routeSheetId, saleIds, remittances } = input;

  if (!saleIds?.length) {
    throw new Error("Seleccioná al menos una venta");
  }

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canManage) {
    throw new Error("No tienes permisos para gestionar hojas de ruta");
  }

  const sheet = await getRouteSheetForOrg(org.id, routeSheetId);

  if (sheet.status === "COMPLETED") {
    throw new Error(
      "No se pueden agregar ventas a una hoja de ruta completada"
    );
  }

  const { data: sales, error: salesError } = await supabase
    .from("sales_orders")
    .select("id, status, user_id, remittance_number, route_sheet_id")
    .eq("organization_id", org.id)
    .in("id", saleIds);

  if (salesError || !sales) {
    throw new Error(
      `Error al obtener las ventas: ${salesError?.message ?? "error desconocido"}`
    );
  }

  const salesById = new Map(sales.map((sale) => [sale.id, sale]));

  const uniqueSaleIds = [...new Set(saleIds)];

  validateSalesForRouteSheet({
    saleIds: uniqueSaleIds,
    salesById,
    routeSheetId,
    remittances,
    accessContext,
  });

  for (const saleId of uniqueSaleIds) {
    const sale = salesById.get(saleId);

    if (!sale) {
      continue;
    }

    await assignSaleToRoute({
      orgId: org.id,
      routeSheetId,
      sale,
      remittance: remittances[saleId],
      supabase,
    });
  }
}

type RouteSheetSaleRow = {
  id: string;
  status: string;
  user_id: string | null;
  remittance_number: string | null;
  route_sheet_id: string | null;
};

function validateSalesForRouteSheet(params: {
  saleIds: string[];
  salesById: Map<string, RouteSheetSaleRow>;
  routeSheetId: string;
  remittances: Record<string, string>;
  accessContext: Awaited<ReturnType<typeof getSalesAccessContext>>;
}): void {
  for (const saleId of params.saleIds) {
    const sale = params.salesById.get(saleId);

    if (!sale) {
      throw new Error("Una de las ventas seleccionadas no existe");
    }

    assertSaleEligibleForRouteSheet({
      sale,
      routeSheetId: params.routeSheetId,
      remittance: params.remittances[saleId],
      accessContext: params.accessContext,
    });
  }
}

function assertSaleEligibleForRouteSheet(params: {
  sale: RouteSheetSaleRow;
  routeSheetId: string;
  remittance: string | undefined;
  accessContext: Awaited<ReturnType<typeof getSalesAccessContext>>;
}): void {
  const { sale, routeSheetId, remittance, accessContext } = params;

  if (sale.route_sheet_id && sale.route_sheet_id !== routeSheetId) {
    throw new Error("Una de las ventas ya pertenece a otra hoja de ruta");
  }

  if (
    !isOwnSale(
      accessContext.userId,
      sale.user_id,
      accessContext.isOrganizationAdmin,
      accessContext.canManageAll
    )
  ) {
    throw new Error("Solo podés agregar tus propias ventas");
  }

  const status = sale.status as SalesOrderStatus;

  if (status !== "CONFIRMED") {
    throw new Error(
      "Solo las ventas confirmadas pueden agregarse a la hoja de ruta"
    );
  }

  if (!remittance?.trim()) {
    throw new Error("Falta el número de remito para la venta seleccionada");
  }
}

type AssignSaleToRouteParams = {
  orgId: string;
  routeSheetId: string;
  sale: RouteSheetSaleRow;
  remittance: string | undefined;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

async function assignSaleToRoute({
  orgId,
  routeSheetId,
  sale,
  remittance,
  supabase,
}: AssignSaleToRouteParams): Promise<void> {
  if (!remittance?.trim()) {
    throw new Error("Falta el número de remito para la venta seleccionada");
  }

  const { error: updateError } = await supabase
    .from("sales_orders")
    .update({
      route_sheet_id: routeSheetId,
      remittance_number: remittance.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sale.id)
    .eq("organization_id", orgId);

  if (updateError) {
    throw new Error(
      `No se pudo agregar la venta a la hoja de ruta: ${updateError.message}`
    );
  }
}

export async function removeSaleFromRouteSheet(
  input: RemoveSaleFromRouteSheetInput
): Promise<void> {
  const { orgSlug, routeSheetId, saleId } = input;

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canManage) {
    throw new Error("No tienes permisos para gestionar hojas de ruta");
  }

  await getRouteSheetForOrg(org.id, routeSheetId);

  const { data: sale, error: saleError } = await supabase
    .from("sales_orders")
    .select("id, user_id, route_sheet_id")
    .eq("id", saleId)
    .eq("organization_id", org.id)
    .eq("route_sheet_id", routeSheetId)
    .maybeSingle();

  if (saleError || !sale) {
    throw new Error("La venta no pertenece a esta hoja de ruta");
  }

  if (
    !isOwnSale(
      accessContext.userId,
      sale.user_id,
      accessContext.isOrganizationAdmin,
      accessContext.canManageAll
    )
  ) {
    throw new Error("Solo podés quitar tus propias ventas");
  }

  const { error } = await supabase
    .from("sales_orders")
    .update({
      route_sheet_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", saleId)
    .eq("organization_id", org.id);

  if (error) {
    throw new Error(
      `No se pudo quitar la venta de la hoja de ruta: ${error.message}`
    );
  }
}

export async function deleteRouteSheet(
  input: DeleteRouteSheetInput
): Promise<void> {
  const { orgSlug, routeSheetId } = input;

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();
  const accessContext = await getSalesAccessContext(orgSlug);

  if (!accessContext.canManage) {
    throw new Error("No tienes permisos para eliminar hojas de ruta");
  }

  await getRouteSheetForOrg(org.id, routeSheetId);

  const { error: clearError } = await supabase
    .from("sales_orders")
    .update({
      route_sheet_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", org.id)
    .eq("route_sheet_id", routeSheetId);

  if (clearError) {
    throw new Error(
      `No se pudieron desvincular las ventas de la hoja de ruta: ${clearError.message}`
    );
  }

  const { error } = await supabase
    .from("route_sheets")
    .delete()
    .eq("id", routeSheetId)
    .eq("organization_id", org.id);

  if (error) {
    throw new Error(`No se pudo eliminar la hoja de ruta: ${error.message}`);
  }
}
