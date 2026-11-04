"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useWarehouseAdministration } from "@/modules/inventory/hooks/use-warehouse-administration";
import {
  type ManagedWarehouse,
  type WarehouseFormValues,
  warehouseFormSchema,
} from "@/modules/inventory/warehouse-admin.types";

const booleanFields: Array<{
  name: "isActive" | "wholesaleEnabled" | "directSaleEnabled";
  label: string;
  description: string;
}> = [
  {
    name: "isActive",
    label: "Activo",
    description: "Disponible para nuevas operaciones.",
  },
  {
    name: "wholesaleEnabled",
    label: "Mayorista",
    description: "Presupuestos, pedidos y ventas.",
  },
  {
    name: "directSaleEnabled",
    label: "Venta directa / POS",
    description: "Sesiones de caja y ventas directas.",
  },
];

export function WarehouseDialog(props: {
  orgSlug: string;
  warehouse: ManagedWarehouse | null;
  onClose: () => void;
}) {
  const { saveWarehouse } = useWarehouseAdministration(props.orgSlug);
  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseFormSchema),
    defaultValues: {
      name: props.warehouse?.name ?? "",
      code: props.warehouse?.code ?? "",
      isActive: props.warehouse?.is_active ?? true,
      wholesaleEnabled: props.warehouse?.wholesale_enabled ?? true,
      directSaleEnabled: props.warehouse?.direct_sale_enabled ?? true,
    },
  });
  const pending = form.formState.isSubmitting;
  const submit = form.handleSubmit(async (values) => {
    try {
      await saveWarehouse.mutateAsync({
        ...values,
        warehouseId: props.warehouse?.id,
      });
      toast.success(
        props.warehouse ? "Depósito actualizado" : "Depósito creado"
      );
      props.onClose();
    } catch (error) {
      form.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el depósito",
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
          <DialogTitle>
            {props.warehouse ? "Editar depósito" : "Nuevo depósito"}
          </DialogTitle>
          <DialogDescription>
            Configurá el nombre, el estado y los canales de operación.
          </DialogDescription>
          {props.warehouse?.is_default && (
            <Badge className="w-fit" variant="secondary">
              Depósito principal
            </Badge>
          )}
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-5" onSubmit={submit}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      disabled={pending}
                      placeholder="Ej.: Sucursal centro"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código (opcional)</FormLabel>
                  <FormControl>
                    <Input disabled={pending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {booleanFields.map((option) => (
              <FormField
                control={form.control}
                key={option.name}
                name={option.name}
                render={({ field }) => (
                  <FormItem className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <FormLabel>{option.label}</FormLabel>
                        <FormDescription>{option.description}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          disabled={pending}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
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
                {pending ? "Guardando..." : "Guardar depósito"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
