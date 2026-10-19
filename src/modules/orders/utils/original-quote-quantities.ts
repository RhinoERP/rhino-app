export type QuoteItemPortion = {
  id: string;
  parent_quote_item_id?: string | null;
  quantity: number;
};

export type ReceivedBadge = "goods" | "partial_goods";

/** Resolve the original line id shared by every split portion. */
export function quoteItemRootIds(
  portions: QuoteItemPortion[]
): Map<string, string> {
  const byId = new Map(portions.map((portion) => [portion.id, portion]));
  const rootById = new Map<string, string>();

  for (const portion of portions) {
    const visited = new Set<string>();
    let current = portion;
    while (current.parent_quote_item_id) {
      if (visited.has(current.id)) {
        current = portion;
        break;
      }
      visited.add(current.id);
      const parent = byId.get(current.parent_quote_item_id);
      if (!parent) {
        current = portion;
        break;
      }
      current = parent;
    }
    rootById.set(portion.id, current.id);
  }
  return rootById;
}

/** Total ordered quantity for each portion of an originally quoted line. */
export function originalQuoteQuantities(
  portions: QuoteItemPortion[]
): Map<string, number> {
  const rootById = quoteItemRootIds(portions);
  const totalByRoot = new Map<string, number>();

  for (const portion of portions) {
    const rootId = rootById.get(portion.id) ?? portion.id;
    totalByRoot.set(rootId, (totalByRoot.get(rootId) ?? 0) + portion.quantity);
  }

  return new Map(
    portions.map((portion) => [
      portion.id,
      totalByRoot.get(rootById.get(portion.id) ?? portion.id) ??
        portion.quantity,
    ])
  );
}

/**
 * Received badge for every portion currently sitting in a goods-received
 * child. A line is partial while the received quantity is below the original
 * ordered total, independently of the purchase order status.
 */
export function receivedBadgesByItem(params: {
  portions: Array<QuoteItemPortion & { assigned_order_id?: string | null }>;
  statusByChildId: ReadonlyMap<string, string | null | undefined>;
}): Map<string, ReceivedBadge> {
  const { portions, statusByChildId } = params;
  const rootById = quoteItemRootIds(portions);
  const orderedByRoot = new Map<string, number>();
  const receivedByRoot = new Map<string, number>();

  const isReceived = (
    portion: QuoteItemPortion & { assigned_order_id?: string | null }
  ) =>
    portion.assigned_order_id
      ? statusByChildId.get(portion.assigned_order_id) === "GOODS_RECEIVED"
      : false;

  for (const portion of portions) {
    const rootId = rootById.get(portion.id) ?? portion.id;
    orderedByRoot.set(
      rootId,
      (orderedByRoot.get(rootId) ?? 0) + portion.quantity
    );
    if (isReceived(portion)) {
      receivedByRoot.set(
        rootId,
        (receivedByRoot.get(rootId) ?? 0) + portion.quantity
      );
    }
  }

  const badges = new Map<string, ReceivedBadge>();
  for (const portion of portions) {
    if (!isReceived(portion)) {
      continue;
    }
    const rootId = rootById.get(portion.id) ?? portion.id;
    const ordered = orderedByRoot.get(rootId) ?? portion.quantity;
    const received = receivedByRoot.get(rootId) ?? 0;
    badges.set(portion.id, received < ordered ? "partial_goods" : "goods");
  }
  return badges;
}
