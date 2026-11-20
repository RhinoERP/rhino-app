"use client";

import { DownloadSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { createProspectAction } from "@/modules/commercial-ai/actions/prospecting.actions";
import { PROSPECT_STAGES } from "@/modules/commercial-ai/constants";
import type {
  ProspectStage,
  ProspectView,
} from "@/modules/commercial-ai/types";
import { Chip } from "./opportunities-tab";
import { CustomerAvatar, SellerChip, useCommercialAi } from "./shared";

const ALL = "todos";
const HIGH_FIT = 80;
const MID_FIT = 60;

const CSV_SPECIAL_CHARS = /[",;\n]/;
const QUOTE = /"/g;

function fitClassName(score: number): string {
  if (score >= HIGH_FIT) {
    return "border-emerald-600 text-emerald-700 dark:text-emerald-400";
  }
  if (score >= MID_FIT) {
    return "border-lime-600 text-lime-700 dark:text-lime-400";
  }
  return "border-amber-500 text-amber-700 dark:text-amber-400";
}

export function FitBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "inline-grid size-9 place-items-center rounded-full border-2 font-semibold text-sm tabular-nums",
        fitClassName(score)
      )}
      title="Encaje con el perfil de cliente ideal"
    >
      {score}
    </span>
  );
}

export function ProspectStageBadge({ stage }: { stage: ProspectStage }) {
  return (
    <Badge
      className={cn(
        "border-transparent font-medium",
        PROSPECT_STAGES[stage].className
      )}
    >
      {PROSPECT_STAGES[stage].label}
    </Badge>
  );
}

function toCsv(
  rows: ProspectView[],
  campaignName: (id: string | null) => string,
  sellerName: (id: string | null) => string
) {
  const header = [
    "Nombre",
    "Rubro",
    "Dirección",
    "Localidad",
    "Provincia",
    "Teléfono",
    "Email",
    "Web",
    "Encaje",
    "Etapa",
    "Campaña",
    "Vendedor",
  ];
  const csvCell = (value: string | number | null) => {
    const text = String(value ?? "");
    return CSV_SPECIAL_CHARS.test(text)
      ? `"${text.replace(QUOTE, '""')}"`
      : text;
  };
  return [
    header.join(","),
    ...rows.map((p) =>
      [
        p.name,
        p.category,
        p.address,
        p.city,
        p.province,
        p.phone,
        p.email,
        p.website,
        p.fitScore,
        PROSPECT_STAGES[p.stage].label,
        campaignName(p.campaignId),
        sellerName(p.sellerId),
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\n");
}

export function ProspectsTab() {
  const { snapshot, isManager, openProspect } = useCommercialAi();
  const { prospects, campaigns } = snapshot.prospecting;
  const [stage, setStage] = useState<ProspectStage | typeof ALL>(ALL);
  const [campaign, setCampaign] = useState(ALL);
  const [seller, setSeller] = useState(ALL);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const campaignName = (id: string | null) =>
    campaigns.find((c) => c.id === id)?.name ??
    (id ? "Campaña" : "Carga manual");
  const sellerName = (id: string | null) =>
    snapshot.sellers.find((s) => s.id === id)?.name ?? "Sin asignar";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prospects.filter(
      (p) =>
        (stage === ALL || p.stage === stage) &&
        (campaign === ALL || (p.campaignId ?? "manual") === campaign) &&
        (seller === ALL || (p.sellerId ?? "sin-asignar") === seller) &&
        (!q ||
          `${p.name} ${p.city ?? ""} ${p.category ?? ""}`
            .toLowerCase()
            .includes(q))
    );
  }, [prospects, stage, campaign, seller, query]);

  const exportCsv = () => {
    const blob = new Blob([`﻿${toCsv(filtered, campaignName, sellerName)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prospectos-${snapshot.today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-xl">Prospectos</h2>
        <div className="ml-auto flex gap-2">
          <Button
            disabled={!filtered.length}
            onClick={exportCsv}
            size="sm"
            variant="outline"
          >
            <DownloadSimpleIcon />
            Exportar CSV
          </Button>
          <Button onClick={() => setCreating((v) => !v)} size="sm">
            <PlusIcon />
            Nuevo prospecto
          </Button>
        </div>
      </div>

      {creating ? <NewProspectForm onDone={() => setCreating(false)} /> : null}

      <div className="flex flex-wrap gap-2">
        <Chip active={stage === ALL} onClick={() => setStage(ALL)}>
          Todos <span className="opacity-70">{prospects.length}</span>
        </Chip>
        {(Object.keys(PROSPECT_STAGES) as ProspectStage[]).map((s) => (
          <Chip active={stage === s} key={s} onClick={() => setStage(s)}>
            {PROSPECT_STAGES[s].label}
            <span className="opacity-70">
              {prospects.filter((p) => p.stage === s).length}
            </span>
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Buscar prospecto"
          className="min-w-48 flex-1"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, rubro o localidad"
          value={query}
        />
        <Select onValueChange={setCampaign} value={campaign}>
          <SelectTrigger aria-label="Campaña" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las campañas</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
            <SelectItem value="manual">Carga manual</SelectItem>
          </SelectContent>
        </Select>
        {isManager ? (
          <Select onValueChange={setSeller} value={seller}>
            <SelectTrigger aria-label="Vendedor" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los vendedores</SelectItem>
              {snapshot.sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
              <SelectItem value="sin-asignar">Sin asignar</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prospecto</TableHead>
                {isManager ? <TableHead>Vendedor</TableHead> : null}
                <TableHead>Localidad</TableHead>
                <TableHead className="text-center">Encaje</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Campaña</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length ? (
                filtered.map((prospect) => (
                  <TableRow
                    className="cursor-pointer"
                    key={prospect.id}
                    onClick={() => openProspect(prospect.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CustomerAvatar name={prospect.name} size={32} />
                        <div className="min-w-0">
                          <button
                            className="font-medium hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openProspect(prospect.id);
                            }}
                            type="button"
                          >
                            {prospect.name}
                          </button>
                          {prospect.category ? (
                            <p className="text-muted-foreground text-xs">
                              {prospect.category}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    {isManager ? (
                      <TableCell>
                        <SellerChip sellerId={prospect.sellerId} />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      {[prospect.city, prospect.province]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <FitBadge score={prospect.fitScore} />
                    </TableCell>
                    <TableCell>
                      <ProspectStageBadge stage={prospect.stage} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {campaignName(prospect.campaignId)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    className="py-6 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    {prospects.length
                      ? "No hay prospectos con estos filtros."
                      : "Todavía no hay prospectos. Corré una campaña o cargá uno a mano."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function NewProspectForm({ onDone }: { onDone: () => void }) {
  const { snapshot, isManager, openProspect } = useCommercialAi();
  const [form, setForm] = useState({
    name: "",
    category: "",
    address: "",
    city: "",
    phone: "",
  });
  const [sellerId, setSellerId] = useState<string>(
    isManager ? "" : snapshot.currentUserId
  );
  const [pending, startTransition] = useTransition();
  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = () =>
    startTransition(async () => {
      const result = await createProspectAction(snapshot.orgSlug, {
        name: form.name,
        category: form.category || null,
        address: form.address || null,
        city: form.city || null,
        phone: form.phone || null,
        sellerId: sellerId || null,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Prospecto cargado.");
      onDone();
      if (result.id) {
        openProspect(result.id);
      }
    });

  return (
    <Card className="gap-3 p-4">
      <div className="grid gap-2 md:grid-cols-3">
        <Input
          aria-label="Nombre"
          onChange={set("name")}
          placeholder="Nombre del comercio *"
          value={form.name}
        />
        <Input
          aria-label="Rubro"
          onChange={set("category")}
          placeholder="Rubro (ej: pizzería)"
          value={form.category}
        />
        <Input
          aria-label="Teléfono"
          onChange={set("phone")}
          placeholder="Teléfono / WhatsApp"
          value={form.phone}
        />
        <Input
          aria-label="Dirección"
          onChange={set("address")}
          placeholder="Dirección"
          value={form.address}
        />
        <Input
          aria-label="Localidad"
          onChange={set("city")}
          placeholder="Localidad"
          value={form.city}
        />
        {isManager ? (
          <Select onValueChange={setSellerId} value={sellerId}>
            <SelectTrigger aria-label="Vendedor">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              {snapshot.sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone} variant="ghost">
          Cancelar
        </Button>
        <Button disabled={pending || !form.name.trim()} onClick={save}>
          Guardar
        </Button>
      </div>
    </Card>
  );
}
