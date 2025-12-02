"use client";

import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { createRoleAction } from "@/modules/organizations/actions/create-role.action";
import type { Permission } from "@/modules/organizations/service/roles.service";
import { groupPermissions } from "@/modules/organizations/utils/permission-helpers";

function toSnakeCase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type CreateRoleSheetProps = {
  orgSlug: string;
  permissions: Permission[];
};

export function CreateRoleSheet({
  orgSlug,
  permissions,
}: CreateRoleSheetProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set()
  );
  const [isKeyManuallyEdited, setIsKeyManuallyEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  const groupedPermissions = groupPermissions(permissions);

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

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setName("");
      setKey("");
      setDescription("");
      setSelectedPermissions(new Set());
      setIsKeyManuallyEdited(false);
      setError(null);
    }
  };

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setError(null);

    if (!name.trim()) {
      setError("El nombre del rol es requerido");
      return;
    }

    if (!key.trim()) {
      setError("La clave del rol es requerida");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createRoleAction({
        orgSlug,
        name,
        key,
        description,
        permissionIds: Array.from(selectedPermissions),
      });

      if (result.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error || "Error al crear el rol");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error desconocido al crear el rol"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
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

            <div className="space-y-4">
              {Object.entries(groupedPermissions).map(
                ([resourceKey, group]) => (
                  <div className="space-y-2" key={resourceKey}>
                    <div className="font-semibold text-sm">
                      {group.resourceLabel}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.permissions.map((perm) => {
                        const isSelected = selectedPermissions.has(perm.id);
                        return (
                          <Badge
                            className={`flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                            }`}
                            key={perm.id}
                            onClick={() => handlePermissionToggle(perm.id)}
                            variant="outline"
                          >
                            {isSelected && <CheckIcon className="h-4 w-4" />}
                            {perm.actionLabel}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-4 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
            {error}
          </div>
        )}

        <SheetFooter className="border-t">
          <Button
            className="w-full"
            disabled={isSubmitting}
            onClick={() => setOpen(false)}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            className="w-full"
            disabled={isSubmitting}
            onClick={handleSubmit}
            type="button"
          >
            {isSubmitting ? "Guardando..." : "Guardar rol"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
