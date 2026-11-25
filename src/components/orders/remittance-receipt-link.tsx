"use client";

import { useId, useState } from "react";
import { CAI_ERROR, CAI_PRIMARY_ACTION } from "@/components/arca/cai-ui-styles";
import { usePermissions } from "@/components/auth/permissions-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRemittanceReceiptLinkAction } from "@/modules/orders/actions/remittance-receipt.actions";

export function RemittanceReceiptLink({
  orgSlug,
  documentId,
}: {
  orgSlug: string;
  documentId: string;
}) {
  const { can } = usePermissions();
  const id = useId();
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  if (!(can("orders.manage") || can("orders.dispatch"))) {
    return null;
  }
  return (
    <Dialog
      onOpenChange={async (open) => {
        if (!open || link || loading) {
          return;
        }
        setLoading(true);
        setError("");
        try {
          const result = await getRemittanceReceiptLinkAction(
            orgSlug,
            documentId
          );
          if (result.success) {
            setLink(new URL(result.path, window.location.origin).href);
          } else {
            setError(result.error);
          }
        } catch {
          setError("No se pudo generar el enlace. Cerrá y volvé a intentarlo.");
        } finally {
          setLoading(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          Compartir recepción
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conformidad de recepción</DialogTitle>
          <DialogDescription>
            Enviá este enlace al destinatario junto con el PDF del remito. Podrá
            confirmar la recepción sin iniciar sesión.
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <p aria-live="polite" className="text-muted-foreground text-sm">
            Generando enlace…
          </p>
        )}
        {error && (
          <p className={CAI_ERROR} role="alert">
            {error}
          </p>
        )}
        {link && (
          <div className="space-y-3">
            <Label htmlFor={id}>Enlace para el destinatario</Label>
            <Input
              id={id}
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={link}
            />
            <Button
              className={CAI_PRIMARY_ACTION}
              onClick={async () => {
                try {
                  setError("");
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setError("Seleccioná el enlace para copiarlo manualmente.");
                }
              }}
              type="button"
            >
              {copied ? "Enlace copiado" : "Copiar enlace"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
