import { formatCurrency } from "@/lib/format";

type ItemExtrasListProps = {
  extras:
    | Array<{ id?: string; description: string; price: number }>
    | null
    | undefined;
  currency?: string;
  showPrice?: boolean;
};

export function ItemExtrasList({
  extras,
  currency = "ARS",
  showPrice = true,
}: ItemExtrasListProps) {
  if (!extras || extras.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 space-y-0.5">
      {extras.map((extra) => (
        <div
          className="flex items-baseline justify-between gap-2 text-muted-foreground text-xs"
          key={extra.id ?? `${extra.description}-${extra.price}`}
        >
          <span>+ {extra.description}</span>
          {showPrice && (
            <span className="shrink-0 tabular-nums">
              {formatCurrency(extra.price, currency)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
