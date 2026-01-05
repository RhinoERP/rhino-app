"use client";

import { DotsThreeOutlineVerticalIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PaymentHistoryDialog } from "./payment-history-dialog";
import { RegisterPaymentDialog } from "./register-payment-dialog";

type CollectionActionsMenuProps = {
  orgSlug: string;
  orgId: string;
  accountId: string;
  type: "receivable" | "payable";
  counterpartyName: string;
  dueDate?: string | null;
  pendingBalance: number;
  totalAmount: number;
};

export function CollectionActionsMenu({
  orgSlug,
  accountId,
  type,
  counterpartyName,
  dueDate,
  pendingBalance,
  totalAmount,
  orgId,
}: CollectionActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-8 w-8 p-0" variant="ghost">
          <span className="sr-only">Abrir acciones</span>
          <DotsThreeOutlineVerticalIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <RegisterPaymentDialog
          accountId={accountId}
          counterpartyName={counterpartyName}
          dueDate={dueDate}
          orgSlug={orgSlug}
          pendingBalance={pendingBalance}
          totalAmount={totalAmount}
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
              Registrar pago
            </DropdownMenuItem>
          }
          type={type}
        />
        <PaymentHistoryDialog
          accountId={accountId}
          counterpartyName={counterpartyName}
          dueDate={dueDate}
          orgId={orgId}
          orgSlug={orgSlug}
          pendingBalance={pendingBalance}
          totalAmount={totalAmount}
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
              Ver historial
            </DropdownMenuItem>
          }
          type={type}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
