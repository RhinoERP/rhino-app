"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createExpenseCategoryAction,
  updateExpenseCategoryAction,
} from "@/modules/finances/actions/manage-expense-categories.action";
import type { ExpenseCategory } from "@/modules/finances/types";

type Props = {
  orgSlug: string;
  category?: ExpenseCategory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CategoryDialog({
  orgSlug,
  category,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? "#6366f1");
  const [isFixed, setIsFixed] = useState(category?.is_fixed ?? false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setColor(category?.color ?? "#6366f1");
      setIsFixed(category?.is_fixed ?? false);
    }
  }, [open, category]);

  const isEdit = Boolean(category);
  const actionLabel = isEdit ? "Guardar" : "Crear";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }
    setLoading(true);
    const input = { name, color, is_fixed: isFixed };
    const result = category
      ? await updateExpenseCategoryAction(orgSlug, category.id, input)
      : await createExpenseCategoryAction(orgSlug, input);
    setLoading(false);
    if (result.success) {
      toast.success(isEdit ? "Categoría actualizada" : "Categoría creada");
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar categoría" : "Nueva categoría"}
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="font-medium text-sm" htmlFor="cat-name">
              Nombre
            </label>
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              id="cat-name"
              onChange={(e) => setName(e.target.value)}
              required
              value={name}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-sm" htmlFor="cat-color">
              Color
            </label>
            <div className="flex items-center gap-3">
              <input
                className="h-9 w-16 cursor-pointer rounded-md border border-input p-1"
                id="cat-color"
                onChange={(e) => setColor(e.target.value)}
                type="color"
                value={color ?? "#6366f1"}
              />
              <span className="text-muted-foreground text-sm">{color}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-sm" htmlFor="cat-type">
              Tipo
            </label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              id="cat-type"
              onChange={(e) => setIsFixed(e.target.value === "fijo")}
              value={isFixed ? "fijo" : "variable"}
            >
              <option value="variable">Variable</option>
              <option value="fijo">Fijo</option>
            </select>
          </div>

          <DialogFooter>
            <Button
              disabled={loading}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={loading || !name.trim()} type="submit">
              {loading ? "Guardando..." : actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
