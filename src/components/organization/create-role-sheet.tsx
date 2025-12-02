"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function toSnakeCase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function CreateRoleSheet() {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [isKeyManuallyEdited, setIsKeyManuallyEdited] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isKeyManuallyEdited && name) {
      const snakeCaseKey = toSnakeCase(name);
      setKey(snakeCaseKey);
    }
  }, [name, isKeyManuallyEdited]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!isKeyManuallyEdited) {
      const snakeCaseKey = toSnakeCase(value);
      setKey(snakeCaseKey);
    }
  };

  const handleKeyChange = (value: string) => {
    setKey(value);
    setIsKeyManuallyEdited(true);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form when sheet closes
      setName("");
      setKey("");
      setDescription("");
      setIsKeyManuallyEdited(false);
    }
  };

  return (
    <Sheet onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo rol
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 p-0" side="right">
        <SheetHeader className="border-b">
          <SheetTitle className="px-4 pt-4 text-base">
            Nuevo rol de la organización
          </SheetTitle>
          <SheetDescription className="px-4 pb-4">
            Define el nombre, la clave técnica y configura los permisos.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Administrador de ventas"
                value={name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="key">
                Clave técnica <span className="text-destructive">*</span>
              </Label>
              <Input
                id="key"
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="admin, compras_read, etc."
                ref={keyInputRef}
                value={key}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Input
                id="description"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Qué puede hacer este rol"
                value={description}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="mb-3">
              <h3 className="font-medium text-sm">Permisos</h3>
              <p className="text-muted-foreground text-xs">
                Aquí podrás seleccionar los permisos que tendrá este rol.
              </p>
            </div>

            <div className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
              Configuración de permisos pendiente de implementar.
            </div>
          </div>
        </div>

        <SheetFooter className="border-t">
          <Button className="w-full" type="button" variant="outline">
            Cancelar
          </Button>
          <Button className="w-full" type="button">
            Guardar rol
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
