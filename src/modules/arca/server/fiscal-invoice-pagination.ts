/** Runs in Chromium after fonts and images have loaded, before preview/PDF output. */
export function paginateFiscalInvoiceDocument(): void {
  // These helpers must stay inside this function: Puppeteer serializes it into Chromium.
  function required<T extends Element>(root: ParentNode, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Falta un elemento de la factura: ${selector}`);
    }
    return element;
  }

  function fits(copy: HTMLElement): boolean {
    const sheet = required<HTMLElement>(copy, ".sheet");
    const style = getComputedStyle(sheet);
    const bottom =
      sheet.getBoundingClientRect().bottom -
      Number.parseFloat(style.paddingBottom) -
      Number.parseFloat(style.borderBottomWidth);
    return Array.from(sheet.children)
      .filter((child) => !child.classList.contains("watermark"))
      .every((child) => child.getBoundingClientRect().bottom <= bottom + 0.5);
  }

  function labelPage(
    copy: HTMLElement,
    index: number,
    label: string,
    titlePrefix: string
  ): void {
    if (!fits(copy)) {
      throw new Error(
        "Los datos de la factura superan el espacio disponible en una hoja."
      );
    }
    for (const counter of copy.querySelectorAll(
      ".continuation-page, .footer-page"
    )) {
      counter.textContent = label;
    }
    const title = copy.querySelector(".detail-table-block .block-title");
    if (index > 0 && title) {
      title.textContent = `${titlePrefix} - continuación ${index + 1}`;
    }
  }

  function numberPages(group: string): void {
    const counterPrefix = group === "invoice" ? "Pág." : "Anexo";
    const titlePrefix =
      group === "invoice"
        ? "Detalle de productos"
        : "Detalle comercial de la preventa";
    const pages = Array.from(
      document.querySelectorAll<HTMLElement>(
        `.document-copy[data-pagination-group="${group}"]`
      )
    );
    for (const [index, copy] of pages.entries()) {
      const label = `${counterPrefix} ${index + 1}/${pages.length}`;
      labelPage(copy, index, label, titlePrefix);
    }
  }

  function paginateGroup(template: HTMLTemplateElement): void {
    const group = template.dataset.paginationTemplate;
    if (group !== "invoice" && group !== "commercial") {
      throw new Error("Tipo de página de factura desconocido.");
    }
    const source = required<HTMLElement>(
      document,
      `.document-copy[data-pagination-group="${group}"]`
    );
    const rows = Array.from(
      source.querySelectorAll<HTMLTableRowElement>(
        ".detail-table-block tbody tr"
      )
    );
    const summary = source.querySelector<HTMLElement>(".summary-layout");
    const footerSelector =
      group === "invoice" ? ".footer-bar" : ".commercial-footer";
    const finalFooter = required<HTMLElement>(source, footerSelector);
    const continuingFooter = required<HTMLElement>(
      template.content,
      footerSelector
    );
    let current = source;

    const body = (): HTMLTableSectionElement =>
      required(current, ".detail-table-block tbody");
    const setContinuingFooter = (): void => {
      required(current, footerSelector).replaceWith(
        continuingFooter.cloneNode(true)
      );
    };
    const nextPage = (): void => {
      const next = required<HTMLElement>(
        template.content,
        ".document-copy"
      ).cloneNode(true) as HTMLElement;
      current.after(next);
      current = next;
    };
    const appendSummary = (): void => {
      const footer = required(current, footerSelector);
      if (summary) {
        footer.before(summary);
      }
      footer.replaceWith(finalFooter);
    };

    function fillRows(): void {
      for (const row of rows) {
        body().append(row);
        if (!fits(current)) {
          row.remove();
          nextPage();
          body().append(row);
          if (!fits(current)) {
            throw new Error(
              "La descripción de un producto supera el espacio de una hoja de la factura."
            );
          }
        }
      }
    }

    function finishWithSummary(): void {
      appendSummary();
      if (fits(current)) {
        return;
      }
      // Keep the last product with the totals when both fit on a continuation page.
      const lastRow = body().lastElementChild;
      summary?.remove();
      setContinuingFooter();
      if (lastRow && (body().children.length > 1 || current === source)) {
        lastRow.remove();
        nextPage();
        body().append(lastRow);
        appendSummary();
        if (fits(current)) {
          return;
        }
      }
      summary?.remove();
      setContinuingFooter();
      nextPage();
      required(current, ".detail-table-block").remove();
      appendSummary();
    }

    for (const row of rows) {
      row.remove();
    }
    summary?.remove();
    setContinuingFooter();
    fillRows();
    finishWithSummary();
    numberPages(group);
    template.remove();
  }

  const templates = Array.from(
    document.querySelectorAll<HTMLTemplateElement>(
      "template[data-pagination-template]"
    )
  );
  for (const template of templates) {
    paginateGroup(template);
  }

  // Clone only after pagination so each copy includes its complete invoice and annexes.
  if (
    document.body.dataset.invoiceDuplicate === "true" &&
    document.body.dataset.invoiceCopiesRendered !== "true"
  ) {
    const pages = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".document-copy[data-pagination-group], [data-invoice-document]"
      )
    );
    for (const page of pages) {
      const duplicate = page.cloneNode(true) as HTMLElement;
      for (const label of duplicate.querySelectorAll(".invoice-copy-label")) {
        label.textContent = "DUPLICADO";
      }
      document.body.append(duplicate);
    }
    document.body.dataset.invoiceCopiesRendered = "true";
  }
}
