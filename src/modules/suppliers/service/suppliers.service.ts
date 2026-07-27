import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import type {
  PaginatedResult,
  PaginationParams,
  Supplier,
  SupplierMetrics,
  SupplierPurchase,
  SupplierWithStats,
} from "../types";

// Re-export types for backward compatibility
export type {
  PaginatedResult,
  PaginationParams,
  Supplier,
  SupplierMetrics,
  SupplierPurchase,
  SupplierWithStats,
} from "../types";

export type CreateSupplierInput = {
  orgSlug: string;
  name: string;
  cuit?: string;
  phone?: string;
  email?: string;
  address?: string;
  contact_name?: string;
  payment_terms?: string;
  notes?: string;
};
export type UpdateSupplierInput = CreateSupplierInput & {
  supplierId: string;
};

/**
 * Returns all suppliers that belong to the organization identified by the slug.
 */
export async function getSuppliersByOrgSlug(
  orgSlug: string
): Promise<Supplier[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Error fetching suppliers: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Returns a supplier by id, ensuring it belongs to the given organization slug.
 */
export async function getSupplierById(
  orgSlug: string,
  supplierId: string
): Promise<Supplier | null> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Error obteniendo proveedor: ${error.message}`);
  }

  return data ?? null;
}

/**
 * Updates an existing supplier that belongs to the given organization.
 */
export async function updateSupplierForOrg(
  input: UpdateSupplierInput
): Promise<Supplier> {
  if (!input.name?.trim()) {
    throw new Error("El nombre del proveedor es requerido");
  }

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const sanitize = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  const { data, error } = await supabase
    .from("suppliers")
    .update({
      name: input.name.trim(),
      cuit: sanitize(input.cuit),
      phone: sanitize(input.phone),
      email: sanitize(input.email),
      address: sanitize(input.address),
      contact_name: sanitize(input.contact_name),
      payment_terms: sanitize(input.payment_terms),
      notes: sanitize(input.notes),
    })
    .eq("id", input.supplierId)
    .eq("organization_id", org.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo actualizar el proveedor: ${error.message}`);
  }

  if (!data) {
    throw new Error("Proveedor no encontrado o no pertenece a la organización");
  }

  return data;
}

/**
 * Creates a new supplier for the given organization slug.
 */
export async function createSupplierForOrg(
  input: CreateSupplierInput
): Promise<Supplier> {
  if (!input.name?.trim()) {
    throw new Error("El nombre del proveedor es requerido");
  }

  const org = await getOrganizationBySlug(input.orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  const sanitize = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: org.id,
      name: input.name.trim(),
      cuit: sanitize(input.cuit),
      phone: sanitize(input.phone),
      email: sanitize(input.email),
      address: sanitize(input.address),
      contact_name: sanitize(input.contact_name),
      payment_terms: sanitize(input.payment_terms),
      notes: sanitize(input.notes),
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo crear el proveedor: ${error.message}`);
  }

  if (!data) {
    throw new Error("No se pudo crear el proveedor");
  }

  return data;
}

/**
 * Deletes a supplier by id.
 */
export async function deleteSupplierById(
  supplierId: string,
  orgId: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("organization_id", orgId);

  if (error) {
    throw new Error(`No se pudo eliminar el proveedor: ${error.message}`);
  }
}

/**
 * Returns a paginated list of suppliers for the given organization.
 */
export async function getSuppliersPaginated(
  orgSlug: string,
  params: PaginationParams
): Promise<PaginatedResult<Supplier>> {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(1, params.pageSize));

  const ALLOWED_SORT_COLUMNS: string[] = [
    "name",
    "cuit",
    "created_at",
    "phone",
    "email",
  ];
  const sort = (params.sort ?? []).filter((s) =>
    ALLOWED_SORT_COLUMNS.includes(s.id)
  );

  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return {
      data: [],
      totalCount: 0,
      page,
      pageSize,
    };
  }

  const supabase = await createClient();

  const query = supabase
    .from("suppliers")
    .select("*", { count: "exact" })
    .eq("organization_id", org.id);

  if (params.search) {
    query.or(`name.ilike.%${params.search}%,cuit.ilike.%${params.search}%`);
  }

  if (sort && sort.length > 0) {
    for (const s of sort) {
      query.order(s.id, { ascending: !s.desc });
    }
  } else {
    query.order("created_at", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Error fetching suppliers: ${error.message}`);
  }

  return {
    data: data ?? [],
    totalCount: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Returns metrics (aggregations) for suppliers in the organization.
 */
export async function getSupplierMetrics(
  orgSlug: string
): Promise<SupplierMetrics> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return { totalSuppliers: 0 };
  }

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("suppliers")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org.id);

  if (error) {
    throw new Error(`Error fetching supplier metrics: ${error.message}`);
  }

  return {
    totalSuppliers: count ?? 0,
  };
}

/**
 * Returns all suppliers (unpaginated) for export purposes.
 */
export async function getAllSuppliersForExport(
  orgSlug: string
): Promise<Supplier[]> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    return [];
  }

  // TODO: add suppliers.read permission check

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("organization_id", org.id)
    .order("name", { ascending: true })
    .limit(10_000);

  if (error) {
    console.error("Error fetching suppliers for export:", error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Returns a supplier with purchase statistics and recent purchases.
 */
export async function getSupplierWithStats(
  orgSlug: string,
  supplierId: string
): Promise<SupplierWithStats | null> {
  const org = await getOrganizationBySlug(orgSlug);

  if (!org?.id) {
    throw new Error("Organización no encontrada");
  }

  const supabase = await createClient();

  // Fetch supplier
  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (supplierError) {
    throw new Error(`Error obteniendo proveedor: ${supplierError.message}`);
  }

  if (!supplier) {
    return null;
  }

  // Fetch purchases for this supplier
  const { data: purchases, error: purchasesError } = await supabase
    .from("purchase_orders")
    .select(
      "id, purchase_number, status, purchase_date, delivery_date, total_amount"
    )
    .eq("supplier_id", supplierId)
    .eq("organization_id", org.id)
    .order("purchase_date", { ascending: false });

  if (purchasesError) {
    throw new Error(
      `Error obteniendo compras del proveedor: ${purchasesError.message}`
    );
  }

  // Calculate stats
  const totalPurchases = purchases?.length ?? 0;
  const totalAmount =
    purchases?.reduce(
      (sum, purchase) => sum + (Number(purchase.total_amount) || 0),
      0
    ) ?? 0;

  // Get recent purchases (last 10)
  const recentPurchases: SupplierPurchase[] = (
    purchases?.slice(0, 10) ?? []
  ).map((p) => ({
    id: p.id,
    purchase_number: p.purchase_number,
    status: p.status,
    purchase_date: p.purchase_date,
    delivery_date: p.delivery_date,
    total_amount: Number(p.total_amount) || 0,
  }));

  return {
    ...supplier,
    stats: {
      totalPurchases,
      totalAmount,
    },
    recentPurchases,
  };
}
