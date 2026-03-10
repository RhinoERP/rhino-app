"use client";

import { CheckIcon, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";

type AssignCustomerButtonProps = {
  customerId: string;
  listId: string;
  loading: boolean;
  assigned?: boolean;
  onAssign: () => void;
};

export function AssignCustomerButton({
  loading,
  assigned,
  onAssign,
}: AssignCustomerButtonProps) {
  if (assigned) {
    return (
      <Button
        className="flex items-center gap-2 border-green-500 text-green-600"
        disabled
        size="sm"
        variant="outline"
      >
        <CheckIcon className="size-4" />
        Asignado
      </Button>
    );
  }

  return (
    <Button
      aria-busy={loading}
      aria-label="Asignar cliente a lista"
      className="flex items-center gap-2"
      disabled={loading}
      onClick={onAssign}
      size="sm"
      variant="secondary"
    >
      {loading && <Loader className="size-4 animate-spin" />}
      Asignar
    </Button>
  );
}
