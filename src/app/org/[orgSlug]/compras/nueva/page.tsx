"use client";

import { ArrowLeft, SaveIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  PurchaseForm,
  type PurchaseFormValues,
} from "@/components/purchases/purchase-form";
import {
  type PurchaseItem,
  PurchaseItemsList,
} from "@/components/purchases/purchase-items-list";
import { PurchaseSummary } from "@/components/purchases/purchase-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductsBySupplier } from "@/modules/purchases/hooks/use-products-by-supplier";
import { usePurchaseMutations } from "@/modules/purchases/hooks/use-purchase-mutations";
import { useSuppliers } from "@/modules/suppliers/hooks/use-suppliers";

function NewPurchaseContent() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    null
  );
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [formValues, setFormValues] = useState<Partial<PurchaseFormValues>>({
    purchase_date: new Date(),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: suppliers = [], isLoading: isLoadingSuppliers } =
    useSuppliers(orgSlug);
  const { data: products = [], isLoading: isLoadingProducts } =
    useProductsBySupplier(orgSlug, selectedSupplierId);

  const { createPurchase } = usePurchaseMutations(orgSlug);

  if (isLoadingSuppliers) {
    return <LoadingState />;
  }

  const handleAddItem = (item: PurchaseItem) => {
    setPurchaseItems((prev) => [...prev, item]);
  };

  const handleUpdateItem = (index: number, item: PurchaseItem) => {
    setPurchaseItems((prev) => {
      const newItems = [...prev];
      newItems[index] = item;
      return newItems;
    });
  };

  const handleRemoveItem = (index: number) => {
    setPurchaseItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFormChange = (values: Partial<PurchaseFormValues>) => {
    setFormValues((prev) => ({ ...prev, ...values }));
  };

  const validateForm = () => {
    if (!selectedSupplierId) {
      setError("Debe seleccionar un proveedor");
      return false;
    }

    if (purchaseItems.length === 0) {
      setError("Debe agregar al menos un producto a la compra");
      return false;
    }

    if (!formValues.purchase_date) {
      setError("Debe seleccionar una fecha de compra");
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    setError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const purchaseDateStr = formValues.purchase_date
        ?.toISOString()
        .split("T")[0];
      const paymentDueDateStr = formValues.payment_due_date
        ? formValues.payment_due_date.toISOString().split("T")[0]
        : undefined;

      if (!purchaseDateStr) {
        setError("Fecha de compra inválida");
        return;
      }

      const result = await createPurchase.mutateAsync({
        orgSlug,
        supplier_id: selectedSupplierId ?? "",
        purchase_date: purchaseDateStr,
        payment_due_date: paymentDueDateStr,
        remittance_number: formValues.remittance_number,
        items: purchaseItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
        })),
      });

      if (result.success) {
        router.push(`/org/${orgSlug}/compras`);
      } else {
        setError(result.error ?? "Error al crear la compra");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error desconocido al crear la compra"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/org/${orgSlug}/compras`}>
            <Button size="sm" variant="ghost">
              <ArrowLeft className="h-4 w-4" />
              Volver a Compras
            </Button>
          </Link>
        </div>
        <Button
          disabled={
            isSubmitting || !selectedSupplierId || purchaseItems.length === 0
          }
          onClick={handleSubmit}
        >
          {isSubmitting ? (
            <>Guardando...</>
          ) : (
            <>
              <SaveIcon className="mr-2 h-4 w-4" />
              Guardar compra
            </>
          )}
        </Button>
      </div>

      <div className="space-y-2">
        <h1 className="font-heading text-3xl">Nueva compra</h1>
        <p className="text-muted-foreground">
          Complete los datos de la orden de compra y agregue los productos
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          {/* Purchase Form */}
          <Card>
            <CardContent className="pt-6">
              <PurchaseForm
                onFormChange={handleFormChange}
                onSupplierChange={setSelectedSupplierId}
                selectedSupplierId={selectedSupplierId}
                suppliers={suppliers}
              />
            </CardContent>
          </Card>

          {/* Purchase Items */}
          <PurchaseItemsList
            isLoadingProducts={isLoadingProducts}
            items={purchaseItems}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onUpdateItem={handleUpdateItem}
            products={products}
          />
        </div>

        {/* Summary Sidebar */}
        <div className="w-full lg:w-80 xl:w-96">
          <PurchaseSummary items={purchaseItems} taxRate={0} />
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex gap-6">
        <div className="flex-1 space-y-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
        <Skeleton className="h-96 w-80" />
      </div>
    </div>
  );
}

export default function NewPurchasePage() {
  return <NewPurchaseContent />;
}
