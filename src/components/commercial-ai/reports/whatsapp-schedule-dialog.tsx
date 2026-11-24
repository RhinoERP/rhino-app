"use client";

import { PaperPlaneTiltIcon, WhatsappLogoIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  type SavedReport,
  scheduleReportAction,
  sendReportNowAction,
} from "@/modules/commercial-ai/actions/reports.actions";
import {
  describeSchedule,
  type ReportFrequency,
  type ReportSchedule,
  WEEKDAYS,
} from "@/modules/commercial-ai/reports/whatsapp-report";

const FREQUENCIES: { key: ReportFrequency; label: string }[] = [
  { key: "diario", label: "Todos los días" },
  { key: "semanal", label: "Una vez por semana" },
  { key: "mensual", label: "Una vez por mes" },
];

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 a 21 h
const MONTHDAYS = Array.from({ length: 28 }, (_, i) => i + 1);
// Lunes primero.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DEFAULT_SCHEDULE: ReportSchedule = {
  frequency: "semanal",
  weekday: 1,
  monthday: 1,
  hour: 8,
  active: true,
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function WhenFields({
  value,
  onChange,
}: {
  value: ReportSchedule;
  onChange: (next: ReportSchedule) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {value.frequency === "semanal" ? (
        <div className="space-y-1">
          <Label>Día</Label>
          <Select
            onValueChange={(v) => onChange({ ...value, weekday: Number(v) })}
            value={String(value.weekday)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEK_ORDER.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {capitalize(WEEKDAYS[d] ?? "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {value.frequency === "mensual" ? (
        <div className="space-y-1">
          <Label>Día del mes</Label>
          <Select
            onValueChange={(v) => onChange({ ...value, monthday: Number(v) })}
            value={String(value.monthday)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHDAYS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label>Hora</Label>
        <Select
          onValueChange={(v) => onChange({ ...value, hour: Number(v) })}
          value={String(value.hour)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOURS.map((h) => (
              <SelectItem key={h} value={String(h)}>
                {h}:00 h
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function WhatsappScheduleDialog({
  orgSlug,
  saved,
  linked,
  onOpenChange,
  onSaved,
}: {
  orgSlug: string;
  /** El reporte a programar; `null` cierra el diálogo. */
  saved: SavedReport | null;
  linked: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (list: SavedReport[]) => void;
}) {
  const [value, setValue] = useState<ReportSchedule>(DEFAULT_SCHEDULE);
  const [busy, setBusy] = useState<"save" | "remove" | "now" | null>(null);

  useEffect(() => {
    if (saved) {
      setValue(saved.whatsapp ?? DEFAULT_SCHEDULE);
    }
  }, [saved]);

  const persist = async (next: ReportSchedule | null) => {
    if (!saved) {
      return;
    }
    setBusy(next ? "save" : "remove");
    const result = await scheduleReportAction(orgSlug, saved.id, next);
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    onSaved(result.saved);
    toast.success(
      next
        ? `Listo: ${describeSchedule(next).toLowerCase()} te llega por WhatsApp.`
        : "Ya no te llega por WhatsApp."
    );
    onOpenChange(false);
  };

  const sendNow = async () => {
    if (!saved) {
      return;
    }
    setBusy("now");
    const result = await sendReportNowAction(orgSlug, saved.id);
    setBusy(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    if (result.sent) {
      toast.success(result.message);
    } else {
      toast.warning(result.message);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(saved)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsappLogoIcon className="text-emerald-600" weight="fill" />
            Recibir por WhatsApp
          </DialogTitle>
          <DialogDescription>
            “{saved?.name}” te llega con los números del momento, la comparación
            con el período anterior y el link para abrirlo.
          </DialogDescription>
        </DialogHeader>

        {linked ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {FREQUENCIES.map((f) => (
                <button
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs transition-colors",
                    value.frequency === f.key
                      ? "bg-background font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  key={f.key}
                  onClick={() => setValue({ ...value, frequency: f.key })}
                  type="button"
                >
                  {f.label}
                </button>
              ))}
            </div>
            <WhenFields onChange={setValue} value={value} />
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-800 text-sm dark:text-emerald-300">
              {describeSchedule(value)}
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            Para recibirlos falta cargar tu celular en{" "}
            <strong>IA Comercial → Configuración → Celulares</strong> (lo carga
            un gerente).
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            disabled={!linked || busy !== null}
            onClick={sendNow}
            variant="ghost"
          >
            {busy === "now" ? <Spinner /> : <PaperPlaneTiltIcon />}
            Mandámelo ahora
          </Button>
          <div className="flex gap-2">
            {saved?.whatsapp ? (
              <Button
                disabled={busy !== null}
                onClick={() => persist(null)}
                variant="outline"
              >
                {busy === "remove" ? <Spinner /> : null}
                Dejar de recibir
              </Button>
            ) : null}
            <Button
              disabled={!linked || busy !== null}
              onClick={() => persist({ ...value, active: true })}
            >
              {busy === "save" ? <Spinner /> : null}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
