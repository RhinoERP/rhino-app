"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveSellerPhoneAction } from "@/modules/commercial-ai/actions/whatsapp.actions";
import type { CommercialAiSeller } from "@/modules/commercial-ai/types";
import { useCommercialAi } from "./shared";

/** Configuración del asistente del vendedor por WhatsApp (solo gerentes). */
export function WhatsAppSettings() {
  const { snapshot } = useCommercialAi();
  const { whatsapp } = snapshot;

  return (
    <div className="space-y-4">
      <Card className="gap-2 p-4 text-sm">
        <h3 className="font-semibold text-base">
          RHINO por WhatsApp para vendedores
        </h3>
        <p className="text-muted-foreground">
          El vendedor le escribe al WhatsApp de la empresa
          {whatsapp.displayNumber ? ` (${whatsapp.displayNumber})` : ""} y le
          responde RHINO, el asistente comercial: su día, a quién llamar, el
          mensaje listo para el cliente y sus pendientes. Si le cuenta una
          visita (&quot;pasé por El Obrero, pidieron 20 kg de muzza&quot;) o
          algo para otro día (&quot;recordame llamar a Morini el jueves&quot;),
          queda anotado en Rhinos.
        </p>
        <p className="text-muted-foreground">
          Solo responde a los celulares cargados acá. Los demás números siguen
          yendo al agente de pedidos de clientes.
        </p>
        {whatsapp.connected ? null : (
          <p className="rounded-md bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Todavía no hay un número de WhatsApp conectado.{" "}
            <Link
              className="underline"
              href={`/org/${snapshot.orgSlug}/whatsapp/configuracion`}
            >
              Conectalo en WhatsApp → Configuración
            </Link>
            .
          </p>
        )}
      </Card>

      <Card className="gap-0 p-0">
        <div className="border-b p-4">
          <h3 className="font-semibold">Celulares de los vendedores</h3>
          <p className="text-muted-foreground text-sm">
            Cada uno ve solo su cartera: sus clientes, sus ventas y su meta, y
            solo puede cargar pedidos de sus clientes. Con &quot;Resumen
            diario&quot; prendido, cada mañana (lunes a sábado, 8:30) le llega
            su día por WhatsApp. &quot;Toda la empresa&quot; deja que un gerente
            consulte los números de todo el equipo por WhatsApp.
          </p>
        </div>
        {snapshot.sellers.length === 0 ? (
          <p className="p-4 text-muted-foreground text-sm">
            No hay vendedores en el equipo.
          </p>
        ) : (
          snapshot.sellers.map((seller) => (
            <SellerPhoneRow key={seller.id} seller={seller} />
          ))
        )}
      </Card>
    </div>
  );
}

function SellerPhoneRow({ seller }: { seller: CommercialAiSeller }) {
  const { snapshot } = useCommercialAi();
  const saved = snapshot.whatsapp.phones.find((p) => p.userId === seller.id);
  const [phone, setPhone] = useState(saved?.phone ?? "");
  const [dailyDigest, setDailyDigest] = useState(saved?.dailyDigest ?? true);
  const [teamView, setTeamView] = useState(saved?.teamView ?? false);
  const [pending, startTransition] = useTransition();
  const changed =
    phone !== (saved?.phone ?? "") ||
    dailyDigest !== (saved?.dailyDigest ?? true) ||
    teamView !== (saved?.teamView ?? false);

  const save = () =>
    startTransition(async () => {
      const result = await saveSellerPhoneAction(snapshot.orgSlug, {
        userId: seller.id,
        phone,
        dailyDigest,
        teamView,
      });
      if (result.success) {
        toast.success(
          phone.trim()
            ? `Listo: ${seller.shortName} ya puede escribirle a RHINO.`
            : `Se quitó el celular de ${seller.shortName}.`
        );
      } else {
        toast.error(result.error);
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-3 border-b p-4 last:border-b-0">
      <div className="flex min-w-40 flex-1 items-center gap-2">
        <span
          aria-hidden
          className="size-2.5 rounded-full"
          style={{ background: seller.color }}
        />
        <span className="font-medium">{seller.name}</span>
      </div>
      <Input
        aria-label={`Celular de ${seller.name}`}
        className="w-48"
        inputMode="tel"
        onChange={(e) => setPhone(e.target.value)}
        placeholder="11 2345 6789"
        value={phone}
      />
      <div className="flex items-center gap-2 text-sm">
        <Switch
          aria-label={`Resumen diario para ${seller.name}`}
          checked={dailyDigest}
          id={`digest-${seller.id}`}
          onCheckedChange={setDailyDigest}
        />
        <label htmlFor={`digest-${seller.id}`}>Resumen diario</label>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Switch
          aria-label={`${seller.name} ve toda la empresa por WhatsApp`}
          checked={teamView}
          id={`team-${seller.id}`}
          onCheckedChange={setTeamView}
        />
        <label
          htmlFor={`team-${seller.id}`}
          title="Solo para gerentes. A un vendedor no le cambia nada."
        >
          Toda la empresa
        </label>
      </div>
      <Button
        disabled={pending || !changed}
        onClick={save}
        size="sm"
        variant={changed ? "default" : "outline"}
      >
        Guardar
      </Button>
    </div>
  );
}
