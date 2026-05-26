"use client";

import { GlobeIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { importTaxCatalogAction } from "@/modules/taxes/actions/import-tax-catalog.action";
import {
  ARGENTINA_TAX_CATALOG,
  CATALOG_CATEGORY_LABELS,
  CATALOG_PROVINCES,
  type TaxCatalogCategory,
} from "@/modules/taxes/argentina-catalog";

type ImportCatalogDialogProps = {
  orgSlug: string;
  /** Keys of taxes already imported by the org */
  importedKeys: Set<string>;
};

const CATEGORY_ORDER: TaxCatalogCategory[] = [
  "iva",
  "iibb",
  "percepcion_iibb",
  "retencion_iibb",
  "retencion_nacional",
  "sellos",
  "municipal",
];

const CATEGORY_COLOR: Record<TaxCatalogCategory, string> = {
  iva: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  iibb: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  percepcion_iibb:
    "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  retencion_iibb:
    "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  retencion_nacional:
    "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  sellos:
    "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  municipal:
    "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
};

export function ImportCatalogDialog({
  orgSlug,
  importedKeys,
}: ImportCatalogDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedProvince, setSelectedProvince] = useState<string>("todas");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-condition filter for province + search text
  function taxMatchesFilter(
    tax: (typeof ARGENTINA_TAX_CATALOG)[number]
  ): boolean {
    if (selectedProvince !== "todas") {
      if (selectedProvince === "nacionales") {
        if (tax.province !== null) {
          return false;
        }
      } else if (tax.province !== selectedProvince) {
        return false;
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        tax.name.toLowerCase().includes(q) ||
        (tax.province?.toLowerCase().includes(q) ?? false) ||
        CATALOG_CATEGORY_LABELS[tax.category].toLowerCase().includes(q)
      );
    }
    return true;
  }

  // Filter catalog — re-runs whenever search text or province selection changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: taxMatchesFilter captures search+selectedProvince via closure; we list the primitives directly
  const filteredCatalog = useMemo(
    () => ARGENTINA_TAX_CATALOG.filter(taxMatchesFilter),
    [search, selectedProvince]
  );

  // Group filtered catalog by category
  const grouped = useMemo(() => {
    const map = new Map<TaxCatalogCategory, typeof filteredCatalog>();
    for (const category of CATEGORY_ORDER) {
      const items = filteredCatalog.filter((t) => t.category === category);
      if (items.length > 0) {
        map.set(category, items);
      }
    }
    return map;
  }, [filteredCatalog]);

  function toggle(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function selectAll() {
    const available = filteredCatalog
      .filter((t) => !importedKeys.has(t.key))
      .map((t) => t.key);
    setSelectedKeys(new Set(available));
  }

  function clearAll() {
    setSelectedKeys(new Set());
  }

  async function handleImport() {
    if (!selectedKeys.size) {
      toast.error("Seleccioná al menos un impuesto.");
      return;
    }
    setIsImporting(true);
    try {
      const result = await importTaxCatalogAction(orgSlug, [...selectedKeys]);
      if (result.success) {
        const plural = result.imported !== 1 ? "s" : "";
        const skippedNote =
          result.skipped > 0 ? ` (${result.skipped} ya existían)` : "";
        const msg =
          result.imported > 0
            ? `${result.imported} impuesto${plural} importado${plural} correctamente.${skippedNote}`
            : "Todos los impuestos seleccionados ya estaban importados.";
        toast.success(msg);
        router.refresh();
        setOpen(false);
        setSelectedKeys(new Set());
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsImporting(false);
    }
  }

  const availableCount = filteredCatalog.filter(
    (t) => !importedKeys.has(t.key)
  ).length;

  return (
    <Dialog
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSelectedKeys(new Set());
          setSearch("");
          setSelectedProvince("todas");
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <GlobeIcon className="mr-2 size-4" weight="duotone" />
          Importar catálogo argentino
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Catálogo de Impuestos Argentinos</DialogTitle>
          <DialogDescription>
            Seleccioná los impuestos que aplican a tu organización. Las
            alícuotas son orientativas — verificar con contador.
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar impuesto o provincia..."
              value={search}
            />
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            onChange={(e) => setSelectedProvince(e.target.value)}
            value={selectedProvince}
          >
            <option value="todas">Todas las categorías</option>
            <option value="nacionales">Solo nacionales</option>
            <optgroup label="Por provincia">
              {CATALOG_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Selection controls */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {selectedKeys.size} seleccionado{selectedKeys.size !== 1 ? "s" : ""}
            {" · "}
            {availableCount} disponible{availableCount !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button
              className="text-primary hover:underline"
              onClick={selectAll}
              type="button"
            >
              Seleccionar todos
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              className="text-muted-foreground hover:underline"
              onClick={clearAll}
              type="button"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Tax list */}
        <ScrollArea className="flex-1 rounded-md border">
          <div className="space-y-4 p-4">
            {grouped.size === 0 && (
              <p className="py-8 text-center text-muted-foreground text-sm">
                No hay impuestos que coincidan con la búsqueda.
              </p>
            )}
            {[...grouped.entries()].map(([category, taxes]) => (
              <div key={category}>
                <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  {CATALOG_CATEGORY_LABELS[category]}
                </p>
                <div className="space-y-1">
                  {taxes.map((tax) => {
                    const alreadyImported = importedKeys.has(tax.key);
                    const isSelected = selectedKeys.has(tax.key);
                    let rowClass =
                      "flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 transition-colors";
                    if (alreadyImported) {
                      rowClass += " cursor-not-allowed opacity-50";
                    } else if (isSelected) {
                      rowClass += " bg-primary/5";
                    } else {
                      rowClass += " hover:bg-muted/50";
                    }
                    return (
                      // biome-ignore lint/a11y/noLabelWithoutControl: label wraps Checkbox which is the control
                      <label className={rowClass} key={tax.key}>
                        <Checkbox
                          checked={isSelected}
                          className="mt-0.5"
                          disabled={alreadyImported}
                          onCheckedChange={() => {
                            if (!alreadyImported) {
                              toggle(tax.key);
                            }
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">
                              {tax.name}
                            </span>
                            <Badge
                              className={`text-xs ${CATEGORY_COLOR[tax.category]}`}
                            >
                              {tax.rate}%
                            </Badge>
                            {alreadyImported && (
                              <Badge className="text-xs" variant="secondary">
                                Ya importado
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
                            {tax.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            disabled={isImporting}
            onClick={() => setOpen(false)}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            disabled={isImporting || !selectedKeys.size}
            onClick={handleImport}
            type="button"
          >
            {isImporting
              ? "Importando..."
              : `Importar ${selectedKeys.size > 0 ? selectedKeys.size : ""} impuesto${selectedKeys.size !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
