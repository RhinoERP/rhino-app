import { ExpenseForm } from "@/components/finances/expenses/expense-form";
import { getExpenseCategoriesAction } from "@/modules/finances/actions/get-expense-categories.action";

type Props = {
  params: Promise<{ orgSlug: string }>;
};

export default async function NuevoGastoPage({ params }: Props) {
  const { orgSlug } = await params;
  const categories = await getExpenseCategoriesAction(orgSlug);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="font-semibold text-xl">Nuevo gasto operativo</h2>
        <p className="text-muted-foreground text-sm">
          Registrá un gasto del establecimiento.
        </p>
      </div>
      <ExpenseForm categories={categories} orgSlug={orgSlug} />
    </div>
  );
}
