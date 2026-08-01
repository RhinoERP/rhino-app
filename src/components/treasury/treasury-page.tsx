"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankAccountList } from "./bank-account-list";
import { BankAccountsSummary } from "./bank-accounts-summary";
import { BankMovementDialog } from "./bank-movement-dialog";
import { BankMovementsTable } from "./bank-movements-table";
import { CashDepositSlipDialog } from "./cash-deposit-slip-dialog";
import { CheckPortfolioManager } from "./check-portfolio-manager";
import { OwnCheckDebitDialog } from "./own-check-debit-dialog";

type Props = {
  orgId: string;
  orgSlug: string;
};

export function TreasuryPage({ orgId, orgSlug }: Props) {
  const [movimientoOpen, setMovimientoOpen] = useState(false);
  const [carteraOpen, setCarteraOpen] = useState(false);
  const [cashDepositOpen, setCashDepositOpen] = useState(false);
  const [ownCheckDebitOpen, setOwnCheckDebitOpen] = useState(false);

  return (
    <div className="container py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Tesorería</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Gestión de cuentas bancarias, cheques y movimientos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setCarteraOpen(true)}
            size="sm"
            variant="outline"
          >
            Cartera de cheques
          </Button>
          <Button
            onClick={() => setOwnCheckDebitOpen(true)}
            size="sm"
            variant="outline"
          >
            Débito cheques propios
          </Button>
          <Button
            onClick={() => setCashDepositOpen(true)}
            size="sm"
            variant="outline"
          >
            Depósito de efectivo
          </Button>
          <Button
            className="gap-2"
            onClick={() => setMovimientoOpen(true)}
            size="sm"
          >
            <PlusIcon className="h-4 w-4" />
            Movimiento bancario
          </Button>
        </div>
      </div>

      {/* Resumen saldos */}
      <div className="mb-6">
        <h2 className="mb-3 font-medium text-muted-foreground text-sm uppercase tracking-wide">
          Saldos operativos
        </h2>
        <BankAccountsSummary orgId={orgId} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="movimientos">
        <TabsList>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="cuentas">Cuentas bancarias</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4" value="movimientos">
          <BankMovementsTable orgId={orgId} />
        </TabsContent>
        <TabsContent className="mt-4" value="cuentas">
          <BankAccountList orgId={orgId} orgSlug={orgSlug} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <BankMovementDialog
        onOpenChange={setMovimientoOpen}
        open={movimientoOpen}
        orgId={orgId}
        orgSlug={orgSlug}
      />
      <CheckPortfolioManager
        onOpenChange={setCarteraOpen}
        open={carteraOpen}
        orgId={orgId}
        orgSlug={orgSlug}
      />
      <CashDepositSlipDialog
        onOpenChange={setCashDepositOpen}
        open={cashDepositOpen}
        orgId={orgId}
        orgSlug={orgSlug}
      />
      <OwnCheckDebitDialog
        onOpenChange={setOwnCheckDebitOpen}
        open={ownCheckDebitOpen}
        orgId={orgId}
        orgSlug={orgSlug}
      />
    </div>
  );
}
