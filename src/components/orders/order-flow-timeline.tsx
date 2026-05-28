import {
  CheckCircle,
  CircleDashed,
  Clock,
  XCircle,
} from "@phosphor-icons/react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  FLOW_STAGES,
  ORDER_STATUS_CONFIG,
  type OrderFlowStatus,
  type OrderStatusHistoryRow,
} from "@/modules/orders/types";

type OrderFlowTimelineProps = {
  currentStatus: OrderFlowStatus;
  history: OrderStatusHistoryRow[];
};

type StageProps = {
  stage: (typeof FLOW_STAGES)[number];
  idx: number;
  currentStep: number;
  isCancelled: boolean;
  isRejected: boolean;
  history: OrderStatusHistoryRow[];
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: renders multiple visual states (completed/current/pending/cancelled) per stage
function StageItem({
  stage,
  idx,
  currentStep,
  isCancelled,
  isRejected,
  history,
}: StageProps) {
  const isCompleted = !isCancelled && currentStep > stage.step;
  const isCurrent = !(isCancelled || isRejected) && currentStep === stage.step;
  const isPending = isCancelled || currentStep < stage.step;
  const isFirst = idx === 0;
  const isLast = idx === FLOW_STAGES.length - 1;

  const stageHistory = history.filter((h) =>
    stage.statuses.includes(h.to_status)
  );
  const lastHistory = stageHistory.at(-1);

  return (
    <div className="flex flex-1 flex-col items-center">
      {/* Línea + círculo */}
      <div className="flex w-full items-center">
        {!isFirst && (
          <div
            className={cn(
              "h-0.5 flex-1 transition-colors",
              isCompleted || isCurrent
                ? "bg-emerald-500"
                : "bg-muted-foreground/20"
            )}
          />
        )}

        <div
          className={cn(
            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            isCompleted && "border-emerald-500 bg-emerald-500 text-white",
            isCurrent && "border-blue-500 bg-blue-500/10 text-blue-600",
            isPending &&
              "border-muted-foreground/30 bg-background text-muted-foreground/40",
            (isCancelled || isRejected) &&
              stage.step === currentStep &&
              "border-rose-500 bg-rose-500/10 text-rose-600"
          )}
        >
          {isCompleted && <CheckCircle className="h-4 w-4" />}
          {!isCompleted && isCurrent && <Clock className="h-4 w-4" />}
          {!(isCompleted || isCurrent) && (isCancelled || isRejected) && (
            <XCircle className="h-4 w-4 text-rose-500" />
          )}
          {!(isCompleted || isCurrent || isCancelled || isRejected) && (
            <CircleDashed className="h-4 w-4" />
          )}
        </div>

        {!isLast && (
          <div
            className={cn(
              "h-0.5 flex-1 transition-colors",
              isCompleted ? "bg-emerald-500" : "bg-muted-foreground/20"
            )}
          />
        )}
      </div>

      {/* Etiqueta y fecha */}
      <div className="mt-2 flex flex-col items-center text-center">
        <span
          className={cn(
            "font-medium text-xs",
            isCompleted && "text-emerald-600 dark:text-emerald-400",
            isCurrent && "text-blue-600 dark:text-blue-400",
            isPending && "text-muted-foreground/50"
          )}
        >
          {stage.label}
        </span>
        {lastHistory && (
          <span className="mt-0.5 text-[10px] text-muted-foreground">
            {formatDate(lastHistory.changed_at ?? "")}
          </span>
        )}
      </div>
    </div>
  );
}

export function OrderFlowTimeline({
  currentStatus,
  history,
}: OrderFlowTimelineProps) {
  const currentConfig = ORDER_STATUS_CONFIG[currentStatus];
  const currentStep = currentConfig.step;
  const isCancelled = currentStatus === "CANCELLED";
  const isRejected = currentStatus === "FINANCE_REJECTED";

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-2">
        {FLOW_STAGES.map((stage, idx) => (
          <StageItem
            currentStep={currentStep}
            history={history}
            idx={idx}
            isCancelled={isCancelled}
            isRejected={isRejected}
            key={stage.step}
            stage={stage}
          />
        ))}
      </div>

      {/* Estado actual resaltado */}
      <div
        className={cn(
          "mt-4 rounded-lg border px-4 py-3",
          currentConfig.bgColor,
          currentConfig.borderColor
        )}
      >
        <p className={cn("font-semibold text-sm", currentConfig.color)}>
          {currentConfig.label}
        </p>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {currentConfig.description}
        </p>
      </div>
    </div>
  );
}
