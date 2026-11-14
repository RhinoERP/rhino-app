"use client";

import { GraduationCapIcon, PlusIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addLearningNoteAction,
  archiveLearningAction,
  saveLearnedPatternAction,
  setMemoryAction,
} from "@/modules/commercial-ai/actions/prospecting.actions";
import { formatDateTime, SectionCard, useCommercialAi } from "./shared";

export function LearningsTab() {
  const { snapshot, isManager } = useCommercialAi();
  const { memoryOn, patterns, learnings } = snapshot.prospecting;
  const [pending, startTransition] = useTransition();
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const active = learnings.filter((l) => l.status !== "descartada");
  const savedTitles = new Set(active.map((l) => l.title));

  const run = (
    action: () => Promise<{ success: boolean; error?: string }>,
    ok: string,
    after?: () => void
  ) =>
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(ok);
        after?.();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl">Aprendizajes</h2>

      <Card className="flex-row flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Lo que aprendió</p>
          <p className="text-muted-foreground text-sm">
            {memoryOn
              ? "La memoria está prendida: miramos lo que el equipo ya decidió (oportunidades, prospectos y visitas) y te mostramos los patrones con suficientes casos."
              : "La memoria está apagada: el sistema no busca patrones."}
          </p>
        </div>
        {isManager ? (
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () => setMemoryAction(snapshot.orgSlug, !memoryOn),
                memoryOn ? "Memoria apagada." : "Memoria prendida."
              )
            }
            variant={memoryOn ? "outline" : "default"}
          >
            {memoryOn ? "Apagar la memoria" : "Prender la memoria"}
          </Button>
        ) : null}
      </Card>

      {memoryOn ? (
        <SectionCard
          description="calculados con los datos de hoy"
          title="Patrones detectados"
        >
          {patterns.length ? (
            patterns.map((pattern) => (
              <div
                className="flex flex-wrap items-start gap-3 border-t px-4 py-3"
                key={pattern.key}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{pattern.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {pattern.detail}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Sobre {pattern.sample} casos
                  </p>
                </div>
                {isManager && !savedTitles.has(pattern.title) ? (
                  <Button
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          saveLearnedPatternAction(snapshot.orgSlug, {
                            title: pattern.title,
                            body: pattern.detail,
                          }),
                        "Guardado para el equipo."
                      )
                    }
                    size="sm"
                    variant="outline"
                  >
                    Guardar para el equipo
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="border-t px-4 py-4 text-muted-foreground text-sm">
              Todavía no hay suficientes decisiones para ver patrones. Hacen
              falta al menos 3 casos de cada lado (oportunidades ganadas o
              perdidas, prospectos contactados, visitas registradas).
            </p>
          )}
        </SectionCard>
      ) : null}

      <SectionCard
        right={
          <Button
            onClick={() => setWriting((v) => !v)}
            size="sm"
            variant="outline"
          >
            <PlusIcon />
            Nueva nota
          </Button>
        }
        title="Notas del equipo"
      >
        {writing ? (
          <form
            className="space-y-2 border-t p-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => addLearningNoteAction(snapshot.orgSlug, { title, body }),
                "Nota guardada.",
                () => {
                  setTitle("");
                  setBody("");
                  setWriting(false);
                }
              );
            }}
          >
            <Input
              aria-label="Título"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Las pizzerías compran los lunes"
              value={title}
            />
            <Textarea
              aria-label="Detalle"
              onChange={(e) => setBody(e.target.value)}
              placeholder="Qué aprendimos y qué conviene hacer"
              rows={3}
              value={body}
            />
            <Button disabled={pending || !title.trim()} type="submit">
              Guardar
            </Button>
          </form>
        ) : null}
        {active.length
          ? active.map((learning) => (
              <div
                className="flex items-start gap-3 border-t px-4 py-3"
                key={learning.id}
              >
                <GraduationCapIcon
                  className="mt-0.5 size-5 text-primary"
                  weight="duotone"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {learning.title}
                    <Badge variant="outline">
                      {learning.kind === "patron" ? "Patrón" : "Nota"}
                    </Badge>
                  </p>
                  {learning.body ? (
                    <p className="text-muted-foreground text-sm">
                      {learning.body}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground text-xs">
                    {learning.actorName ?? "Equipo"} ·{" "}
                    {formatDateTime(learning.createdAt)}
                  </p>
                </div>
                {isManager ? (
                  <Button
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          archiveLearningAction(snapshot.orgSlug, learning.id),
                        "Archivado."
                      )
                    }
                    size="sm"
                    variant="ghost"
                  >
                    Archivar
                  </Button>
                ) : null}
              </div>
            ))
          : null}
        {active.length === 0 && !writing ? (
          <p className="border-t px-4 py-4 text-muted-foreground text-sm">
            Todavía no hay notas. ¿Querés dejar algo anotado para el equipo?
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}
