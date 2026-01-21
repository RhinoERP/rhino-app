"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SupplierCreditChecker({ orgSlug }: { orgSlug: string }) {
  const [supplierId, setSupplierId] = useState("");

  const {
    data: creditBalance,
    isLoading,
    refetch,
  } = useQuery<number>({
    queryKey: ["supplier-credit-balance-debug", orgSlug, supplierId],
    queryFn: async () => {
      if (!supplierId) {
        return 0;
      }

      const response = await fetch(
        `/api/purchases/supplier-credit-balance?orgSlug=${orgSlug}&supplierId=${supplierId}`
      );

      if (!response.ok) {
        throw new Error("Error al obtener créditos");
      }

      const data = await response.json();
      return data.balance ?? 0;
    },
    enabled: Boolean(supplierId),
  });

  const { data: creditsDetail } = useQuery({
    queryKey: ["supplier-credits-debug", orgSlug, supplierId],
    queryFn: async () => {
      if (!supplierId) {
        return { credits: [] };
      }

      const response = await fetch(
        `/api/purchases/supplier-credits?orgSlug=${orgSlug}&supplierId=${supplierId}`
      );

      if (!response.ok) {
        throw new Error("Error al obtener detalles de créditos");
      }

      return response.json();
    },
    enabled: Boolean(supplierId),
  });

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>🔍 Verificador de Créditos con Proveedores</CardTitle>
        <CardDescription>
          Ingresa el ID del proveedor para ver sus créditos disponibles
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="supplierId">ID del Proveedor</Label>
          <div className="flex gap-2">
            <Input
              id="supplierId"
              onChange={(e) => setSupplierId(e.target.value)}
              placeholder="Ej: b4c23f6d-ad14-4fe0-9fcc-64a2cbfdfa055"
              value={supplierId}
            />
            <Button disabled={!supplierId} onClick={() => refetch()}>
              Verificar
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Puedes obtener el ID del proveedor desde la tabla de Supabase o
            desde la URL cuando editas un proveedor
          </p>
        </div>

        {supplierId && (
          <div className="space-y-4">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Cargando...</p>
            ) : (
              <>
                <div
                  className={`rounded-lg border p-4 ${
                    creditBalance && creditBalance > 0
                      ? "border-blue-200 bg-blue-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <h3 className="font-semibold text-sm">
                    💰 Balance Total de Créditos
                  </h3>
                  <p className="mt-1 font-bold text-2xl">
                    $
                    {(creditBalance ?? 0).toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  {creditBalance && creditBalance > 0 ? (
                    <p className="mt-1 text-blue-700 text-xs">
                      Este crédito está disponible para aplicar a futuras
                      compras
                    </p>
                  ) : (
                    <p className="mt-1 text-gray-600 text-xs">
                      No hay créditos disponibles para este proveedor
                    </p>
                  )}
                </div>

                {creditsDetail?.credits && creditsDetail.credits.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">
                      Detalles de Créditos
                    </h3>
                    {creditsDetail.credits.map(
                      (credit: {
                        id: string;
                        amount: number;
                        remaining_amount: number;
                        notes: string | null;
                        created_at: string;
                      }) => (
                        <div
                          className="rounded border border-gray-200 bg-white p-3"
                          key={credit.id}
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <p className="font-medium text-sm">
                                Crédito de $
                                {credit.amount.toLocaleString("es-AR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                Disponible: $
                                {credit.remaining_amount.toLocaleString(
                                  "es-AR",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}
                              </p>
                              {credit.notes && (
                                <p className="text-gray-600 text-xs">
                                  📝 {credit.notes}
                                </p>
                              )}
                            </div>
                            <div className="text-right text-gray-500 text-xs">
                              {new Date(credit.created_at).toLocaleDateString(
                                "es-AR",
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }
                              )}
                            </div>
                          </div>
                          <div className="mt-2">
                            <div className="h-2 w-full rounded-full bg-gray-200">
                              <div
                                className="h-2 rounded-full bg-blue-500"
                                style={{
                                  width: `${(credit.remaining_amount / credit.amount) * 100}%`,
                                }}
                              />
                            </div>
                            <p className="mt-1 text-right text-gray-500 text-xs">
                              {(
                                (credit.remaining_amount / credit.amount) *
                                100
                              ).toFixed(0)}
                              % disponible
                            </p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm text-yellow-800">
                    <strong>💡 Tip:</strong> El crédito también aparecerá
                    automáticamente cuando selecciones este proveedor en el
                    diálogo de "Pago Masivo".
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
