import { CategoryList } from "@/components/finances/categories/category-list";
import { getExpenseCategoriesAction } from "@/modules/finances/actions/get-expense-categories.action";

type Props = {
  params: Promise<{ orgSlug: string }>;
};

export default async function CategoriasPage({ params }: Props) {
  const { orgSlug } = await params;
  const categories = await getExpenseCategoriesAction(orgSlug);

  return (
    <div className="space-y-4">
      <CategoryList categories={categories} orgSlug={orgSlug} />
    </div>
  );
}
