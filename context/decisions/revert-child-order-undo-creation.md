# Reversión de child orders — Undo Creation

> Decisión de diseño tomada el 2026-06-24

## Problema

Cuando un child order se crea desde el panel de stock, su historial queda:

```
from: PENDING_STOCK  →  to: IN_PRODUCTION / PREPARING  (creación del child)
```

Si el usuario hace "Volver atrás" en ese child, la lógica actual lo pondría en `PENDING_STOCK`. Eso no funciona porque:

- El child sigue existiendo como entidad separada con `quote_items.assigned_order_id` seteado
- El padre también puede estar en `PENDING_STOCK`, generando duplicación
- Los items no vuelven al pool de "sin asignar" del panel de stock

## Solución: "Undo creation" en vez de revertir status

Si el último historial del child tiene `from_status = "PENDING_STOCK"` y el pedido es un child → esto no es una transición real, es el registro de creación. En vez de revertir el status, ejecutamos "deshacer la creación": cancelar el child y liberar los items.

## Archivos a modificar

```
src/modules/orders/actions/
├── check-order-revert.action.ts
├── revert-order-status.action.ts
src/modules/orders/hooks/
├── use-order-revert.ts
src/components/orders/
├── revert-order-modal.tsx
```

## check-order-revert.action.ts

Agregar `revertType` al resultado:

```typescript
export type CheckOrderRevertResult = {
  canRevert: boolean;
  previousStatus: string | null;
  previousLabel: string | null;
  revertType: "normal" | "undo_creation";
  error?: string;
};
```

Detección:

```typescript
const isChild = order.parent_order_id !== null;
const isUndoCreation = isChild && latestHistory.from_status === "PENDING_STOCK";

return {
  canRevert: true,
  previousStatus: latestHistory.from_status,
  previousLabel: isUndoCreation ? "Desasignar items" : config?.label ?? ...,
  revertType: isUndoCreation ? "undo_creation" : "normal",
};
```

## revert-order-status.action.ts

Cuando `revertType === "undo_creation"`, en vez de hacer `UPDATE orders SET status = "PENDING_STOCK"`:

1. `UPDATE quote_items SET assigned_order_id = NULL WHERE assigned_order_id = orderId`
2. `UPDATE orders SET status = "CANCELLED" WHERE id = orderId`
3. Insert en `order_status_history`:
   - `from_status`: status actual
   - `to_status`: "CANCELLED"
   - `notes`: "Sub-pedido cancelado - items devueltos al pool de stock"
4. `recalcParentOrderStatus(parent_order_id)`

El action recibe el `revertType` desde el modal.

## use-order-revert.ts

Agregar `revertType` al resultado del hook:

```typescript
export type UseOrderRevertResult = {
  canRevert: boolean;
  previousStatus: OrderFlowStatus | null;
  previousStatusLabel: string | null;
  revertType: "normal" | "undo_creation";
  isLoading: boolean;
  refresh: () => void;
};
```

## revert-order-modal.tsx

### Si `revertType === "undo_creation"`

| Elemento | Texto |
|---|---|
| Título | "Deshacer sub-pedido" |
| Descripción | "Se va a cancelar el sub-pedido **ORD-xxx** y sus items volverán al panel de stock para ser reasignados." |
| Label botón | "Cancelar sub-pedido y liberar items" |
| Nota obligatoria | Sí |
| Estilo botón | `destructive` |

### Si `revertType === "normal"` (comportamiento actual)

| Elemento | Texto |
|---|---|
| Título | "Volver al estado anterior" |
| Descripción | "¿Estás seguro de volver **ORD-xxx** a [badge estado]?" |
| Label botón | "Volver a [estado]" |

## Reglas de negocio

- **Undo creation** solo aplica cuando el child está recién creado (único historial, `from: PENDING_STOCK`)
- Si el child ya tuvo transiciones reales (ej: `IN_PRODUCTION → DESIGN_REVIEW`), funciona como hoy: vuelve un paso en el historial normal
- `recalcParentOrderStatus` maneja ambos casos igual (el padre se recalcula correctamente cuando el hijo se cancela)
