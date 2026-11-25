"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { CAI_ERROR, CAI_PRIMARY_ACTION } from "@/components/arca/cai-ui-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmRemittanceReceiptAction } from "@/modules/orders/actions/remittance-receipt.actions";

export function RemittanceReceiptForm({ token }: { token: string }) {
  const router = useRouter();
  const id = useId();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  if (confirmed) {
    return (
      <p aria-live="polite" className="rounded-lg border p-4 text-sm">
        Recepción confirmada. La constancia quedó guardada.
      </p>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pendingRef.current) {
          return;
        }
        const name = String(
          new FormData(event.currentTarget).get("name") ?? ""
        );
        pendingRef.current = true;
        setPending(true);
        setError("");
        try {
          const result = await confirmRemittanceReceiptAction(token, name);
          if (result.success) {
            setConfirmed(true);
            router.refresh();
          } else {
            setError(result.error);
          }
        } catch {
          setError(
            "No se pudo obtener la respuesta. Podés volver a confirmar sin duplicar la recepción."
          );
        } finally {
          pendingRef.current = false;
          setPending(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={id}>Nombre y apellido de quien recibe</Label>
        <Input
          autoComplete="name"
          disabled={pending}
          id={id}
          maxLength={200}
          minLength={2}
          name="name"
          required
        />
      </div>
      <p className="text-muted-foreground text-sm">
        Al confirmar, dejás constancia de que recibiste los bienes documentados
        en este remito.
      </p>
      {error && (
        <p className={CAI_ERROR} role="alert">
          {error}
        </p>
      )}
      <Button
        className={`w-full ${CAI_PRIMARY_ACTION}`}
        disabled={pending}
        type="submit"
      >
        {pending ? "Confirmando…" : "Confirmar recepción"}
      </Button>
    </form>
  );
}
