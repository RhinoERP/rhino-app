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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
    .email("Por favor ingresa un email válido")
    .min(1, "El email es requerido"),
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

  const form = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      email: "",
      roleId: "",
    },
  });

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      form.reset();
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

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-4 py-4">
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  {...field}
                  aria-invalid={fieldState.invalid}
                  autoComplete="email"
                  disabled={form.formState.isSubmitting}
                  id="email"
                  placeholder="usuario@ejemplo.com"
                  type="email"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="roleId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="role">Rol</FieldLabel>
                <Select
                  disabled={form.formState.isSubmitting}
                  name={field.name}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <SelectTrigger
                    aria-invalid={fieldState.invalid}
                    className="w-full"
                    id="role"
                  >
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
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={form.formState.isSubmitting}
            onClick={() => setOpen(false)}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            disabled={form.formState.isSubmitting || roles.length === 0}
            type="submit"
          >
            {form.formState.isSubmitting ? "Enviando..." : "Enviar invitación"}
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
