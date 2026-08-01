"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createChequeRecibidoAction } from "@/modules/treasury/actions/checks.action";

const formSchema = z.object({
  numeroCheque: z.string().min(1).max(50),
  bancoEmisor: z.string().min(1).max(100),
  tipo: z.enum(["CDF", "ECH"]),
  importe: z.string().regex(/^\d+(\.\d{1,4})?$/, "Importe inválido"),
  fechaEmision: z.string().min(1, "Requerido"),
  fechaVencimiento: z.string().min(1, "Requerido"),
  librador: z.string().max(200).optional(),
  notas: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  onSuccess?: () => void;
};

export function ReceivedCheckFormDialog({
  open,
  onOpenChange,
  orgSlug,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const today = new Date().toISOString().split("T")[0] ?? "";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      numeroCheque: "",
      bancoEmisor: "",
      tipo: "CDF" as const,
      importe: "",
      fechaEmision: today,
      fechaVencimiento: today,
      librador: "",
      notas: "",
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createChequeRecibidoAction(orgSlug, {
        numeroCheque: values.numeroCheque,
        bancoEmisor: values.bancoEmisor,
        tipo: values.tipo,
        importe: values.importe,
        fechaEmision: values.fechaEmision,
        fechaVencimiento: values.fechaVencimiento,
        librador: values.librador || undefined,
        notas: values.notas || undefined,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Cheque recibido registrado en cartera");
      form.reset();
      onOpenChange(false);
      onSuccess?.();
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cargar cheque recibido</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="numeroCheque"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° de cheque</FormLabel>
                    <FormControl>
                      <Input placeholder="00001234" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bancoEmisor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Banco emisor</FormLabel>
                    <FormControl>
                      <Input placeholder="Banco BBVA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de cheque</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CDF">
                        CDF — Cheque diferido físico
                      </SelectItem>
                      <SelectItem value="ECH">ECH — E-cheq</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="importe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Importe</FormLabel>
                  <FormControl>
                    <Input placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fechaEmision"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de emisión</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fechaVencimiento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de vencimiento</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="librador"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Librador (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del librador" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Observaciones" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? "Guardando..." : "Cargar cheque"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
