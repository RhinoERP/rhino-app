"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
} from "@/components/ui/dialog";
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useWarehouseAdministration } from "@/modules/inventory/hooks/use-warehouse-administration";
import {
  type ManagedWarehouse,
  type WarehouseAssignmentMember,
  type WarehouseAssignmentsValues,
  warehouseAssignmentsFormSchema,
} from "@/modules/inventory/warehouse-admin.types";

export function WarehouseAssignmentsDialog(props: {
  orgSlug: string;
  member: WarehouseAssignmentMember;
  warehouses: ManagedWarehouse[];
  onClose: () => void;
}) {
  const { replaceAssignments } = useWarehouseAdministration(props.orgSlug);
  const form = useForm<WarehouseAssignmentsValues>({
    resolver: zodResolver(warehouseAssignmentsFormSchema),
    defaultValues: { warehouseIds: props.member.warehouseIds },
  });
  const pending = form.formState.isSubmitting;
  const submit = form.handleSubmit(async (values) => {
    try {
      await replaceAssignments.mutateAsync({
        ...values,
        userId: props.member.userId,
      });
      toast.success("Asignaciones actualizadas");
      props.onClose();
    } catch (error) {
      form.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "No se pudieron guardar las asignaciones",
      });
    }
  });
  const handleOpenChange = (open: boolean) => {
    if (open || pending) {
      return;
    }
    props.onClose();
  };
  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Depósitos de {props.member.name}</DialogTitle>
          <DialogDescription>
            Elegí los depósitos asignados a este usuario. El canal y el estado
            se validan al operar.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={submit}>
            <FormField
              control={form.control}
              name="warehouseIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Depósitos asignados</FormLabel>
                  <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3">
                    {props.warehouses.map((warehouse) => {
                      const id = `warehouse-assignment-${warehouse.id}`;
                      return (
                        <div
                          className="flex items-center gap-3"
                          key={warehouse.id}
                        >
                          <Checkbox
                            checked={field.value.includes(warehouse.id)}
                            disabled={pending}
                            id={id}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked === true
                                  ? [...new Set([...field.value, warehouse.id])]
                                  : field.value.filter(
                                      (value) => value !== warehouse.id
                                    )
                              )
                            }
                          />
                          <label
                            className="flex flex-1 flex-wrap items-center gap-2 text-sm"
                            htmlFor={id}
                          >
                            {warehouse.name}
                            {warehouse.is_default && (
                              <Badge variant="outline">Principal</Badge>
                            )}
                            {!warehouse.is_active && (
                              <Badge variant="secondary">Inactivo</Badge>
                            )}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <FormDescription>
                    Los depósitos inactivos conservan asignaciones para el
                    historial; solo los activos aparecen al operar.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="text-muted-foreground text-sm">
              Las nuevas operaciones revalidan el acceso, incluidas las ventas
              de cajas abiertas.
            </p>
            {form.formState.errors.root && (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.root.message}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={pending}
                onClick={props.onClose}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? "Guardando..." : "Guardar accesos"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
