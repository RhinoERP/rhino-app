"use client";

import {
  BriefcaseIcon,
  CalendarCheckIcon,
  GearSixIcon,
  SparkleIcon,
  StackIcon,
  TargetIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OPEN_STAGES } from "@/modules/commercial-ai/constants";
import type { CommercialAiSnapshot } from "@/modules/commercial-ai/types";
import { AssistantTab } from "./assistant-tab";
import { CustomerSheet } from "./customer-sheet";
import { GoalsTab } from "./goals-tab";
import { OpportunitiesTab } from "./opportunities-tab";
import { OpportunitySheet } from "./opportunity-sheet";
import { PortfolioTab } from "./portfolio-tab";
import { SettingsTab } from "./settings-tab";
import { CommercialAiContext, formatDate } from "./shared";
import { TodayTab } from "./today-tab";

export function CommercialAiApp({
  snapshot,
}: {
  snapshot: CommercialAiSnapshot;
}) {
  const isManager = snapshot.role === "gerente";
  const [tab, setTab] = useState("hoy");
  const [opportunityKey, setOpportunityKey] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const openOpportunity = useCallback((key: string, nextQueue?: string[]) => {
    setCustomerId(null);
    setQueue(nextQueue ?? []);
    setOpportunityKey(key);
  }, []);

  const openCustomer = useCallback((id: string) => {
    setOpportunityKey(null);
    setCustomerId(id);
  }, []);

  const context = useMemo(
    () => ({
      snapshot,
      isManager,
      openOpportunity,
      openCustomer,
      goToTab: setTab,
    }),
    [snapshot, isManager, openOpportunity, openCustomer]
  );

  const openCount = snapshot.opportunities.filter((o) =>
    OPEN_STAGES.includes(o.effectiveStage)
  ).length;

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
                ? "Toda la cartera del equipo: a quién recuperar, dónde crecer y cómo vienen las metas."
                : "Tu cartera: a quién llamar hoy, qué ofrecer y cómo venís con la meta."}
            </p>
          </div>
          {snapshot.dataAsOf ? (
            <p className="text-muted-foreground text-xs">
              Ventas al {formatDate(snapshot.dataAsOf)}
            </p>
          ) : null}
        </div>

        <Tabs onValueChange={setTab} value={tab}>
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList>
              <TabsTrigger value="hoy">
                <CalendarCheckIcon weight="duotone" />
                Hoy
              </TabsTrigger>
              <TabsTrigger value="oportunidades">
                <StackIcon weight="duotone" />
                Oportunidades
                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                  {openCount}
                </span>
              </TabsTrigger>
              <TabsTrigger value="cartera">
                <BriefcaseIcon weight="duotone" />
                Cartera
              </TabsTrigger>
              <TabsTrigger value="objetivos">
                <TargetIcon weight="duotone" />
                Objetivos
              </TabsTrigger>
              <TabsTrigger value="asistente">
                <SparkleIcon weight="duotone" />
                Asistente
              </TabsTrigger>
              {isManager ? (
                <TabsTrigger value="configuracion">
                  <GearSixIcon weight="duotone" />
                  Configuración
                </TabsTrigger>
              ) : null}
            </TabsList>
          </div>

          <TabsContent className="mt-3" value="hoy">
            <TodayTab />
          </TabsContent>
          <TabsContent className="mt-3" value="oportunidades">
            <OpportunitiesTab />
          </TabsContent>
          <TabsContent className="mt-3" value="cartera">
            <PortfolioTab />
          </TabsContent>
          <TabsContent className="mt-3" value="objetivos">
            <GoalsTab />
          </TabsContent>
          <TabsContent className="mt-3" value="asistente">
            <AssistantTab />
          </TabsContent>
          {isManager ? (
            <TabsContent className="mt-3" value="configuracion">
              <SettingsTab />
            </TabsContent>
          ) : null}
        </Tabs>
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
    </CommercialAiContext.Provider>
  );
}
