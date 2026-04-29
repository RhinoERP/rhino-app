import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/finances/expenses/expense-form";
import { getExpenseCategoriesAction } from "@/modules/finances/actions/get-expense-categories.action";
import { getExpensesAction } from "@/modules/finances/actions/get-expenses.action";

type Props = {
  params: Promise<{ orgSlug: string; id: string }>;
};

export default async function EditGastoPage({ params }: Props) {
  const { orgSlug, id } = await params;
  const [expenses, categories] = await Promise.all([
    getExpensesAction(orgSlug),
    getExpenseCategoriesAction(orgSlug),
  ]);
  const expense = expenses.find((e) => e.id === id);
  if (!expense) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="font-semibold text-xl">Editar gasto</h2>
        <p className="text-muted-foreground text-sm">
          Modificá los datos del gasto.
        </p>
      </div>
      <ExpenseForm
        categories={categories}
        expense={expense}
        orgSlug={orgSlug}
      />
    </div>
  );
}
