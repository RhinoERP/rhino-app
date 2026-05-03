"use client";

import {
  CheckCircleIcon,
  PackageIcon,
  TruckIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SalesOrderWithCustomer } from "@/modules/sales/service/sales.service";
import { BulkCancelDialog } from "./bulk-cancel-dialog";
import { BulkConfirmDialog } from "./bulk-confirm-dialog";
import { BulkDeliverDialog } from "./bulk-deliver-dialog";
import { BulkDispatchDialog } from "./bulk-dispatch-dialog";
import { BulkInvoiceDialog } from "./bulk-invoice-dialog";

type BulkAction = "confirm" | "dispatch" | "deliver" | "invoice" | "cancel";

type BulkActionBarProps = {
  orgSlug: string;
  selectedSales: SalesOrderWithCustomer[];
  availableActions: BulkAction[];
  onClearSelection: () => void;
};

const ACTION_CONFIG: Record<
  BulkAction,
  {
    label: string;
    icon: React.ReactNode;
    variant: "default" | "outline" | "destructive";
  }
> = {
  confirm: {
    label: "Confirmar",
    icon: <CheckCircleIcon className="size-4" weight="bold" />,
    variant: "default",
  },
  dispatch: {
    label: "Despachar",
    icon: <TruckIcon className="size-4" weight="bold" />,
    variant: "default",
  },
  deliver: {
    label: "Entregar",
    icon: <PackageIcon className="size-4" weight="bold" />,
    variant: "default",
  },
  invoice: {
    label: "Facturar",
    icon: <CheckCircleIcon className="size-4" weight="bold" />,
    variant: "default",
  },
  cancel: {
    label: "Cancelar ventas",
    icon: <XCircleIcon className="size-4" weight="bold" />,
    variant: "destructive",
  },
};

export function BulkActionBar({
  orgSlug,
  selectedSales,
  availableActions,
  onClearSelection,
}: BulkActionBarProps) {
  const [activeDialog, setActiveDialog] = useState<BulkAction | null>(null);

  const count = selectedSales.length;

  const handleSuccess = () => {
    setActiveDialog(null);
    onClearSelection();
  };

  return (
    <>
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            animate={{ y: 0, opacity: 1 }}
            className="-translate-x-1/2 fixed bottom-6 left-1/2 z-50"
            exit={{ y: 24, opacity: 0 }}
            initial={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 shadow-lg">
              <span className="mr-1 font-medium text-muted-foreground text-sm">
                {count} {count === 1 ? "venta" : "ventas"}
              </span>

              {availableActions.map((action) => {
                const cfg = ACTION_CONFIG[action];
                return (
                  <Button
                    key={action}
                    onClick={() => setActiveDialog(action)}
                    size="sm"
                    variant={cfg.variant}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </Button>
                );
              })}

              <Button
                className="ml-1"
                onClick={onClearSelection}
                size="sm"
                variant="ghost"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BulkConfirmDialog
        onOpenChange={(v) => !v && setActiveDialog(null)}
        onSuccess={handleSuccess}
        open={activeDialog === "confirm"}
        orgSlug={orgSlug}
        selectedSales={selectedSales}
      />

      <BulkDispatchDialog
        onOpenChange={(v) => !v && setActiveDialog(null)}
        onSuccess={handleSuccess}
        open={activeDialog === "dispatch"}
        orgSlug={orgSlug}
        selectedSales={selectedSales}
      />

      <BulkDeliverDialog
        onOpenChange={(v) => !v && setActiveDialog(null)}
        onSuccess={handleSuccess}
        open={activeDialog === "deliver"}
        orgSlug={orgSlug}
        selectedSales={selectedSales}
      />

      <BulkInvoiceDialog
        onOpenChange={(v) => !v && setActiveDialog(null)}
        onSuccess={handleSuccess}
        open={activeDialog === "invoice"}
        orgSlug={orgSlug}
        selectedSales={selectedSales}
      />

      <BulkCancelDialog
        onOpenChange={(v) => !v && setActiveDialog(null)}
        onSuccess={handleSuccess}
        open={activeDialog === "cancel"}
        orgSlug={orgSlug}
        selectedSales={selectedSales}
      />
    </>
  );
}
