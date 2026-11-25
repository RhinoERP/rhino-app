"use client";

import { useState } from "react";
import { CAI_ERROR, CAI_PRIMARY_ACTION } from "@/components/arca/cai-ui-styles";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CaiOperation } from "@/modules/arca/cai";
import { CaiField, type CaiUiResult } from "./cai-field";

export function CaiReconciliationDialog({
  operation,
  pending,
  onReconcile,
}: {
  operation: CaiOperation;
  pending: boolean;
  onReconcile: (input: {
    operationId: string;
    outcome: "not_applied" | "requested" | "cancelled";
    cai: string;
    expiresAt: string;
    evidence: string;
  }) => Promise<CaiUiResult>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<
    "not_applied" | "requested" | "cancelled"
  >("not_applied");
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
          Conciliar con ARCA
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolver un resultado pendiente</DialogTitle>
          <DialogDescription>
            Primero revisá el trámite en ARCA o con AFIP SDK. Registrá el
            resultado comprobado para evitar solicitar o anular un CAI dos
            veces.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setError("");
            const result = await onReconcile({
              operationId: operation.id,
              outcome,
              cai: String(data.get("cai") ?? ""),
              expiresAt: String(data.get("expiresAt") ?? ""),
              evidence: String(data.get("evidence") ?? ""),
            });
            if (result.success) {
              setOpen(false);
            } else {
              setError(result.error);
            }
          }}
        >
          <fieldset className="space-y-4" disabled={pending}>
            <div className="space-y-2">
              <Label htmlFor={`outcome-${operation.id}`}>
                Resultado comprobado
              </Label>
              <Select
                disabled={pending}
                onValueChange={(value) => setOutcome(value as typeof outcome)}
                value={outcome}
              >
                <SelectTrigger
                  className="w-full"
                  id={`outcome-${operation.id}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_applied">
                    El trámite no se aplicó
                  </SelectItem>
                  {operation.kind === "request" && (
                    <SelectItem value="requested">
                      ARCA otorgó el CAI
                    </SelectItem>
                  )}
                  {operation.kind === "cancel" && (
                    <SelectItem value="cancelled">ARCA anuló el CAI</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {outcome !== "not_applied" && (
              <CaiField
                defaultValue={String(operation.params.cai ?? "")}
                inputMode="numeric"
                label="CAI verificado en ARCA"
                maxLength={14}
                name="cai"
                pattern="[0-9]{14}"
                required
              />
            )}
            {outcome === "requested" && (
              <CaiField
                label="Vencimiento autorizado"
                name="expiresAt"
                required
                type="date"
              />
            )}
            <CaiField
              description="Indicá qué consultaste y la referencia de la constancia o respuesta del proveedor."
              label="Comprobación realizada"
              maxLength={500}
              minLength={10}
              name="evidence"
              required
            />
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
              Volver
            </Button>
            <Button
              className={CAI_PRIMARY_ACTION}
              disabled={pending}
              type="submit"
            >
              Registrar resultado
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
