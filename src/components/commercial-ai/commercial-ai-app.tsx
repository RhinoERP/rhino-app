"use client";

import {
  BriefcaseIcon,
  CalendarCheckIcon,
  GearSixIcon,
  GraduationCapIcon,
  type Icon,
  MapTrifoldIcon,
  MegaphoneIcon,
  SparkleIcon,
  StackIcon,
  StorefrontIcon,
  TargetIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { OPEN_STAGES } from "@/modules/commercial-ai/constants";
import type { CommercialAiSnapshot } from "@/modules/commercial-ai/types";
import { AssistantTab } from "./assistant-tab";
import { CampaignsTab } from "./campaigns-tab";
import { CustomerSheet } from "./customer-sheet";
import { GoalsTab } from "./goals-tab";
import { LearningsTab } from "./learnings-tab";
import { OpportunitiesTab } from "./opportunities-tab";
import { OpportunitySheet } from "./opportunity-sheet";
import { PortfolioTab } from "./portfolio-tab";
import { ProspectSheet } from "./prospect-sheet";
import { ProspectsTab } from "./prospects-tab";
import { RoutesTab } from "./routes-tab";
import { SettingsTab } from "./settings-tab";
import { CommercialAiContext, formatDate } from "./shared";
import { TodayTab } from "./today-tab";

type Section =
  | "hoy"
  | "asistente"
  | "oportunidades"
  | "objetivos"
  | "rutas"
  | "aprendizajes"
  | "campanas"
  | "prospectos"
  | "cartera"
  | "configuracion";

type NavItem = {
  key: Section;
  label: string;
  icon: Icon;
  managerOnly?: boolean;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Día a día",
    items: [
      { key: "hoy", label: "Hoy", icon: CalendarCheckIcon },
      { key: "asistente", label: "Asistente", icon: SparkleIcon },
      { key: "oportunidades", label: "Oportunidades", icon: StackIcon },
      { key: "objetivos", label: "Objetivos", icon: TargetIcon },
      { key: "rutas", label: "Rutas", icon: MapTrifoldIcon },
      { key: "aprendizajes", label: "Aprendizajes", icon: GraduationCapIcon },
    ],
  },
  {
    title: "Prospección",
    items: [
      { key: "campanas", label: "Campañas", icon: MegaphoneIcon },
      { key: "prospectos", label: "Prospectos", icon: StorefrontIcon },
    ],
  },
  {
    title: "Cartera",
    items: [{ key: "cartera", label: "Clientes", icon: BriefcaseIcon }],
  },
  {
    title: "Ajustes",
    items: [
      {
        key: "configuracion",
        label: "Configuración",
        icon: GearSixIcon,
        managerOnly: true,
      },
    ],
  },
];

const SECTION_VIEWS: Record<Section, () => React.ReactNode> = {
  hoy: () => <TodayTab />,
  asistente: () => <AssistantTab />,
  oportunidades: () => <OpportunitiesTab />,
  objetivos: () => <GoalsTab />,
  rutas: () => <RoutesTab />,
  aprendizajes: () => <LearningsTab />,
  campanas: () => <CampaignsTab />,
  prospectos: () => <ProspectsTab />,
  cartera: () => <PortfolioTab />,
  configuracion: () => <SettingsTab />,
};

export function CommercialAiApp({
  snapshot,
}: {
  snapshot: CommercialAiSnapshot;
}) {
  const isManager = snapshot.role === "gerente";
  const [section, setSection] = useState<Section>("hoy");
  const [opportunityKey, setOpportunityKey] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [prospectId, setProspectId] = useState<string | null>(null);

  const closeAll = useCallback(() => {
    setOpportunityKey(null);
    setCustomerId(null);
    setProspectId(null);
  }, []);

  const openOpportunity = useCallback(
    (key: string, nextQueue?: string[]) => {
      closeAll();
      setQueue(nextQueue ?? []);
      setOpportunityKey(key);
    },
    [closeAll]
  );

  const openCustomer = useCallback(
    (id: string) => {
      closeAll();
      setCustomerId(id);
    },
    [closeAll]
  );

  const openProspect = useCallback(
    (id: string) => {
      closeAll();
      setProspectId(id);
    },
    [closeAll]
  );

  const context = useMemo(
    () => ({
      snapshot,
      isManager,
      openOpportunity,
      openCustomer,
      openProspect,
      goToTab: (tab: string) => setSection(tab as Section),
    }),
    [snapshot, isManager, openOpportunity, openCustomer, openProspect]
  );

  const counts: Partial<Record<Section, number>> = {
    oportunidades: snapshot.opportunities.filter((o) =>
      OPEN_STAGES.includes(o.effectiveStage)
    ).length,
    prospectos: snapshot.prospecting.prospects.filter(
      (p) => p.stage === "sin_contactar"
    ).length,
  };

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isManager || !item.managerOnly),
  })).filter((group) => group.items.length);

  return (
    <CommercialAiContext.Provider value={context}>
      <div className="space-y-5">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl">
              IA Comercial
              <Badge variant="secondary">
                {isManager ? "Gerente" : "Vendedor"}
              </Badge>
            </h1>
            <p className="text-muted-foreground text-sm">
              {isManager
                ? "Toda la cartera del equipo: a quién recuperar, dónde crecer, a quién prospectar y cómo vienen las metas."
                : "Tu cartera: a quién llamar o visitar hoy, qué ofrecer y cómo venís con la meta."}
            </p>
          </div>
          {snapshot.dataAsOf ? (
            <p className="text-muted-foreground text-xs">
              Ventas al {formatDate(snapshot.dataAsOf)}
            </p>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav
            aria-label="Secciones de IA Comercial"
            className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0"
          >
            {groups.map((group) => (
              <div
                className="contents lg:block lg:space-y-0.5 lg:pb-3"
                key={group.title}
              >
                <p className="hidden px-2 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider lg:block">
                  {group.title}
                </p>
                {group.items.map((item) => {
                  const active = section === item.key;
                  const ItemIcon = item.icon;
                  return (
                    <button
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors lg:w-full",
                        active
                          ? "bg-primary/10 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      key={item.key}
                      onClick={() => setSection(item.key)}
                      type="button"
                    >
                      <ItemIcon className="size-4" weight="duotone" />
                      {item.label}
                      {counts[item.key] ? (
                        <span className="ml-auto rounded-full bg-muted px-1.5 text-xs tabular-nums">
                          {counts[item.key]}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="min-w-0">{SECTION_VIEWS[section]()}</div>
        </div>
      </div>

      <OpportunitySheet
        onClose={() => setOpportunityKey(null)}
        onNavigate={setOpportunityKey}
        opportunityKey={opportunityKey}
        queue={queue}
      />
      <CustomerSheet
        customerId={customerId}
        onClose={() => setCustomerId(null)}
      />
      <ProspectSheet
        onClose={() => setProspectId(null)}
        prospectId={prospectId}
      />
    </CommercialAiContext.Provider>
  );
}
