"use client";

import { useState } from "react";
import { CustomersDataTable } from "@/app/org/[orgSlug]/clientes/data-table";
import { AssignCustomerButton } from "@/components/sales-price-lists/assign-customer-button";
import type { Customer } from "@/modules/customers/types";
import { useAssignCustomerMutation } from "@/modules/sales-price-lists/hooks/use-assign-customer-mutation";

type AssignCustomersClientProps = {
  orgSlug: string;
  listId: string;
};

export function AssignCustomersClient({
  orgSlug,
  listId,
}: AssignCustomersClientProps) {
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const assignMutation = useAssignCustomerMutation(orgSlug, listId);

  const handleAssign = (customerId: string) => {
    assignMutation.mutate(
      { customerId },
      {
        onSuccess: () => {
          setAssignedIds((prev) => new Set(prev).add(customerId));
        },
      }
    );
  };

  return (
    <CustomersDataTable
      hideActions
      orgSlug={orgSlug}
      renderRowActions={(customer: Customer) => (
        <AssignCustomerButton
          assigned={assignedIds.has(customer.id)}
          customerId={customer.id}
          listId={listId}
          loading={
            assignMutation.isPending &&
            assignMutation.variables?.customerId === customer.id
          }
          onAssign={() => handleAssign(customer.id)}
        />
      )}
    />
  );
}
