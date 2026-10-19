import { cn } from "@/lib/utils";

type VariantBreakdownProps = {
  variantStocks: Record<string, Record<string, number>>;
  className?: string;
};

export function VariantBreakdown({
  variantStocks,
  className,
}: VariantBreakdownProps) {
  const parts: string[] = [];

  for (const [attribute, values] of Object.entries(variantStocks)) {
    const detailParts = Object.entries(values)
      .filter(([, qty]) => qty > 0)
      .map(([variantName, qty]) => `${variantName}: ${qty}`);

    if (detailParts.length > 0) {
      parts.push(`${attribute} ${detailParts.join(", ")}`);
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return (
    <p className={cn("text-muted-foreground text-xs", className)}>
      {parts.join(" — ")}
    </p>
  );
}
