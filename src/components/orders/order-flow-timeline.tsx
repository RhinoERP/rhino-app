"use client";

import { CheckCircleIcon, ClockIcon, XCircleIcon } from "@phosphor-icons/react";
import { CircleDashed } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  FLOW_STAGES,
  ORDER_STATUS_CONFIG,
  type OrderFlowStatus,
  type OrderStatusHistoryRowWithUser,
} from "@/modules/orders/types";

type OrderFlowTimelineProps = {
  currentStatus: OrderFlowStatus;
  history: OrderStatusHistoryRowWithUser[];
};

type StageItemProps = {
  stage: (typeof FLOW_STAGES)[number];
  idx: number;
  currentStep: number;
  isCancelled: boolean;
  isRejected: boolean;
  history: OrderStatusHistoryRowWithUser[];
};

function StageCircleIcon({
  isCompleted,
  isCurrent,
  isCancelled,
  isRejected,
}: {
  isCompleted: boolean;
  isCurrent: boolean;
  isCancelled: boolean;
  isRejected: boolean;
}) {
  if (isCompleted) {
    return <CheckCircleIcon className="h-4 w-4" />;
  }
  if (isCancelled || isRejected) {
    return <XCircleIcon className="h-4 w-4 text-rose-500" />;
  }
  if (isCurrent) {
    return <ClockIcon className="h-4 w-4" />;
  }
  return <CircleDashed className="h-4 w-4" />;
}

function stageCircleClass(opts: {
  isCompleted: boolean;
  isCurrent: boolean;
  isPending: boolean;
  isCancelled: boolean;
  isRejected: boolean;
  isCurrentStage: boolean;
}) {
  const {
    isCompleted,
    isCurrent,
    isPending,
    isCancelled,
    isRejected,
    isCurrentStage,
  } = opts;
  return cn(
    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
    isCompleted && "border-emerald-500 bg-emerald-500 text-white",
    isCurrent && "border-blue-500 bg-blue-500/10 text-blue-600",
    isPending &&
      "border-muted-foreground/30 bg-background text-muted-foreground/40",
    (isCancelled || isRejected) &&
      isCurrentStage &&
      "border-rose-500 bg-rose-500/10 text-rose-600"
  );
}

function stageLabelClass(
  isCompleted: boolean,
  isCurrent: boolean,
  isPending: boolean
) {
  return cn(
    "font-medium text-xs",
    isCompleted && "text-emerald-600 dark:text-emerald-400",
    isCurrent && "text-blue-600 dark:text-blue-400",
    isPending && "text-muted-foreground/50"
  );
}

function StageItem({
  stage,
  idx,
  currentStep,
  isCancelled,
  isRejected,
  history,
}: StageItemProps) {
  const isFirst = idx === 0;
  const isLast = idx === FLOW_STAGES.length - 1;
  const isCompleted = !isCancelled && currentStep > stage.step;
  const isCurrent =
    !(isCancelled || isRejected) && currentStep === stage.step && !isCompleted;
  const isPending = isCancelled || currentStep < stage.step;

  const stageHistory = history.filter((h) => {
    if (isLast || idx === FLOW_STAGES.length - 2) {
      return h.to_status && stage.statuses.includes(h.to_status);
    }
    return h.from_status && stage.statuses.includes(h.from_status);
  });
  const lastHistory = stageHistory.at(-1);

  const lineClass = (active: boolean) =>
    cn(
      "h-0.5 flex-1 transition-colors",
      active ? "bg-emerald-500" : "bg-muted-foreground/20"
    );

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="flex w-full items-center">
        {!isFirst && <div className={lineClass(isCompleted || isCurrent)} />}

        <div
          className={stageCircleClass({
            isCompleted,
            isCurrent,
            isPending,
            isCancelled,
            isRejected,
            isCurrentStage: stage.step === currentStep,
          })}
        >
          <StageCircleIcon
            isCancelled={isCancelled}
            isCompleted={isCompleted}
            isCurrent={isCurrent}
            isRejected={isRejected}
          />
        </div>

        {!isLast && <div className={lineClass(isCompleted)} />}
      </div>

      <div className="mt-2 flex flex-col items-center text-center">
        <span className={stageLabelClass(isCompleted, isCurrent, isPending)}>
          {stage.label}
        </span>
        {lastHistory && (
          <>
            <span className="mt-0.5 text-[10px] text-muted-foreground">
              {formatDate(lastHistory.changed_at ?? "")}
            </span>
            {lastHistory.changed_by_name && (
              <span className="max-w-[80px] truncate text-[9px] text-muted-foreground/70">
                {lastHistory.changed_by_name}
              </span>
            )}
          </>
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
