// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditPriceListDialog } from "./edit-price-list-dialog";

const mocks = vi.hoisted(() => ({ update: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/modules/organizations/hooks/use-org-settings", () => ({
  useOrgSettings: () => ({ data: { purchase_discounts_enabled: true } }),
}));
vi.mock("@/modules/price-lists/actions/update-price-list.action", () => ({
  updatePriceListAction: mocks.update,
}));
vi.mock("@/components/ui/calendar", () => ({ Calendar: () => null }));
vi.mock("@/components/ui/popover", () => {
  const Container = ({ children }: { children: ReactNode }) => children;
  return {
    Popover: Container,
    PopoverTrigger: Container,
    PopoverContent: Container,
  };
});
vi.mock("@/components/ui/dialog", async () => {
  const R = await import("react");
  const Context = R.createContext<{
    open: boolean;
    onOpenChange: (value: boolean) => void;
  }>({ open: false, onOpenChange: vi.fn() });
  const Container = ({ children }: { children: ReactNode }) => children;
  return {
    Dialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange: (value: boolean) => void;
      children: ReactNode;
    }) => (
      <Context.Provider value={{ open, onOpenChange }}>
        {children}
      </Context.Provider>
    ),
    DialogTrigger: ({
      children,
    }: {
      children: ReactElement<{ onClick?: () => void }>;
    }) => {
      const dialog = R.useContext(Context);
      return R.cloneElement(children, {
        onClick: () => dialog.onOpenChange(true),
      });
    },
    DialogContent: ({ children }: { children: ReactNode }) =>
      R.useContext(Context).open ? <div>{children}</div> : null,
    DialogHeader: Container,
    DialogTitle: Container,
    DialogDescription: Container,
    DialogFooter: Container,
  };
});

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const productKey = ["products", "by-supplier", "test", "supplier"];
beforeEach(async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.update.mockReset().mockResolvedValue({ success: true });
  client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, gcTime: Number.POSITIVE_INFINITY },
    },
  });
  client.setQueryData(productKey, [
    { habitual_discount_method: "sequential", cost_price: 72 },
  ]);
  client.setQueryData(["price-list-items", "test", "list"], []);
  client.setQueryData(["products", "by-supplier", "other", "supplier"], []);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() =>
    root.render(
      <React.StrictMode>
        <QueryClientProvider client={client}>
          <EditPriceListDialog
            currentDiscountMethod="sequential"
            currentName="Lista"
            currentValidFrom="2026-11-27"
            orgSlug="test"
            priceListId="list"
          />
        </QueryClientProvider>
      </React.StrictMode>
    )
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  client.clear();
  vi.unstubAllGlobals();
});
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label
  );
  if (!button) {
    throw new Error(`Falta el botón ${label}`);
  }
  await act(async () => button.click());
}
async function setMethod(value: string) {
  const select = container.querySelector("select");
  if (!select) {
    throw new Error("Falta el método de la lista");
  }
  await act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submit() {
  const form = container.querySelector("form");
  if (!form) {
    throw new Error("Falta el formulario");
  }
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
  });
}

it("descarta un método cancelado y conserva la fecha al editar solo el nombre", async () => {
  await click("Editar");
  await setMethod("additive");
  await click("Cancelar");
  await click("Editar");
  expect(container.querySelector("select")?.value).toBe("sequential");
  const input = container.querySelector<HTMLInputElement>('input[name="name"]');
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  if (!(input && setter)) {
    throw new Error("Falta el nombre de la lista");
  }
  await act(() => {
    setter.call(input, "Nombre nuevo");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await submit();
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      priceListId: "list",
      name: "Nombre nuevo",
      valid_from: "2026-11-27",
      habitual_discount_method: "sequential",
    })
  );
});

it("cambiar el método actualiza la misma lista y marca obsoletos los productos del proveedor", async () => {
  expect(client.getQueryState(productKey)?.isInvalidated).toBe(false);
  await click("Editar");
  await setMethod("additive");
  await submit();
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      priceListId: "list",
      habitual_discount_method: "additive",
    })
  );
  expect(client.getQueryState(productKey)?.isInvalidated).toBe(true);
  expect(
    client.getQueryState(["price-list-items", "test", "list"])?.isInvalidated
  ).toBe(true);
  expect(
    client.getQueryState(["products", "by-supplier", "other", "supplier"])
      ?.isInvalidated
  ).toBe(false);
});
