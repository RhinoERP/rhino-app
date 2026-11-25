"use client";

import { useId, useState } from "react";
import { CAI_ERROR, CAI_PRIMARY_ACTION } from "@/components/arca/cai-ui-styles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { CaiActivation, CaiAuthorization } from "@/modules/arca/cai";
import { caiActivationSchema } from "@/modules/arca/cai";
import { CaiField, type CaiUiResult } from "./cai-field";

export function CaiAuthorizationDialog({
  authorization,
  lastUsed,
  pending,
  onActivate,
}: {
  authorization: CaiAuthorization;
  lastUsed: number;
  pending: boolean;
  onActivate: (input: CaiActivation) => Promise<CaiUiResult>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const confirmId = useId();
  const preprinted = authorization.mode === "preprinted";
  return (
    <Dialog
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError("");
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button disabled={pending} size="sm" variant="outline">
          Verificar y activar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Activar CAI {authorization.cai}</DialogTitle>
          <DialogDescription>
            Contrastá estos datos con la constancia de ARCA. Al activar, esta
            autorización reemplazará la anterior para el mismo punto de venta.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const parsed = caiActivationSchema.safeParse({
              authorizationId: authorization.id,
              firstNumber: Number(data.get("firstNumber")),
              lastNumber: data.get("lastNumber")
                ? Number(data.get("lastNumber"))
                : null,
              lastUsedNumber: Number(data.get("lastUsedNumber")),
              printerName: String(data.get("printerName") ?? ""),
              printerCuit: String(data.get("printerCuit") ?? ""),
              printerRegistration: String(
                data.get("printerRegistration") ?? ""
              ),
              printedAt: String(data.get("printedAt") ?? ""),
              evidence: String(data.get("evidence") ?? ""),
              confirmed: data.get("confirmed") === "on",
            });
            if (!parsed.success) {
              setError(parsed.error.issues[0].message);
              const field = event.currentTarget.elements.namedItem(
                String(parsed.error.issues[0].path[0])
              );
              if (field instanceof HTMLElement) {
                field.focus();
              }
              return;
            }
            setError("");
            const result = await onActivate(parsed.data);
            if (result.success) {
              setOpen(false);
            } else {
              setError(result.error);
            }
          }}
        >
          <fieldset className="space-y-4" disabled={pending}>
            <div className="grid gap-4 sm:grid-cols-2">
              <CaiField
                defaultValue={preprinted ? undefined : 1}
                label="Primer número autorizado"
                max={99_999_999}
                min={1}
                name="firstNumber"
                required
                type="number"
              />
              <CaiField
                description={
                  preprinted
                    ? "Usá el final del rango de la constancia."
                    : "Dejalo vacío si la autorización no establece un límite."
                }
                label="Último número autorizado"
                max={99_999_999}
                min={1}
                name="lastNumber"
                required={preprinted}
                type="number"
              />
            </div>
            <CaiField
              defaultValue={lastUsed}
              description="Incluí los remitos ya utilizados fuera de Rhino. El próximo usará este número + 1."
              label="Último número utilizado"
              max={99_999_998}
              min={lastUsed}
              name="lastUsedNumber"
              required
              type="number"
            />
            {preprinted && (
              <div className="grid gap-4 sm:grid-cols-2">
                <CaiField
                  label="Razón social de la imprenta"
                  name="printerName"
                  required
                />
                <CaiField
                  inputMode="numeric"
                  label="CUIT de la imprenta"
                  maxLength={11}
                  name="printerCuit"
                  pattern="[0-9]{11}"
                  required
                />
                <CaiField
                  label="Habilitación de la imprenta"
                  name="printerRegistration"
                  required
                />
                <CaiField
                  label="Fecha de impresión"
                  name="printedAt"
                  required
                  type="date"
                />
              </div>
            )}
            <CaiField
              description="Por ejemplo, número de solicitud y referencia al archivo de la constancia conservada por la empresa."
              label="Referencia de la constancia"
              maxLength={500}
              name="evidence"
              required
            />
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                className="mt-1"
                id={confirmId}
                name="confirmed"
                required
              />
              <Label className="text-sm leading-relaxed" htmlFor={confirmId}>
                {preprinted
                  ? "Verifiqué el CAI, su vencimiento, el rango y los datos de la imprenta."
                  : "Verifiqué la constancia, la numeración y que la empresa está habilitada para emitir estos remitos desde su sistema como autoimpresor."}
              </Label>
            </div>
          </fieldset>
          {error && (
            <p className={CAI_ERROR} role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              className={CAI_PRIMARY_ACTION}
              disabled={pending}
              type="submit"
            >
              {pending ? "Activando…" : "Activar autorización"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
