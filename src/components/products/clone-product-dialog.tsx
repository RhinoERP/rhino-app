"use client";

import { CopyIcon } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cloneProductAction } from "@/modules/inventory/actions/product-flow.actions";

type CloneProductDialogProps = {
  orgSlug: string;
  sourceProductId: string;
  sourceProductName: string;
  sourceSku: string;
};

export function CloneProductDialog({
  orgSlug,
  sourceProductId,
  sourceProductName,
  sourceSku,
}: CloneProductDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(`${sourceProductName} (copia)`);
  const [newSku, setNewSku] = useState(`${sourceSku}-COPY`);
  const [isPending, startTransition] = useTransition();

  function handleClone() {
    if (!newName.trim() || !newSku.trim()) {
      toast.error("Nombre y SKU son obligatorios");
      return;
    }

    startTransition(async () => {
      const result = await cloneProductAction({
        orgSlug,
        sourceProductId,
        newName: newName.trim(),
        newSku: newSku.trim().toUpperCase(),
      });

      if (result.success && result.newProductId) {
        toast.success("Producto clonado correctamente");
        setOpen(false);
        router.push(`/org/${orgSlug}/stock/${result.newProductId}`);
      } else {
        toast.error(result.error ?? "Error al clonar el producto");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CopyIcon className="size-4" weight="duotone" />
          Clonar artículo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clonar artículo</DialogTitle>
          <DialogDescription>
            Se copiará toda la configuración de{" "}
            <strong>{sourceProductName}</strong> incluyendo marca, unidad de
            medida, cuenta contable y permisos de flujo. Solo editá el nuevo
            nombre y SKU.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Nombre del nuevo artículo</Label>
            <Input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej: Remera Azul Talle L"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-sku">SKU del nuevo artículo</Label>
            <Input
              id="new-sku"
              value={newSku}
              onChange={(e) => setNewSku(e.target.value.toUpperCase())}
              placeholder="Ej: REM-AZL-L"
              className="font-mono"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              El SKU debe ser único en tu organización.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleClone}
            disabled={isPending || !newName.trim() || !newSku.trim()}
          >
            {isPending ? "Clonando..." : "Clonar artículo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
