"use client";

import { ChevronDown, ChevronRight, FileText, ScrollText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { statusStyles } from "@/components/quotes/quotes-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import {
  getQuotesByCustomerAction,
  type PaginatedQuotes,
  type QuoteForCustomer,
} from "@/modules/quotes/actions/get-quotes-by-customer.action";

type CancelledVersionListProps = {
  isExpanded: boolean;
  onToggle: () => void;
  orgSlug: string;
  versions: QuoteForCustomer[];
};

function CancelledVersionList({
  isExpanded,
  onToggle,
  orgSlug,
  versions,
}: CancelledVersionListProps) {
  return (
    <div className="border-t border-dashed px-4 py-1">
      <button
        className="flex w-full items-center gap-1.5 py-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
        onClick={onToggle}
        type="button"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {versions.length} versión
        {versions.length > 1 ? "es" : ""} anterior
        {versions.length > 1 ? "es" : ""}
      </button>

      {isExpanded && (
        <div className="space-y-1 pb-2">
          {versions.map((child) => {
            const childConfig =
              statusStyles[child.status as keyof typeof statusStyles];
            return (
              <Link
                className="block rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                href={`/org/${orgSlug}/presupuestos/${child.id}/editar`}
                key={child.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex rounded-full px-1.5 py-0.5 font-medium text-[10px] ${
                        childConfig?.className ?? ""
                      }`}
                    >
                      {childConfig?.label ?? child.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {child.created_at
                        ? formatDateOnly(child.created_at)
                        : "-"}
                    </span>
                    {child.creator_name && (
                      <span className="text-[10px] text-muted-foreground">
                        • {child.creator_name}
                      </span>
                    )}
                  </div>
                  <span className="font-medium text-xs">
                    {formatCurrency(child.total_amount, child.currency)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

type RecentQuotesCardProps = {
  orgSlug: string;
  customerId: string;
};

export function RecentQuotesCard({
  orgSlug,
  customerId,
}: RecentQuotesCardProps) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedQuotes | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    new Set()
  );

  const pageSize = 5;

  useEffect(() => {
    setLoading(true);
    getQuotesByCustomerAction(orgSlug, customerId, page, pageSize)
      .then(setData)
      .catch(() => {
        toast.error("Error al cargar presupuestos. Intente nuevamente.");
      })
      .finally(() => setLoading(false));
  }, [orgSlug, customerId, page]);

  const toggleExpanded = (id: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  if (!loading && data && data.parents.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="flex items-center gap-2 border-b p-4">
          <ScrollText className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Presupuestos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileText className="h-6 w-6" />
          </div>
          <p className="text-sm">
            Este cliente no tiene presupuestos registrados
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex items-center gap-2 border-b p-4">
        <ScrollText className="h-5 w-5 text-muted-foreground" />
        <CardTitle className="text-base">Presupuestos</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="divide-y">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                className="flex items-start justify-between gap-4 p-4"
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                key={`skeleton-${i}`}
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y">
            {data?.parents.map((parent) => {
              const config =
                statusStyles[parent.status as keyof typeof statusStyles];
              const hasChildren = parent.children.length > 0;
              const isExpanded = expandedParents.has(parent.id);

              return (
                <div key={parent.id}>
                  <Link
                    className="block p-4 transition-colors hover:bg-muted/50"
                    href={`/org/${orgSlug}/presupuestos/${parent.id}/editar`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 font-medium text-xs ${
                              config?.className ?? ""
                            }`}
                          >
                            {config?.label ?? parent.status}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {parent.created_at
                            ? formatDateOnly(parent.created_at)
                            : "-"}
                          {parent.creator_name && (
                            <span className="ml-2">
                              • {parent.creator_name}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">
                          {formatCurrency(parent.total_amount, parent.currency)}
                        </p>
                      </div>
                    </div>
                  </Link>

                  {hasChildren && (
                    <CancelledVersionList
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpanded(parent.id)}
                      orgSlug={orgSlug}
                      versions={parent.children}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {data && data.total > pageSize && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-muted-foreground text-xs">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              size="sm"
              variant="outline"
            >
              Anterior
            </Button>
            <Button
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              size="sm"
              variant="outline"
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
