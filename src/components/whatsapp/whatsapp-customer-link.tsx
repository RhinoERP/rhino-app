"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
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
import {
  linkWhatsAppCustomerAction,
  searchWhatsAppCustomerLinks,
} from "@/modules/whatsapp/actions/link-whatsapp-customer.action";
import type { InboxDetail } from "@/modules/whatsapp/inbox-contract";

const reviewMessages = {
  AMBIGUOUS_PHONE:
    "El teléfono figura en más de una ficha activa. Corregí los teléfonos desde Clientes.",
  CUSTOMER_WITHOUT_LIST: "El cliente no tiene una lista de venta asignada.",
  LIST_UNAVAILABLE: "La lista de venta aplicable no está vigente.",
  UNREGISTERED:
    "El agente está configurado para atender solo a clientes registrados.",
};

type CustomerLinkProps = {
  chat: InboxDetail;
  disabled: boolean;
  orgSlug: string;
  onLinked: () => void;
};

export function WhatsAppCustomerLink({
  chat,
  disabled,
  orgSlug,
  onLinked,
}: Omit<CustomerLinkProps, "chat"> & { chat?: InboxDetail }) {
  if (!chat || chat.isSimulator || (chat.customerId && !chat.pricingReview)) {
    return null;
  }
  return (
    <section
      aria-label="Cliente de la conversación"
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/35 p-2 text-sm sm:px-3"
    >
      <div>
        {!chat.customerId && (
          <p className="font-medium">Pendiente de vincular</p>
        )}
        {chat.pricingReview && (
          <p className="text-muted-foreground">
            {reviewMessages[chat.pricingReview]}
          </p>
        )}
      </div>
      {chat.canLinkCustomer && chat.customerId && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/org/${orgSlug}/clientes/${chat.customerId}`}>
            Ver ficha
          </Link>
        </Button>
      )}
      {chat.canLinkCustomer &&
        !chat.customerId &&
        chat.pricingReview !== "AMBIGUOUS_PHONE" && (
          <div className="flex flex-wrap gap-2">
            <LinkCustomerDialog
              chat={chat}
              disabled={disabled}
              onLinked={onLinked}
              orgSlug={orgSlug}
            />
            <AddCustomerDialog
              fromWhatsApp={{
                phone: `+${chat.customerPhone}`,
                save: async (values) => {
                  const result = await linkWhatsAppCustomerAction(
                    orgSlug,
                    chat.id,
                    { create: values }
                  );
                  if (!result.success) {
                    throw new Error(result.error);
                  }
                  toast.success("Cliente creado y vinculado");
                },
              }}
              onCreated={onLinked}
              orgSlug={orgSlug}
              trigger={
                <Button disabled={disabled} size="sm" variant="outline">
                  Crear cliente
                </Button>
              }
            />
          </div>
        )}
    </section>
  );
}

function LinkCustomerDialog({
  chat,
  disabled,
  orgSlug,
  onLinked,
}: CustomerLinkProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const search = useQuery({
    enabled: open,
    queryKey: ["whatsapp-customer-links", orgSlug, chat.id, query.trim()],
    queryFn: () => searchWhatsAppCustomerLinks(orgSlug, chat.id, query.trim()),
    retry: false,
    gcTime: 0,
  });

  function link(customerId: string) {
    startTransition(async () => {
      const result = await linkWhatsAppCustomerAction(orgSlug, chat.id, {
        customerId,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("Cliente vinculado");
      onLinked();
    });
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button disabled={disabled} size="sm" variant="outline">
          Vincular cliente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular cliente</DialogTitle>
          <DialogDescription>
            Elegí la ficha que corresponde a este número. Si la ficha no tiene
            teléfono, se guardará el del chat.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Buscar por nombre o CUIT"
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o CUIT"
          value={query}
        />
        {search.isPending && <output>Buscando fichas…</output>}
        {search.isError && (
          <p role="alert">No se pudieron buscar fichas. Volvé a intentar.</p>
        )}
        {search.data?.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No hay fichas que coincidan.
          </p>
        )}
        {!!search.data?.length && (
          <ul className="max-h-64 space-y-2 overflow-auto">
            {search.data.map((candidate) => (
              <li
                className="flex items-center justify-between gap-3"
                key={candidate.id}
              >
                <span className="min-w-0 break-words text-sm">
                  {candidate.name}
                  {candidate.samePhone ? " · Mismo número" : ""}
                </span>
                <Button
                  disabled={pending || disabled}
                  onClick={() => link(candidate.id)}
                  size="sm"
                  variant="outline"
                >
                  Vincular
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
