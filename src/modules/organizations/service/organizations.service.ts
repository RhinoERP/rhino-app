import { truncateMoney } from "@/lib/decimal";
import { isSuperAdmin } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { createClient } from "@/lib/supabase/server";
import type {
  DirectSaleConfig,
  Organization,
  UpdateDirectSaleConfigInput,
  UpsertDirectSalePriceInput,
} from "@/modules/organizations/types";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import type { Database, Json } from "@/types/supabase";

type MembershipWithOrg = {
  organization: Organization | null;
};

const DEFAULT_DIRECT_SALE_CONFIG: DirectSaleConfig = {
  direct_sale_tax_id: null,
  direct_sale_tax_ids: [],
  direct_sale_markup_percentage: 0,
  sales_enabled_payment_methods: [],
  sales_default_payment_method: "efectivo",
  sales_default_invoice_type: "NOTA_DE_VENTA",
  non_invoiced_payment_methods: [],
};

type JsonObject = { [key: string]: Json | undefined };

function isJsonObject(value: Json | null | undefined): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseDirectSaleConfigFromSettings(
  settings: Json | null | undefined
): DirectSaleConfig | null {
  if (!isJsonObject(settings)) {
    return null;
  }

  const directSaleSettings = settings.direct_sale;
  const directSaleSettingsObject = isJsonObject(directSaleSettings)
    ? directSaleSettings
    : {};
  const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === "string");
  };
  const readString = (primary: unknown, fallback: unknown): string | null => {
    if (typeof primary === "string") {
      return primary;
    }
    if (typeof fallback === "string") {
      return fallback;
    }
    return null;
  };

  const taxId = readString(directSaleSettingsObject.tax_id, null);
  const taxIdsFromDirectSale = toStringArray(directSaleSettingsObject.tax_ids);
  const taxIds =
    taxIdsFromDirectSale.length > 0
      ? taxIdsFromDirectSale
      : toStringArray(settings.sales_default_tax_ids);
  const markupPercentageValue = directSaleSettingsObject.markup_percentage;
  const markupPercentage =
    typeof markupPercentageValue === "number" &&
    Number.isFinite(markupPercentageValue)
      ? markupPercentageValue
      : DEFAULT_DIRECT_SALE_CONFIG.direct_sale_markup_percentage;
  const salesEnabledPaymentMethodsFromDirectSale = toStringArray(
    directSaleSettingsObject.sales_enabled_payment_methods
  ) as DirectSaleConfig["sales_enabled_payment_methods"];
  const salesEnabledPaymentMethodsFromRoot = toStringArray(
    settings.sales_enabled_payment_methods
  ) as DirectSaleConfig["sales_enabled_payment_methods"];
  const salesEnabledPaymentMethods =
    salesEnabledPaymentMethodsFromDirectSale.length > 0
      ? salesEnabledPaymentMethodsFromDirectSale
      : salesEnabledPaymentMethodsFromRoot;
  const nonInvoicedPaymentMethodsFromDirectSale = toStringArray(
    directSaleSettingsObject.non_invoiced_payment_methods
  ) as DirectSaleConfig["non_invoiced_payment_methods"];
  const nonInvoicedPaymentMethodsFromRoot = toStringArray(
    settings.non_invoiced_payment_methods
  ) as DirectSaleConfig["non_invoiced_payment_methods"];
  const nonInvoicedPaymentMethods =
    nonInvoicedPaymentMethodsFromDirectSale.length > 0
      ? nonInvoicedPaymentMethodsFromDirectSale
      : nonInvoicedPaymentMethodsFromRoot;
  const defaultPaymentMethod =
    (readString(
      directSaleSettingsObject.sales_default_payment_method,
      settings.sales_default_payment_method
    ) as DirectSaleConfig["sales_default_payment_method"] | null) ??
    DEFAULT_DIRECT_SALE_CONFIG.sales_default_payment_method;
  const defaultInvoiceType =
    (readString(
      directSaleSettingsObject.sales_default_invoice_type,
      settings.sales_default_invoice_type
    ) as DirectSaleConfig["sales_default_invoice_type"] | null) ??
    DEFAULT_DIRECT_SALE_CONFIG.sales_default_invoice_type;

  return {
    direct_sale_tax_id: taxId,
    direct_sale_tax_ids: taxIds,
    direct_sale_markup_percentage: markupPercentage,
    sales_enabled_payment_methods: salesEnabledPaymentMethods,
    sales_default_payment_method: defaultPaymentMethod,
    sales_default_invoice_type: defaultInvoiceType,
    non_invoiced_payment_methods: nonInvoicedPaymentMethods,
  };
}

function mergeDirectSaleConfigIntoSettings(
  settings: Json | null | undefined,
  input: UpdateDirectSaleConfigInput
): Json {
  const baseSettings = isJsonObject(settings) ? settings : {};
  const currentDirectSale = isJsonObject(baseSettings.direct_sale)
    ? baseSettings.direct_sale
    : {};

  return {
    ...baseSettings,
    sales_default_tax_ids: input.directSaleTaxIds,
    sales_enabled_payment_methods: input.salesEnabledPaymentMethods,
    sales_default_payment_method: input.salesDefaultPaymentMethod,
    sales_default_invoice_type: input.salesDefaultInvoiceType,
    non_invoiced_payment_methods: input.nonInvoicedPaymentMethods,
    direct_sale: {
      ...currentDirectSale,
      tax_id: input.directSaleTaxId,
      tax_ids: input.directSaleTaxIds,
      markup_percentage: input.directSaleMarkupPercentage,
      sales_enabled_payment_methods: input.salesEnabledPaymentMethods,
      sales_default_payment_method: input.salesDefaultPaymentMethod,
      sales_default_invoice_type: input.salesDefaultInvoiceType,
      non_invoiced_payment_methods: input.nonInvoicedPaymentMethods,
    },
  };
}

async function getDirectSaleConfigFallbackByOrgId(
  orgId: string
): Promise<DirectSaleConfig> {
  const supabase = await createClient();

  const { data: fallbackTax, error: fallbackTaxError } = await supabase
    .from("taxes")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .eq("is_favorite_direct_sales", true)
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackTaxError) {
    throw new Error(
      `Error fetching direct sale fallback tax: ${fallbackTaxError.message}`
    );
  }

  return {
    direct_sale_tax_id: fallbackTax?.id ?? null,
    direct_sale_tax_ids: fallbackTax?.id ? [fallbackTax.id] : [],
    direct_sale_markup_percentage:
      DEFAULT_DIRECT_SALE_CONFIG.direct_sale_markup_percentage,
    sales_enabled_payment_methods:
      DEFAULT_DIRECT_SALE_CONFIG.sales_enabled_payment_methods,
    sales_default_payment_method:
      DEFAULT_DIRECT_SALE_CONFIG.sales_default_payment_method,
    sales_default_invoice_type:
      DEFAULT_DIRECT_SALE_CONFIG.sales_default_invoice_type,
    non_invoiced_payment_methods:
      DEFAULT_DIRECT_SALE_CONFIG.non_invoiced_payment_methods,
  };
}

export type OrganizationLayoutData = {
  user: {
    email?: string;
    user_metadata?: {
      full_name?: string;
      [key: string]: unknown;
    };
    picture?: string;
    [key: string]: unknown;
  } | null;
  organizations: Organization[];
  currentOrganization: Organization;
  permissions: string[];
};

/**
 * Gets all organizations in the platform
 * Only accessible by superadmins
 */
export async function getAllOrganizations(): Promise<Organization[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, cuit, created_at, slug, is_active, wholesale_enabled, pos_enabled, production_enabled, accounting_enabled, sales_advances_enabled, supplier_differentiated_credits"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error fetching organizations: ${error.message}`);
  }

  return (data as unknown as Organization[]) ?? [];
}

/**
 * Gets the total count of organizations
 */
export async function getOrganizationsCount(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("organizations")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Error counting organizations: ${error.message}`);
  }

  return count || 0;
}

/**
 * Gets the total count of unique users across all organizations
 * Only accessible by superadmins
 */
export async function getTotalUniqueUsers(): Promise<number> {
  try {
    const supabase = createAdminClient();

    const { data: allMembers, error } = await supabase
      .from("organization_members")
      .select("user_id");

    if (error) {
      console.error("Error fetching unique users count:", error);
      return 0;
    }

    if (!allMembers || allMembers.length === 0) {
      return 0;
    }

    // Get unique user_ids
    const uniqueUserIds = new Set(allMembers.map((m) => m.user_id));
    return uniqueUserIds.size;
  } catch (error) {
    console.error("Exception in getTotalUniqueUsers:", error);
    return 0;
  }
}

/**
 * Gets organization by slug
 */
export async function getOrganizationBySlug(
  slug: string
): Promise<Organization | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, cuit, created_at, slug, is_active, wholesale_enabled, pos_enabled, production_enabled, accounting_enabled, sales_advances_enabled, supplier_differentiated_credits"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`Error fetching organization: ${error.message}`);
  }

  return (data as unknown as Organization) ?? null;
}

export async function getDirectSaleConfigByOrgSlug(
  orgSlug: string
): Promise<DirectSaleConfig> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Error fetching direct sale configuration: ${error.message}`
    );
  }

  const settingsConfig = parseDirectSaleConfigFromSettings(data?.settings);

  return settingsConfig ?? getDirectSaleConfigFallbackByOrgId(org.id);
}

export async function updateDirectSaleConfigByOrgSlug(
  orgSlug: string,
  input: UpdateDirectSaleConfigInput
): Promise<DirectSaleConfig> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const uniqueTaxIds = [...new Set(input.directSaleTaxIds.filter(Boolean))];
  const taxIdsToValidate = [
    ...new Set(
      [input.directSaleTaxId, ...uniqueTaxIds].filter(
        (value): value is string => Boolean(value)
      )
    ),
  ];

  if (taxIdsToValidate.length > 0) {
    const { data: taxes, error: taxesError } = await supabase
      .from("taxes")
      .select("id")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .in("id", taxIdsToValidate);

    if (taxesError) {
      throw new Error(`Error validating taxes: ${taxesError.message}`);
    }

    const validTaxIds = new Set((taxes ?? []).map((tax) => tax.id));
    const invalidTaxId = taxIdsToValidate.find(
      (taxId) => !validTaxIds.has(taxId)
    );
    if (invalidTaxId) {
      throw new Error(
        "El impuesto seleccionado no pertenece a la organización"
      );
    }
  }

  if (
    input.salesEnabledPaymentMethods.length > 0 &&
    !input.salesEnabledPaymentMethods.includes(input.salesDefaultPaymentMethod)
  ) {
    throw new Error(
      "El método de pago predeterminado debe estar dentro de los métodos habilitados"
    );
  }

  const { data: currentSettings, error: currentSettingsError } = await supabase
    .from("organization_settings")
    .select("settings")
    .eq("organization_id", org.id)
    .maybeSingle();

  if (currentSettingsError) {
    throw new Error(
      `Error fetching organization settings: ${currentSettingsError.message}`
    );
  }

  const settings = mergeDirectSaleConfigIntoSettings(
    currentSettings?.settings,
    input
  );

  const { data, error } = await supabase
    .from("organization_settings")
    .upsert(
      {
        organization_id: org.id,
        settings,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "organization_id",
      }
    )
    .select("settings")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Error updating direct sale configuration: ${error.message}`
    );
  }

  const updatedConfig = parseDirectSaleConfigFromSettings(data?.settings);

  if (!updatedConfig) {
    return {
      direct_sale_tax_id: input.directSaleTaxId,
      direct_sale_tax_ids: uniqueTaxIds,
      direct_sale_markup_percentage: input.directSaleMarkupPercentage,
      sales_enabled_payment_methods: input.salesEnabledPaymentMethods,
      sales_default_payment_method: input.salesDefaultPaymentMethod,
      sales_default_invoice_type: input.salesDefaultInvoiceType,
      non_invoiced_payment_methods: input.nonInvoicedPaymentMethods,
    };
  }

  return updatedConfig;
}

export async function upsertDirectSalePrices(
  orgSlug: string,
  prices: UpsertDirectSalePriceInput[]
): Promise<number> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  if (prices.length === 0) {
    return 0;
  }

  const supabase = await createClient();
  const productIds = [...new Set(prices.map((price) => price.productId))];

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", org.id)
    .in("id", productIds);

  if (productsError) {
    throw new Error(`Error validating products: ${productsError.message}`);
  }

  const existingProductIds = new Set(
    (products ?? []).map((product) => product.id)
  );
  const invalidProductId = productIds.find(
    (productId) => !existingProductIds.has(productId)
  );

  if (invalidProductId) {
    throw new Error(
      `El producto ${invalidProductId} no pertenece a la organización`
    );
  }

  const updatedAt = new Date().toISOString();
  const rows: Database["public"]["Tables"]["direct_sale_prices"]["Insert"][] =
    prices.map((item) => ({
      organization_id: org.id,
      product_id: item.productId,
      price: truncateMoney(item.price),
      updated_at: updatedAt,
    }));

  const { error } = await supabase.from("direct_sale_prices").upsert(rows, {
    onConflict: "organization_id,product_id",
  });

  if (error) {
    throw new Error(`Error updating direct sale prices: ${error.message}`);
  }

  return rows.length;
}

/**
 * Gets all organizations that the current user is a member of
 */
export async function getUserOrganizations(): Promise<Organization[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(id, name, cuit, created_at, slug, is_active, wholesale_enabled, pos_enabled, production_enabled, accounting_enabled, sales_advances_enabled, supplier_differentiated_credits)"
    )
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Error fetching user organizations: ${error.message}`);
  }

  if (!memberships) {
    return [];
  }

  return memberships
    .map((m) => (m as unknown as MembershipWithOrg).organization)
    .filter((org): org is Organization => org !== null);
}

/**
 * Resolves where a logged-in user should be redirected:
 * - superadmin -> /admin
 * - 1+ org memberships -> /org/[first-slug]/[first-accessible-page]
 * - 0 orgs -> /no-org
 * - no user -> /auth/login (or public landing page)
 */
export async function resolveUserRedirect(): Promise<string> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return "/auth/login";
  }

  const isAdmin = await isSuperAdmin();
  if (isAdmin) {
    return "/admin";
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_members")
    .select(
      "organization:organizations(slug, is_active, wholesale_enabled, pos_enabled, production_enabled, accounting_enabled, sales_advances_enabled, supplier_differentiated_credits)"
    )
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (membershipsError) {
    return "/auth/login";
  }

  if (!memberships || memberships.length === 0) {
    return "/no-org";
  }

  const validOrgs = memberships
    .map((m) => {
      const org = (m as unknown as MembershipWithOrg).organization;
      return org?.slug && org.is_active === true ? org : null;
    })
    .filter((org): org is Organization => org !== null);

  if (validOrgs.length === 0) {
    return "/no-org";
  }

  const firstOrg = validOrgs[0];
  const firstOrgSlug = firstOrg.slug;

  if (!firstOrgSlug) {
    return "/no-org";
  }

  const { data: permissions } = await supabase.rpc(
    "get_user_org_permissions_by_slug",
    {
      target_org_slug: firstOrgSlug,
    }
  );

  const userPermissions = (permissions ?? []) as string[];

  const routes = [
    { path: "", permission: "dashboard.read" },
    { path: "/ventas", permission: "sales.read", module: "wholesale" as const },
    { path: "/venta-directa", permission: "pos.read", module: "pos" as const },
    {
      path: "/cobranzas",
      permission: "collections.read",
    },
    {
      path: "/finanzas",
      permission: "finances.read",
    },
    { path: "/clientes", permission: "customers.read" },
    { path: "/arca/facturas", permission: "arca.read" },
    { path: "/notas-de-credito", permission: "creditnotes.read" },
    { path: "/notas-de-debito", permission: "debitnotes.read" },
    { path: "/compras", permission: "purchases.read" },
    { path: "/proveedores", permission: "suppliers.read" },
    { path: "/stock", permission: "inventory.read" },
    { path: "/precios/listas-de-precios", permission: "pricelists.read" },
  ];

  for (const route of routes) {
    if (
      userPermissions.includes(route.permission) &&
      (!route.module || isOrganizationModuleEnabled(firstOrg, route.module))
    ) {
      return `/org/${firstOrgSlug}${route.path}`;
    }
  }

  return `/org/${firstOrgSlug}`;
}

/**
 * Fetches user data, organizations, and verifies membership in parallel.
 */
export async function getOrganizationLayoutData(
  orgSlug: string
): Promise<OrganizationLayoutData | null> {
  const supabase = await createClient();

  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  const userClaims = authData?.claims;

  if (!userId) {
    return null;
  }

  const [organizationsResult, permissionsResult] = await Promise.all([
    supabase
      .from("organization_members")
      .select(
        "organization:organizations(id, name, cuit, created_at, slug, is_active, wholesale_enabled, pos_enabled, production_enabled, accounting_enabled, sales_advances_enabled, supplier_differentiated_credits)"
      )
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase.rpc("get_user_org_permissions_by_slug", {
      target_org_slug: orgSlug,
    }),
  ]);

  if (organizationsResult.error) {
    console.error("Error fetching organizations", organizationsResult.error);
    return null;
  }

  const memberships =
    (organizationsResult.data as unknown as MembershipWithOrg[]) ?? [];
  const organizations = memberships
    .map((m) => m.organization)
    .filter(
      (org): org is Organization => org !== null && org.is_active === true
    );

  const requestedOrg = organizations.find((org) => org.slug === orgSlug);
  if (!requestedOrg) {
    return null;
  }

  const permissions = permissionsResult.error
    ? []
    : ((permissionsResult.data ?? []) as string[]);

  return {
    user: userClaims as OrganizationLayoutData["user"],
    organizations,
    currentOrganization: requestedOrg,
    permissions,
  };
}
