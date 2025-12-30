/**
 * Dashboard Filters Component
 * Filters for customers and suppliers with real data
 */

"use client";

import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import type { DashboardFilters } from "@/types/dashboard";

type DashboardFiltersProps = {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  orgSlug: string;
};

type Customer = {
  id: string;
  business_name: string;
};

type Supplier = {
  id: string;
  name: string;
};

export function DashboardFiltersComponent({
  filters,
  onChange,
  orgSlug,
}: DashboardFiltersProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load customers and suppliers
  useEffect(() => {
    const loadData = async () => {
      try {
        const [customersRes, suppliersRes] = await Promise.all([
          fetch(`/api/org/${orgSlug}/torre-de-control/customers`),
          fetch(`/api/org/${orgSlug}/torre-de-control/suppliers`),
        ]);

        if (customersRes.ok) {
          const customersData = await customersRes.json();
          setCustomers(customersData);
        }

        if (suppliersRes.ok) {
          const suppliersData = await suppliersRes.json();
          setSuppliers(suppliersData);
        }
      } catch (error) {
        console.error("Error loading filter data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [orgSlug]);

  const hasActiveFilters = filters.customerId || filters.supplierId;

  const handleClearFilters = () => {
    onChange({ customerId: null, supplierId: null });
  };

  const customerOptions = [
    { value: "all", label: "Todos los clientes" },
    ...customers.map((c) => ({ value: c.id, label: c.business_name })),
  ];

  const supplierOptions = [
    { value: "all", label: "Todos los proveedores" },
    ...suppliers.map((s) => ({ value: s.id, label: s.name })),
  ];

  if (isLoading) {
    return (
      <div className="flex gap-2">
        <div className="h-9 w-[200px] animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-[200px] animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Customer Filter */}
      <Combobox
        emptyText="No se encontraron clientes"
        onChange={(value) => {
          // Si el valor está vacío o es "all", establecer null
          const newCustomerId = !value || value === "all" ? null : value;
          onChange({
            ...filters,
            customerId: newCustomerId,
          });
        }}
        options={customerOptions}
        placeholder="Todos los clientes"
        searchPlaceholder="Buscar cliente..."
        value={filters.customerId || "all"}
      />

      {/* Supplier Filter */}
      <Combobox
        emptyText="No se encontraron proveedores"
        onChange={(value) => {
          // Si el valor está vacío o es "all", establecer null
          const newSupplierId = !value || value === "all" ? null : value;
          onChange({
            ...filters,
            supplierId: newSupplierId,
          });
        }}
        options={supplierOptions}
        placeholder="Todos los proveedores"
        searchPlaceholder="Buscar proveedor..."
        value={filters.supplierId || "all"}
      />

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          className="h-9"
          onClick={handleClearFilters}
          size="sm"
          variant="ghost"
        >
          <XIcon className="mr-1 size-4" weight="bold" />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
