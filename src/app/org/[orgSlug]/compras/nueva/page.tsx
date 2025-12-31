"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  PurchaseForm,
  type PurchaseFormValues,
} from "@/components/purchases/forms/purchase-form";
import {
  type PurchaseItem,
  PurchaseItemsList,
} from "@/components/purchases/forms/purchase-items-list";
import { PurchaseSummary } from "@/components/purchases/shared/purchase-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductsBySupplier } from "@/modules/purchases/hooks/use-products-by-supplier";
import { usePurchaseMutations } from "@/modules/purchases/hooks/use-purchase-mutations";
import { useSuppliers } from "@/modules/suppliers/hooks/use-suppliers";
import { useTaxes } from "@/modules/taxes/hooks/use-taxes";

function NewPurchaseContent() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    null
  );
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [selectedTaxIds, setSelectedTaxIds] = useState<string[]>([]);
  const [formValues, setFormValues] = useState<Partial<PurchaseFormValues>>({
    purchase_date: new Date(),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: suppliers = [], isLoading: isLoadingSuppliers } =
    useSuppliers(orgSlug);
  const { data: products = [], isLoading: isLoadingProducts } =
    useProductsBySupplier(orgSlug, selectedSupplierId);
  const { data: taxes = [] } = useTaxes();

  const { createPurchase } = usePurchaseMutations(orgSlug);

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

  const validateForm = useCallback((): string | null => {
    if (!selectedSupplierId) {
      return "Debe seleccionar un proveedor";
    }
    if (purchaseItems.length === 0) {
      return "Debe agregar al menos un producto a la compra";
    }
    if (!formValues.purchase_date) {
      return "Debe seleccionar una fecha de compra";
    }
    return null;
  }, [selectedSupplierId, purchaseItems.length, formValues.purchase_date]);

  const preparePurchaseData = useCallback(() => {
    const purchaseDateStr = formValues.purchase_date
      ?.toISOString()
      .split("T")[0];

    if (!purchaseDateStr) {
      throw new Error("Fecha de compra inválida");
    }

    const selectedTaxesData = taxes
      .filter((tax) => selectedTaxIds.includes(tax.id))
      .map((tax) => ({
        tax_id: tax.id,
        name: tax.name,
        rate: tax.rate,
      }));

    return {
      orgSlug,
      supplier_id: selectedSupplierId ?? "",
      purchase_date: purchaseDateStr,
      items: purchaseItems.map((item) => {
        const isWeightOrVolume =
          item.unit_of_measure === "KG" ||
          item.unit_of_measure === "LT" ||
          item.unit_of_measure === "MT";

        let unitQuantity: number;
        if (
          isWeightOrVolume &&
          item.weight_per_unit &&
          item.weight_per_unit > 0
        ) {
          unitQuantity = item.quantity * item.weight_per_unit;
        } else {
          unitQuantity = item.quantity;
        }

        return {
          product_id: item.product_id,
          quantity: item.quantity,
          unit_quantity: unitQuantity,
          unit_cost: item.unit_cost,
        };
      }),
      taxes: selectedTaxesData.length > 0 ? selectedTaxesData : undefined,
    };
  }, [
    orgSlug,
    selectedSupplierId,
    formValues,
    purchaseItems,
    taxes,
    selectedTaxIds,
  ]);

  const handleSubmit = useCallback(async () => {
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const purchaseData = preparePurchaseData();
      const result = await createPurchase.mutateAsync(purchaseData);

      if (result.success) {
        router.push(`/org/${orgSlug}/compras`);
      } else {
        setError(result.error ?? "Error al crear la compra");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Error desconocido al crear la compra";
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [validateForm, preparePurchaseData, createPurchase, router, orgSlug]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        selectedSupplierId &&
        purchaseItems.length > 0 &&
        !isSubmitting
      ) {
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedSupplierId, purchaseItems.length, isSubmitting, handleSubmit]);

  if (isLoadingSuppliers) {
    return <LoadingState />;
  }

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
                onTaxesChange={setSelectedTaxIds}
                selectedSupplierId={selectedSupplierId}
                selectedTaxIds={selectedTaxIds}
                suppliers={suppliers}
                taxes={taxes}
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
          <PurchaseSummary
            disabled={
              isSubmitting || !selectedSupplierId || purchaseItems.length === 0
            }
            isSubmitting={isSubmitting}
            items={purchaseItems}
            onSubmit={handleSubmit}
            taxes={taxes.filter((t) => selectedTaxIds.includes(t.id))}
          />
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
