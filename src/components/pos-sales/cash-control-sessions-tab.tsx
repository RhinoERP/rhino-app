"use client";

import type { ColumnDef, FilterFn } from "@tanstack/react-table";
import {
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";
import { CheckCircle2, CircleDot, Plus, Wallet, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataTable } from "@/hooks/use-data-table";
import { formatCurrency, formatDate } from "@/lib/format";
import { closePosSessionAction } from "@/modules/pos/actions/close-pos-session.action";
import { openPosSessionAction } from "@/modules/pos/actions/open-pos-session.action";
import type {
  PosCashControlTerminal,
  PosSessionSummary,
} from "@/modules/pos/types";

type CashControlSessionsTabProps = {
  orgSlug: string;
  sessions: PosSessionSummary[];
  terminals: PosCashControlTerminal[];
};

const SEARCH_TERMS_SEPARATOR = /\s+/;

const normalizeSearchValue = (value: string | number | null | undefined) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const cashSessionsGlobalFilter: FilterFn<PosSessionSummary> = (
  row,
  _columnId,
  filterValue
) => {
  const query = normalizeSearchValue(filterValue as string | undefined);

  if (!query) {
    return true;
  }

  const searchableText = normalizeSearchValue(
    [
      row.original.terminalName,
      row.original.terminalCode,
      row.original.userName,
      row.original.status,
    ]
      .filter((value) => value != null)
      .join(" ")
  );

  return query
    .split(SEARCH_TERMS_SEPARATOR)
    .every((term) => searchableText.includes(term));
};

function getTerminalLabel(session: PosSessionSummary) {
  return session.terminalCode
    ? `${session.terminalName} (${session.terminalCode})`
    : session.terminalName;
}

function getStatusBadge(status: PosSessionSummary["status"]) {
  if (status === "OPEN") {
    return {
      label: "Abierta",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: <CircleDot className="h-3.5 w-3.5" />,
    };
  }

  return {
    label: "Cerrada",
    className: "bg-slate-100 text-slate-700 border-slate-300",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  };
}

function parseMoneyInput(value: string): number | null {
  const normalized = value.replaceAll(",", ".").trim();
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function sortSessionsByOpenedAtDesc(sessions: PosSessionSummary[]) {
  return [...sessions].sort((a, b) => {
    const aTime = a.openedAt ? new Date(a.openedAt).getTime() : 0;
    const bTime = b.openedAt ? new Date(b.openedAt).getTime() : 0;
    return bTime - aTime;
  });
}

function upsertSession(
  sessions: PosSessionSummary[],
  session: PosSessionSummary
): PosSessionSummary[] {
  const withoutCurrent = sessions.filter((item) => item.id !== session.id);
  return sortSessionsByOpenedAtDesc([session, ...withoutCurrent]);
}

function createCashSessionsColumns(params: {
  onCloseSession: (session: PosSessionSummary) => void;
  closingSessionId: string | null;
}): ColumnDef<PosSessionSummary>[] {
  const { onCloseSession, closingSessionId } = params;

  return [
    {
      id: "terminal",
      accessorFn: (row) => getTerminalLabel(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Terminal" />
      ),
      enableGlobalFilter: true,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "userName",
      accessorFn: (row) => row.userName,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Usuario" />
      ),
      enableGlobalFilter: true,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "openedAt",
      accessorFn: (row) => row.openedAt ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Apertura" />
      ),
      cell: ({ row }) => {
        const openedAt = row.original.openedAt;

        if (!openedAt) {
          return "—";
        }

        return formatDate(openedAt, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      },
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "startingCash",
      accessorFn: (row) => row.startingCash,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Monto inicial" />
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium">
          {formatCurrency(row.original.startingCash)}
        </div>
      ),
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "cashSalesAmount",
      accessorFn: (row) => row.cashSalesAmount,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Ventas efectivo" />
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium">
          {formatCurrency(row.original.cashSalesAmount)}
        </div>
      ),
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "expectedCashEnd",
      accessorFn: (row) => row.expectedCashEnd,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Saldo esperado" />
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium">
          {formatCurrency(row.original.expectedCashEnd)}
        </div>
      ),
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} label="Estado" />
      ),
      cell: ({ row }) => {
        const statusBadge = getStatusBadge(row.original.status);

        return (
          <Badge className={statusBadge.className} variant="outline">
            {statusBadge.icon}
            {statusBadge.label}
          </Badge>
        );
      },
      enableGlobalFilter: true,
      enableColumnFilter: false,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const session = row.original;

        if (!(session.status === "OPEN" && session.isCurrentUserSession)) {
          return <span className="text-muted-foreground text-xs">—</span>;
        }

        return (
          <Button
            disabled={closingSessionId === session.id}
            onClick={() => onCloseSession(session)}
            size="sm"
            variant="outline"
          >
            {closingSessionId === session.id ? "Cerrando..." : "Cerrar caja"}
          </Button>
        );
      },
      enableGlobalFilter: false,
      enableColumnFilter: false,
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

export function CashControlSessionsTab({
  orgSlug,
  sessions,
  terminals,
}: CashControlSessionsTabProps) {
  const router = useRouter();
  const [sessionsState, setSessionsState] = useState<PosSessionSummary[]>(() =>
    sortSessionsByOpenedAtDesc(sessions)
  );
  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>("");
  const [startingCashInput, setStartingCashInput] = useState<string>("0");
  const [openErrorMessage, setOpenErrorMessage] = useState<string | null>(null);
  const [isOpeningSession, startOpeningSession] = useTransition();

  const [sessionToClose, setSessionToClose] =
    useState<PosSessionSummary | null>(null);
  const [realCashEndInput, setRealCashEndInput] = useState<string>("0");
  const [closeErrorMessage, setCloseErrorMessage] = useState<string | null>(
    null
  );
  const [isClosingSession, startClosingSession] = useTransition();

  useEffect(() => {
    setSessionsState(sortSessionsByOpenedAtDesc(sessions));
  }, [sessions]);

  const openTerminalIds = useMemo(
    () =>
      new Set(
        sessionsState
          .filter((session) => session.status === "OPEN")
          .map((session) => session.terminalId)
      ),
    [sessionsState]
  );

  const availableTerminals = useMemo(
    () =>
      terminals.filter(
        (terminal) => terminal.isActive && !openTerminalIds.has(terminal.id)
      ),
    [terminals, openTerminalIds]
  );

  const columns = useMemo(
    () =>
      createCashSessionsColumns({
        onCloseSession: (session) => {
          setSessionToClose(session);
          setRealCashEndInput(String(session.expectedCashEnd.toFixed(2)));
          setCloseErrorMessage(null);
        },
        closingSessionId: isClosingSession
          ? (sessionToClose?.id ?? null)
          : null,
      }),
    [isClosingSession, sessionToClose?.id]
  );

  const { table } = useDataTable<PosSessionSummary>({
    data: sessionsState,
    columns,
    pageCount: -1,
    queryKeys: {
      page: "vdcPage",
      perPage: "vdcPerPage",
      sort: "vdcSort",
      filters: "vdcFilters",
      joinOperator: "vdcJoinOperator",
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 20,
      },
      sorting: [{ id: "openedAt", desc: true }],
    },
    globalFilterFn: cashSessionsGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    manualFiltering: false,
    manualPagination: false,
    manualSorting: false,
  });

  const openDialog = (nextOpen: boolean) => {
    setIsOpenDialogOpen(nextOpen);

    if (!nextOpen) {
      setOpenErrorMessage(null);
      return;
    }

    const firstAvailableTerminal = availableTerminals[0];
    setSelectedTerminalId(firstAvailableTerminal?.id ?? "");
    setStartingCashInput("0");
    setOpenErrorMessage(null);
  };

  const handleOpenSession = () => {
    setOpenErrorMessage(null);

    if (!selectedTerminalId) {
      setOpenErrorMessage("Selecciona una terminal para abrir la caja.");
      return;
    }

    const startingCash = parseMoneyInput(startingCashInput);

    if (startingCash === null) {
      setOpenErrorMessage("Ingresa un monto inicial válido.");
      return;
    }

    startOpeningSession(async () => {
      const result = await openPosSessionAction({
        orgSlug,
        terminalId: selectedTerminalId,
        startingCash,
      });

      if (!result.success) {
        const message = result.error || "No se pudo abrir la sesión de caja.";
        setOpenErrorMessage(message);
        toast.error(message);
        return;
      }

      setIsOpenDialogOpen(false);
      const openedSession = result.session;
      if (openedSession) {
        setSessionsState((current) => upsertSession(current, openedSession));
      }
      toast.success("Sesión de caja abierta correctamente.");
      router.refresh();
    });
  };

  const handleCloseSession = () => {
    if (!sessionToClose) {
      return;
    }

    setCloseErrorMessage(null);

    const realCashEnd = parseMoneyInput(realCashEndInput);

    if (realCashEnd === null) {
      setCloseErrorMessage("Ingresa un monto final válido.");
      return;
    }

    const currentSessionId = sessionToClose.id;

    startClosingSession(async () => {
      const result = await closePosSessionAction({
        orgSlug,
        sessionId: currentSessionId,
        realCashEnd,
      });

      if (!result.success) {
        const message = result.error || "No se pudo cerrar la caja.";
        setCloseErrorMessage(message);
        toast.error(message);
        return;
      }

      const closedSession = result.session;
      if (closedSession) {
        setSessionsState((current) => upsertSession(current, closedSession));
      }
      setSessionToClose(null);
      toast.success("Caja cerrada correctamente.");
      router.refresh();
    });
  };

  const openingDisabled = isOpeningSession || availableTerminals.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-heading text-xl">Sesiones de caja</h2>
          <p className="text-muted-foreground text-sm">
            Control diario de apertura, efectivo vendido y cierre por terminal.
          </p>
        </div>
        <Button disabled={openingDisabled} onClick={() => openDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva apertura
        </Button>
      </div>

      {sessionsState.length === 0 ? (
        <div className="rounded-md border">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Wallet className="size-6" />
              </EmptyMedia>
              <EmptyTitle>No hay sesiones de caja</EmptyTitle>
              <EmptyDescription>
                Abre una sesión para empezar a controlar el efectivo por
                terminal.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <DataTable table={table}>
          <DataTableToolbar
            globalFilterPlaceholder="Buscar por terminal, usuario o estado..."
            table={table}
          />
        </DataTable>
      )}

      <Dialog onOpenChange={openDialog} open={isOpenDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Nueva apertura de caja</DialogTitle>
            <DialogDescription>
              Selecciona la terminal y define el monto inicial de efectivo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="terminal-id">Terminal</Label>
              <Select
                onValueChange={setSelectedTerminalId}
                value={selectedTerminalId}
              >
                <SelectTrigger id="terminal-id">
                  <SelectValue placeholder="Selecciona una terminal" />
                </SelectTrigger>
                <SelectContent>
                  {availableTerminals.map((terminal) => (
                    <SelectItem key={terminal.id} value={terminal.id}>
                      {terminal.code
                        ? `${terminal.name} (${terminal.code})`
                        : terminal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="starting-cash">Monto inicial</Label>
              <Input
                id="starting-cash"
                inputMode="decimal"
                min={0}
                onChange={(event) => setStartingCashInput(event.target.value)}
                placeholder="10000"
                step="0.01"
                type="number"
                value={startingCashInput}
              />
            </div>

            {openErrorMessage && (
              <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                {openErrorMessage}
              </div>
            )}

            {availableTerminals.length === 0 && (
              <div className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
                Todas las terminales activas ya tienen una caja abierta.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => setIsOpenDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={openingDisabled} onClick={handleOpenSession}>
              {isOpeningSession ? "Abriendo..." : "Abrir caja"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSessionToClose(null);
            setCloseErrorMessage(null);
          }
        }}
        open={sessionToClose !== null}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Cerrar caja</DialogTitle>
            <DialogDescription>
              Ingresa el efectivo real contado para cerrar la sesión.
            </DialogDescription>
          </DialogHeader>

          {sessionToClose && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">
                  {getTerminalLabel(sessionToClose)}
                </p>
                <p className="text-muted-foreground">
                  Esperado: {formatCurrency(sessionToClose.expectedCashEnd)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="real-cash-end">Efectivo real contado</Label>
                <Input
                  id="real-cash-end"
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => setRealCashEndInput(event.target.value)}
                  step="0.01"
                  type="number"
                  value={realCashEndInput}
                />
              </div>

              {closeErrorMessage && (
                <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                  {closeErrorMessage}
                </div>
              )}

              {(() => {
                const parsedRealCash = parseMoneyInput(realCashEndInput);

                if (parsedRealCash === null) {
                  return null;
                }

                const difference =
                  parsedRealCash - sessionToClose.expectedCashEnd;

                if (Math.abs(difference) < 0.005) {
                  return (
                    <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-700 text-sm">
                      <CheckCircle2 className="h-4 w-4" />
                      No hay diferencias entre real y esperado.
                    </div>
                  );
                }

                return (
                  <div
                    className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                      difference > 0
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {difference > 0 ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    Diferencia estimada: {formatCurrency(difference)}
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                setSessionToClose(null);
                setCloseErrorMessage(null);
              }}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={isClosingSession} onClick={handleCloseSession}>
              {isClosingSession ? "Cerrando..." : "Confirmar cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
