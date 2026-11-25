/** Executed inside Chromium; keep all DOM helpers within this function. */
export function paginateFiscalRemittanceDocument(): void {
  function required(root: ParentNode, selector: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) {
      throw new Error(`Falta un elemento del remito: ${selector}`);
    }
    return element;
  }
  function fits(page: HTMLElement) {
    const signature = required(page, ".sig-wrap");
    const padding = Number.parseFloat(getComputedStyle(page).paddingBottom);
    return (
      signature.getBoundingClientRect().bottom <=
      page.getBoundingClientRect().bottom - padding + 0.5
    );
  }
  function numberPages(pages: HTMLElement[]) {
    for (const [index, page] of pages.entries()) {
      const label = required(page, ".fiscal-copy");
      label.textContent = `${label.textContent} · Página ${index + 1}/${pages.length}`;
      if (index < pages.length - 1) {
        page.querySelector(".total-row")?.remove();
        page.querySelector(".obs")?.remove();
      }
      page.dataset.remittancePaginated = "true";
    }
  }
  function paginateCopy(source: HTMLElement) {
    const template = source.cloneNode(true) as HTMLElement;
    const rows = Array.from(
      source.querySelectorAll<HTMLTableRowElement>("tbody tr")
    );
    const body = required(source, "tbody");
    body.replaceChildren();
    let current = source;
    const pages = [source];
    for (const row of rows) {
      const currentBody = required(current, "tbody");
      currentBody.append(row);
      if (fits(current)) {
        continue;
      }
      row.remove();
      if (!currentBody.children.length) {
        throw new Error(
          "Un producto o las observaciones del remito exceden el espacio de una página."
        );
      }
      const next = template.cloneNode(true) as HTMLElement;
      required(next, "tbody").replaceChildren(row);
      current.after(next);
      pages.push(next);
      current = next;
      if (!fits(current)) {
        throw new Error(
          "Un producto o las observaciones del remito exceden el espacio de una página."
        );
      }
    }
    numberPages(pages);
  }
  const copies = document.querySelectorAll<HTMLElement>(
    ".document-copy--fiscal:not([data-remittance-paginated])"
  );
  for (const source of copies) {
    paginateCopy(source);
  }
}
