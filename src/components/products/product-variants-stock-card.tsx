"use client";

import { PencilSimple, WarningCircle, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePermissions } from "@/components/auth/permissions-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adjustMultipleVariantsStockAction,
  getProductVariantsAction,
  updateProductVariantsAction,
} from "@/modules/inventory/actions/product.actions";
import type { ProductVariantRow } from "@/modules/inventory/service/inventory.service";
import {
  normalizeTalleValue,
  normalizeVariantValue,
  sortTalles,
} from "@/modules/inventory/utils/variant-utils";
import { VariantStockMatrix } from "./variant-stock-matrix";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ProductVariantsStockCardProps = {
  productId: string;
  orgSlug: string;
  minStock?: number;
};

type StockMap = Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildStockMap(variants: ProductVariantRow[]): StockMap {
  const map: StockMap = {};
  for (const v of variants) {
    if (!map[v.color]) {
      map[v.color] = {};
    }
    map[v.color][v.talle] = v.stock ?? 0;
  }
  return map;
}

function buildVariantIdMap(
  variants: ProductVariantRow[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of variants) {
    map[`${v.color}__${v.talle}`] = v.id;
  }
  return map;
}

function getUniques(variants: ProductVariantRow[], key: "talle" | "color") {
  const uniques = Array.from(new Set(variants.map((v) => v[key])));
  if (key === "talle") {
    return sortTalles(uniques);
  }
  return uniques.sort();
}

function hasLowStock(
  stocks: StockMap,
  colores: string[],
  talles: string[],
  minStock: number
): boolean {
  return colores.some((color) =>
    talles.some((talle) => {
      const v = stocks[color]?.[talle] ?? 0;
      return v > 0 && v <= minStock;
    })
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ProductVariantsStockCard({
  productId,
  orgSlug,
  minStock = 0,
}: ProductVariantsStockCardProps) {
  const { can } = usePermissions();
  const canManageInventory = can("inventory.manage");

  // ── Data ──────────────────────────────────────────────────────────────────
  const [variants, setVariants] = useState<ProductVariantRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchVariants = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getProductVariantsAction(orgSlug, productId);
      setVariants(data);
    } catch {
      setLoadError("No se pudieron cargar las variantes.");
    } finally {
      setIsLoading(false);
    }
  }, [orgSlug, productId]);

  useEffect(() => {
    fetchVariants();
  }, [fetchVariants]);

  const talles = getUniques(variants, "talle");
  const colores = getUniques(variants, "color");
  const stockMap = buildStockMap(variants);
  const variantIdMap = buildVariantIdMap(variants);
  const showWarning =
    minStock > 0 && hasLowStock(stockMap, colores, talles, minStock);

  // ── Adjust Stock Modal ────────────────────────────────────────────────────
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMap, setAdjustMap] = useState<StockMap>({});
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  const openAdjustModal = () => {
    setAdjustMap(structuredClone(stockMap));
    setStockError(null);
    setAdjustOpen(true);
  };

  const handleStockChange = (color: string, talle: string, value: number) => {
    setAdjustMap((prev) => ({
      ...prev,
      [color]: {
        ...(prev[color] ?? {}),
        [talle]: value,
      },
    }));
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Modifying complex state safely
  const handleSaveStock = async () => {
    setIsSavingStock(true);
    setStockError(null);

    const adjustments: { variantId: string; newStock: number }[] = [];

    for (const color of colores) {
      for (const talle of talles) {
        const key = `${color}__${talle}`;
        const variantId = variantIdMap[key];
        const newStock = adjustMap[color]?.[talle] ?? 0;
        const oldStock = stockMap[color]?.[talle] ?? 0;

        if (variantId && newStock !== oldStock) {
          adjustments.push({ variantId, newStock });
        }
      }
    }

    if (adjustments.length === 0) {
      setAdjustOpen(false);
      setIsSavingStock(false);
      return;
    }

    const result = await adjustMultipleVariantsStockAction(
      orgSlug,
      adjustments
    );

    if (!result.success) {
      setStockError(result.error ?? "Error al ajustar el stock.");
      setIsSavingStock(false);
      return;
    }

    setAdjustOpen(false);
    setIsSavingStock(false);
    await fetchVariants();
  };

  // ── Edit Variants Modal ────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editTalles, setEditTalles] = useState<string[]>([]);
  const [editColores, setEditColores] = useState<string[]>([]);
  const [talleInput, setTalleInput] = useState("");
  const [colorInput, setColorInput] = useState("");
  const [isSavingVariants, setIsSavingVariants] = useState(false);
  const [variantsError, setVariantsError] = useState<string | null>(null);

  const talleRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);

  const openEditModal = () => {
    setEditTalles([...talles]);
    setEditColores([...colores]);
    setTalleInput("");
    setColorInput("");
    setVariantsError(null);
    setEditOpen(true);
  };

  const addTalle = () => {
    const v = normalizeTalleValue(talleInput);
    if (v && !editTalles.includes(v)) {
      setEditTalles((prev) => [...prev, v]);
    }
    setTalleInput("");
    talleRef.current?.focus();
  };

  const addColor = () => {
    const v = normalizeVariantValue(colorInput);
    if (v && !editColores.includes(v)) {
      setEditColores((prev) => [...prev, v]);
    }
    setColorInput("");
    colorRef.current?.focus();
  };

  const handleSaveVariants = async () => {
    if (editTalles.length === 0 || editColores.length === 0) {
      setVariantsError(
        "Debe haber al menos un talle y un color para guardar variantes."
      );
      return;
    }

    setIsSavingVariants(true);
    setVariantsError(null);

    const result = await updateProductVariantsAction(
      orgSlug,
      productId,
      editTalles,
      editColores
    );

    if (!result.success) {
      setVariantsError(result.error ?? "Error al actualizar variantes.");
      setIsSavingVariants(false);
      return;
    }

    setEditOpen(false);
    setIsSavingVariants(false);
    await fetchVariants();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <CardTitle className="font-semibold text-base">
              Stock por variante
            </CardTitle>
            {showWarning && (
              <WarningCircle
                aria-label="Hay variantes con stock bajo"
                className="h-4 w-4 text-destructive"
                weight="fill"
              />
            )}
          </div>
          <div className="flex gap-2">
            {canManageInventory ? (
              <>
                <Button
                  id="edit-variants-btn"
                  onClick={openEditModal}
                  size="sm"
                  variant="outline"
                >
                  <PencilSimple className="mr-1.5 h-4 w-4" />
                  Editar variantes
                </Button>
                <Button
                  id="adjust-stock-btn"
                  onClick={openAdjustModal}
                  size="sm"
                >
                  Ajustar stock
                </Button>
              </>
            ) : null}
          </div>
        </CardHeader>

        <CardContent>
          <VariantStockMatrix
            colores={colores}
            errorMessage={loadError}
            isLoading={isLoading}
            minStock={minStock}
            readonly
            showStockWarning={minStock > 0}
            stocks={stockMap}
            talles={talles}
          />
        </CardContent>
      </Card>

      {/* ── Adjust Stock Modal ───────────────────────────────────────────── */}
      <Dialog onOpenChange={setAdjustOpen} open={adjustOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ajustar stock por variante</DialogTitle>
            <DialogDescription>
              Modificá el stock para cada combinación talle / color. Solo se
              guardan las celdas que cambiaron.
            </DialogDescription>
          </DialogHeader>

          <VariantStockMatrix
            colores={colores}
            editable
            isLoading={false}
            minStock={minStock}
            onChange={handleStockChange}
            readonly={false}
            showStockWarning={minStock > 0}
            stocks={adjustMap}
            talles={talles}
          />

          {stockError && (
            <p className="text-destructive text-sm">{stockError}</p>
          )}

          <DialogFooter>
            <Button
              disabled={isSavingStock}
              onClick={() => setAdjustOpen(false)}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isSavingStock}
              id="save-stock-btn"
              onClick={handleSaveStock}
            >
              {isSavingStock ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Variants Modal ──────────────────────────────────────────── */}
      <Dialog onOpenChange={setEditOpen} open={editOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar variantes</DialogTitle>
            <DialogDescription>
              Agregá o eliminá talles y colores. Las combinaciones que ya tienen
              stock se conservarán.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Talles */}
            <div className="space-y-2">
              <Label>Talles</Label>
              <div className="flex gap-2">
                <Input
                  className="h-8 text-sm"
                  disabled={isSavingVariants}
                  onChange={(e) => setTalleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTalle();
                    }
                  }}
                  placeholder="Agregar talle..."
                  ref={talleRef}
                  value={talleInput}
                />
                <Button
                  disabled={isSavingVariants || !talleInput.trim()}
                  onClick={addTalle}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  +
                </Button>
              </div>
              {editTalles.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {editTalles.map((t) => (
                    <Badge className="pr-0.5" key={t} variant="secondary">
                      {t}
                      <Button
                        aria-label={`Eliminar talle ${t}`}
                        className="ml-0.5 size-5 p-0 hover:bg-transparent"
                        disabled={isSavingVariants}
                        onClick={() =>
                          setEditTalles((prev) => prev.filter((x) => x !== t))
                        }
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <X className="size-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Sin talles configurados.
                </p>
              )}
            </div>

            {/* Colores */}
            <div className="space-y-2">
              <Label>Colores</Label>
              <div className="flex gap-2">
                <Input
                  className="h-8 text-sm"
                  disabled={isSavingVariants}
                  onChange={(e) => setColorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addColor();
                    }
                  }}
                  placeholder="Agregar color..."
                  ref={colorRef}
                  value={colorInput}
                />
                <Button
                  disabled={isSavingVariants || !colorInput.trim()}
                  onClick={addColor}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  +
                </Button>
              </div>
              {editColores.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {editColores.map((c) => (
                    <Badge className="pr-0.5" key={c} variant="secondary">
                      {c}
                      <Button
                        aria-label={`Eliminar color ${c}`}
                        className="ml-0.5 size-5 p-0 hover:bg-transparent"
                        disabled={isSavingVariants}
                        onClick={() =>
                          setEditColores((prev) => prev.filter((x) => x !== c))
                        }
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <X className="size-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Sin colores configurados.
                </p>
              )}
            </div>
          </div>

          {variantsError && (
            <p className="text-destructive text-sm">{variantsError}</p>
          )}

          <DialogFooter>
            <Button
              disabled={isSavingVariants}
              onClick={() => setEditOpen(false)}
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isSavingVariants}
              id="save-variants-btn"
              onClick={handleSaveVariants}
            >
              {isSavingVariants ? "Guardando..." : "Guardar variantes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
