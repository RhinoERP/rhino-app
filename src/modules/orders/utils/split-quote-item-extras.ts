type QuoteItemExtra = {
  description: string;
  price: number;
};

export function buildSplitQuoteItemExtras(
  quoteItemId: string,
  extras: QuoteItemExtra[]
) {
  return extras.map((extra) => ({
    quote_item_id: quoteItemId,
    description: extra.description,
    price: extra.price,
  }));
}
