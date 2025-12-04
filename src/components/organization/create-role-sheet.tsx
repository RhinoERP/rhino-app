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
import { updateRoleAction } from "@/modules/organizations/actions/update-role.action";
import type {
  OrganizationRole,
  Permission,
} from "@/modules/organizations/service/roles.service";
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
  role?: OrganizationRole;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
};

export function CreateRoleSheet({
  orgSlug,
  permissions,
  role,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: CreateRoleSheetProps) {
  const router = useRouter();
  const isEditMode = !!role;
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set()
  );
  const [isKeyManuallyEdited, setIsKeyManuallyEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const keyInputRef = useRef<HTMLInputElement>(null);

  // Use controlled or internal state for open
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const groupedPermissions = groupPermissions(permissions);

  // Load role data when in edit mode and sheet opens
  useEffect(() => {
    if (open && isEditMode && role) {
      setName(role.name);
      setKey(role.key);
      setDescription(role.description || "");
      setIsKeyManuallyEdited(true); // Don't auto-generate key in edit mode

      // Use permissions that already come with the role
      if (role.permissionIds && role.permissionIds.length > 0) {
        setSelectedPermissions(new Set(role.permissionIds));
      } else {
        setSelectedPermissions(new Set());
      }
    }
  }, [open, isEditMode, role]);

  useEffect(() => {
    if (!isKeyManuallyEdited && name && !isEditMode) {
      const snakeCaseKey = toSnakeCase(name);
      setKey(snakeCaseKey);
    }
  }, [name, isKeyManuallyEdited, isEditMode]);

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
      if (!isEditMode) {
        // Only reset if not in edit mode
        setName("");
        setKey("");
        setDescription("");
        setSelectedPermissions(new Set());
        setIsKeyManuallyEdited(false);
      }
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

  const getSubmitButtonText = (): string => {
    if (isSubmitting) {
      return isEditMode ? "Actualizando..." : "Guardando...";
    }
    return isEditMode ? "Actualizar rol" : "Guardar rol";
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      setError("El nombre del rol es requerido");
      return false;
    }

    if (!key.trim()) {
      setError("La clave del rol es requerida");
      return false;
    }

    return true;
  };

  const executeRoleAction = async () => {
    const permissionIdsArray = Array.from(selectedPermissions);
    const baseParams = {
      orgSlug,
      name,
      key,
      description,
      permissionIds: permissionIdsArray,
    };

    if (isEditMode && role) {
      return await updateRoleAction({
        ...baseParams,
        roleId: role.id,
      });
    }

    return await createRoleAction(baseParams);
  };

  const handleSubmit = async () => {
    setError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const actionResult = await executeRoleAction();

      if (actionResult.success) {
        setOpen(false);
        router.refresh();
      } else {
        const defaultError = isEditMode
          ? "Error al actualizar el rol"
          : "Error al crear el rol";
        setError(actionResult.error || defaultError);
      }
    } catch (err) {
      const defaultErrorMessage = isEditMode
        ? "Error desconocido al actualizar el rol"
        : "Error desconocido al crear el rol";
      setError(err instanceof Error ? err.message : defaultErrorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sheetContent = (
    <SheetContent className="flex flex-col gap-0 p-0" side="right">
      <SheetHeader>
        <SheetTitle>{isEditMode ? "Editar rol" : "Nuevo rol"}</SheetTitle>
        <SheetDescription>
          {isEditMode
            ? "Modifica el nombre, la clave técnica y configura los permisos."
            : "Define el nombre, la clave técnica y configura los permisos."}
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
              disabled={isEditMode}
              id="key"
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="admin, compras_read, etc."
              ref={keyInputRef}
              value={key}
            />
            {isEditMode && (
              <p className="text-muted-foreground text-xs">
                La clave técnica no se puede modificar
              </p>
            )}
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
            <h3 className="font-heading font-medium text-base">Permisos</h3>
            <p className="text-muted-foreground text-xs">
              Aquí podrás seleccionar los permisos que tendrá este rol.
            </p>
          </div>
          <div className="space-y-4">
            {Object.entries(groupedPermissions).map(([resourceKey, group]) => (
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
            ))}
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
          {getSubmitButtonText()}
        </Button>
      </SheetFooter>
    </SheetContent>
  );

  // If trigger is provided, use it
  if (trigger) {
    return (
      <Sheet onOpenChange={handleOpenChange} open={open}>
        {trigger}
        {sheetContent}
      </Sheet>
    );
  }

  // If open/onOpenChange are controlled (edit mode), don't show trigger
  if (controlledOpen !== undefined || controlledOnOpenChange) {
    return (
      <Sheet onOpenChange={handleOpenChange} open={open}>
        {sheetContent}
      </Sheet>
    );
  }

  // Default: create mode with trigger
  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
          Nuevo rol
        </Button>
      </SheetTrigger>
      {sheetContent}
    </Sheet>
  );
}
