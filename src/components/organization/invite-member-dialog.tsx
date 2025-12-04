"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlusIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createInvitationAction } from "@/modules/organizations/actions/create-invitation.action";
import type { OrganizationRole } from "@/modules/organizations/service/roles.service";

const inviteMemberSchema = z.object({
  email: z
    .string()
    .min(1, "El email es requerido")
    .email("Por favor ingresa un email válido"),
  roleId: z.string().min(1, "El rol es requerido"),
});

type InviteMemberFormValues = z.infer<typeof inviteMemberSchema>;

type InviteMemberDialogProps = {
  orgSlug: string;
  roles: OrganizationRole[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
};

export function InviteMemberDialog({
  orgSlug,
  roles,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: InviteMemberDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);

  // Use controlled or internal state for open
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      email: "",
      roleId: "",
    },
  });

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      reset();
      setError(null);
    }
  };

  const onSubmit = async (data: InviteMemberFormValues) => {
    setError(null);

    try {
      const actionResult = await createInvitationAction({
        orgSlug,
        invitedEmail: data.email.trim(),
        roleId: data.roleId,
        invitationType: "one_time",
        isOwner: false,
      });

      if (actionResult.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(actionResult.error || "Error al crear la invitación");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error desconocido al crear la invitación"
      );
    }
  };

  const dialogContent = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Invitar miembro</DialogTitle>
        <DialogDescription>
          Envía una invitación por email para que se una a la organización.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              disabled={isSubmitting}
              id="email"
              placeholder="usuario@ejemplo.com"
              type="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-destructive text-sm">{errors.email.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="role">
              Rol <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={control}
              name="roleId"
              render={({ field }) => (
                <Select
                  disabled={isSubmitting}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <SelectTrigger className="w-full" id="role">
                    <SelectValue placeholder="Selecciona un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.length === 0 ? (
                      <div className="px-2 py-1.5 text-muted-foreground text-sm">
                        No hay roles disponibles
                      </div>
                    ) : (
                      roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.roleId && (
              <p className="text-destructive text-sm">
                {errors.roleId.message}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => setOpen(false)}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button disabled={isSubmitting || roles.length === 0} type="submit">
            {isSubmitting ? "Enviando..." : "Enviar invitación"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );

  if (trigger) {
    return (
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon className="mr-2 size-4" weight="bold" />
          Invitar miembro
        </Button>
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  );
}
