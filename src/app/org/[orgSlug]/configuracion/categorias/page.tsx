import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { AddCategoryDialog } from "@/components/categories/add-category-dialog";
import { getQueryClient } from "@/lib/get-query-client";
import { categoriesServerQueryOptions } from "@/modules/categories/queries/queries.server";
import { CategoriesDataTable } from "./data-table";

type CategoriesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function CategoriesPage({ params }: CategoriesPageProps) {
  const { orgSlug } = await params;
  const queryClient = getQueryClient();

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
        <AddCategoryDialog orgSlug={orgSlug} />
      </div>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <CategoriesDataTable orgSlug={orgSlug} />
      </HydrationBoundary>
    </div>
  );
}
