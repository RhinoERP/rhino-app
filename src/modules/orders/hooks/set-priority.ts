import type { OrderFlowStatus } from "../types";

export const setPriority = (
  CHILD_STATUS_PRIORITY: Record<OrderFlowStatus, number>,
  nonTerminalChildren: { id: string; status: OrderFlowStatus }[],
  children: {
    id: string;
    status: OrderFlowStatus;
  }[]
) => {
  let newStatus: OrderFlowStatus;
  if (nonTerminalChildren.length === 0) {
    // Todos los hijos están en estados terminales
    const allDelivered = children.every((c) => c.status === "DELIVERED");
    const allCancelled = children.every((c) => c.status === "CANCELLED");

    if (allDelivered) {
      newStatus = "DELIVERED";
    }
    if (allCancelled) {
      newStatus = "CANCELLED";
    }
    // Mezcla DELIVERED + CANCELLED → el de menor prioridad gana
    const ordered = [...children].sort(
      (a, b) =>
        (CHILD_STATUS_PRIORITY[a.status] ?? 99) -
        (CHILD_STATUS_PRIORITY[b.status] ?? 99)
    );
    newStatus = ordered[0].status as OrderFlowStatus;
  }
  // Prioridad más baja entre hijos activos
  newStatus = nonTerminalChildren.sort(
    (a, b) =>
      (CHILD_STATUS_PRIORITY[a.status] ?? 99) -
      (CHILD_STATUS_PRIORITY[b.status] ?? 99)
  )[0]?.status as OrderFlowStatus;

  return newStatus;
};
