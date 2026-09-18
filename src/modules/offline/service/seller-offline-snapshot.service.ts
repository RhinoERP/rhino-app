import { createClient } from "@/lib/supabase/server";
import { getOrganizationSalesMembersBySlug } from "@/modules/organizations/service/members.service";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { organizationSettingsSchema } from "@/modules/organizations/types/organization-settings";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import {
  getSaleProducts,
  getSalesAccessContext,
} from "@/modules/sales/service/sales.service";
import { getSalesPriceListsByOrgSlug } from "@/modules/sales-price-lists/service/sales-price-lists.service";
import { getActiveTaxesByOrgSlug } from "@/modules/taxes/service/taxes.service";
import {
  SELLER_OFFLINE_SNAPSHOT_SCHEMA_VERSION,
  type SellerOfflineSnapshotV1,
  sellerOfflineSnapshotV1Schema,
} from "../contracts/seller-offline-snapshot";

export type SellerOfflineSnapshotErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "OFFLINE_DISABLED"
  | "UNSUPPORTED_ORGANIZATION";

export class SellerOfflineSnapshotError extends Error {
  readonly code: SellerOfflineSnapshotErrorCode;
  readonly status: number;

  constructor(
    code: SellerOfflineSnapshotErrorCode,
    message: string,
    status: number
  ) {
    super(message);
    this.name = "SellerOfflineSnapshotError";
    this.code = code;
    this.status = status;
  }
}

async function getOfflineSettings(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo obtener la configuracion offline: ${error.message}`
    );
  }

  return organizationSettingsSchema.parse(data?.settings ?? {});
}

async function getVisibleCustomers(params: {
  organizationId: string;
  userId: string;
  canViewAll: boolean;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select(
      "id,business_name,fantasy_name,client_number,cuit,city,assigned_seller_id,sales_price_list_id,due_days,tax_condition"
    )
    .eq("organization_id", params.organizationId)
    .eq("is_active", true)
    .order("business_name", { ascending: true });

  if (!params.canViewAll) {
    query = query.or(
      `assigned_seller_id.eq.${params.userId},assigned_seller_id.is.null`
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`No se pudieron obtener los clientes: ${error.message}`);
  }

  return (data ?? []).map((customer) => ({
    id: customer.id,
    businessName: customer.business_name,
    fantasyName: customer.fantasy_name,
    clientNumber: customer.client_number,
    cuit: customer.cuit,
    city: customer.city,
    assignedSellerId: customer.assigned_seller_id,
    salesPriceListId: customer.sales_price_list_id,
    dueDays: customer.due_days,
    taxCondition: customer.tax_condition,
  }));
}

async function getCustomerPriceAssignments(params: {
  organizationId: string;
  customerIds: string[];
}) {
  if (params.customerIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const assignments: Array<{
    customerId: string;
    supplierId: string;
    purchasePriceListId: string | null;
    salesPriceListId: string | null;
  }> = [];

  for (let offset = 0; offset < params.customerIds.length; offset += 100) {
    const customerIds = params.customerIds.slice(offset, offset + 100);
    const { data, error } = await supabase
      .from("customer_supplier_assignments")
      .select("customer_id,supplier_id,price_list_id,sales_price_list_id")
      .eq("organization_id", params.organizationId)
      .in("customer_id", customerIds);

    if (error) {
      throw new Error(
        `No se pudieron obtener las asignaciones de precios: ${error.message}`
      );
    }

    assignments.push(
      ...(data ?? []).map((assignment) => ({
        customerId: assignment.customer_id,
        supplierId: assignment.supplier_id,
        purchasePriceListId: assignment.price_list_id,
        salesPriceListId: assignment.sales_price_list_id,
      }))
    );
  }

  return assignments;
}

async function getPurchasePriceListItems(params: {
  priceListIds: string[];
  productIds: Set<string>;
}) {
  const priceListIds = [...new Set(params.priceListIds)];
  if (priceListIds.length === 0 || params.productIds.size === 0) {
    return [];
  }

  const supabase = await createClient();
  const items: Array<{
    priceListId: string;
    productId: string;
    costPrice: number;
    margin: number | null;
  }> = [];

  for (let offset = 0; offset < priceListIds.length; offset += 100) {
    const ids = priceListIds.slice(offset, offset + 100);
    const { data, error } = await supabase
      .from("price_list_items")
      .select(
        "price_list_id,product_id,cost_price,product:products(profit_margin)"
      )
      .in("price_list_id", ids);

    if (error) {
      throw new Error(
        `No se pudieron obtener los precios por proveedor: ${error.message}`
      );
    }

    for (const item of data ?? []) {
      if (!params.productIds.has(item.product_id)) {
        continue;
      }
      const product = item.product as { profit_margin: number | null } | null;
      items.push({
        priceListId: item.price_list_id,
        productId: item.product_id,
        costPrice: item.cost_price ?? 0,
        margin: product?.profit_margin ?? null,
      });
    }
  }

  return items;
}

export async function createSellerOfflineSnapshot(
  orgSlug: string
): Promise<SellerOfflineSnapshotV1> {
  const access = await getSalesAccessContext(orgSlug);
  if (!access.userId) {
    throw new SellerOfflineSnapshotError(
      "AUTH_REQUIRED",
      "La sesion no es valida",
      401
    );
  }
  if (!access.canManage) {
    throw new SellerOfflineSnapshotError(
      "FORBIDDEN",
      "No tienes permisos para preparar datos offline",
      403
    );
  }

  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization?.id || organization.is_active === false) {
    throw new SellerOfflineSnapshotError(
      "NOT_FOUND",
      "Organizacion no encontrada",
      404
    );
  }
  if (!isOrganizationModuleEnabled(organization, "wholesale")) {
    throw new SellerOfflineSnapshotError(
      "UNSUPPORTED_ORGANIZATION",
      "La organizacion no tiene ventas mayoristas habilitadas",
      422
    );
  }
  if (isOrganizationModuleEnabled(organization, "production")) {
    throw new SellerOfflineSnapshotError(
      "UNSUPPORTED_ORGANIZATION",
      "Las organizaciones con produccion no participan del MVP offline",
      422
    );
  }

  const settings = await getOfflineSettings(organization.id);
  if (!settings.seller_offline_snapshot_enabled) {
    throw new SellerOfflineSnapshotError(
      "OFFLINE_DISABLED",
      "Los datos offline no estan habilitados para esta organizacion",
      403
    );
  }

  const [customers, products, taxes, sellers, salesPriceLists] =
    await Promise.all([
      getVisibleCustomers({
        organizationId: organization.id,
        userId: access.userId,
        canViewAll: access.canViewAll,
      }),
      getSaleProducts(orgSlug),
      getActiveTaxesByOrgSlug(orgSlug),
      getOrganizationSalesMembersBySlug(orgSlug),
      getSalesPriceListsByOrgSlug(orgSlug),
    ]);
  const customerPriceAssignments = await getCustomerPriceAssignments({
    organizationId: organization.id,
    customerIds: customers.map((customer) => customer.id),
  });
  const offlineProducts = products.filter((product) => !product.hasVariants);
  const purchasePriceListItems = await getPurchasePriceListItems({
    priceListIds: customerPriceAssignments.flatMap((assignment) =>
      assignment.purchasePriceListId ? [assignment.purchasePriceListId] : []
    ),
    productIds: new Set(offlineProducts.map((product) => product.id)),
  });
  const generatedAt = new Date();
  const expiresAt = new Date(
    generatedAt.getTime() +
      settings.seller_offline_snapshot_ttl_hours * 3_600_000
  );

  return sellerOfflineSnapshotV1Schema.parse({
    schemaVersion: SELLER_OFFLINE_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: crypto.randomUUID(),
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ownerUserId: access.userId,
    organizationId: organization.id,
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      cuit: organization.cuit,
    },
    customers,
    products: offlineProducts.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      brand: product.brand ?? null,
      price: product.price,
      currency: product.currency,
      supplierId: product.supplierId ?? null,
      supplierName: product.supplierName ?? null,
      categoryId: product.categoryId ?? null,
      categoryName: product.categoryName ?? null,
      unitOfMeasure: product.unitOfMeasure,
      tracksStockUnits: product.tracksStockUnits,
      totalQuantity: product.totalQuantity,
      totalUnitQuantity: product.totalUnitQuantity,
      averageQuantityPerUnit: product.averageQuantityPerUnit,
      weightPerUnit: product.weightPerUnit ?? null,
      unitsPerBox: product.unitsPerBox ?? null,
      boxesPerPallet: product.boxesPerPallet ?? null,
      taxes: (product.taxes ?? []).map((tax) => ({
        taxId: tax.taxId,
        name: tax.name,
        rate: tax.rate,
        code: tax.taxCodeSnapshot ?? null,
      })),
    })),
    taxes: taxes.map((tax) => ({
      id: tax.id,
      name: tax.name,
      rate: tax.rate,
      code: tax.code,
      isFavoriteSales: tax.is_favorite_sales,
    })),
    sellers: sellers.flatMap((seller) => {
      if (!seller.user?.id) {
        return [];
      }
      return [
        {
          id: seller.user.id,
          name: seller.user.name?.trim() || "Vendedor",
        },
      ];
    }),
    salesPriceLists: salesPriceLists.map((priceList) => ({
      id: priceList.id,
      name: priceList.name,
      type: priceList.type,
      value: priceList.value,
      validFrom: priceList.valid_from,
    })),
    customerPriceAssignments,
    purchasePriceListItems,
    settings: {
      purgeAfterHours: settings.seller_offline_purge_after_hours,
      configurablePriceListsEnabled: settings.configurable_price_lists_enabled,
      dueDaysEnabled: settings.due_days_enabled,
      dueDaysDefault: settings.due_days_default,
      defaultTaxIds: settings.sales_default_tax_ids,
      enabledPaymentMethods: settings.sales_enabled_payment_methods,
      defaultPaymentMethod: settings.sales_default_payment_method,
      defaultInvoiceType: settings.sales_default_invoice_type,
    },
  });
}
