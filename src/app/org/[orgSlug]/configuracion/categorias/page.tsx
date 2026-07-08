import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { AddCategoryDialog } from "@/components/categories/add-category-dialog";
import { getQueryClient } from "@/lib/get-query-client";
import { categoriesServerQueryOptions } from "@/modules/categories/queries/queries.server";
import { getOrganizationBySlug } from "@/modules/organizations/service/organizations.service";
import { isOrganizationModuleEnabled } from "@/modules/organizations/utils/module-flags";
import { CategoriesDataTable } from "./data-table";

type CategoriesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function CategoriesPage({ params }: CategoriesPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();
  const organization = await getOrganizationBySlug(orgSlug);

  if (!organization) {
    notFound();
  }

  const isAccountingEnabled = isOrganizationModuleEnabled(
    organization,
    "accounting"
  );

  await queryClient.prefetchQuery(categoriesServerQueryOptions(orgSlug));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Categorías</h1>
          <p className="text-muted-foreground text-sm">
            Organiza tus productos con categorías y subcategorías.
          </p>
        </div>
        <AddCategoryDialog
          isAccountingEnabled={isAccountingEnabled}
          orgId={organization.id}
          orgSlug={orgSlug}
        />
      </div>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <CategoriesDataTable
          isAccountingEnabled={isAccountingEnabled}
          orgId={organization.id}
          orgSlug={orgSlug}
        />
      </HydrationBoundary>
    </div>
  );
}
