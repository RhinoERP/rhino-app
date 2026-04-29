import { Badge } from "@/components/ui/badge";
import type { ExpenseCategory } from "@/modules/finances/types";

type Props = {
  category: ExpenseCategory | null | undefined;
};

export function ExpenseCategoryBadge({ category }: Props) {
  if (!category) {
    return <Badge variant="outline">Sin categoría</Badge>;
  }
  return (
    <Badge
      style={
        category.color
          ? {
              backgroundColor: `${category.color}20`,
              color: category.color,
              borderColor: `${category.color}40`,
            }
          : undefined
      }
      variant="outline"
    >
      {category.name}
      {category.is_fixed ? " · Fijo" : ""}
    </Badge>
  );
}
