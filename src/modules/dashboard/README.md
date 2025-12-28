# Módulo Dashboard - Torre de Control

Módulo completo de métricas operativas y financieras para la aplicación Rhino.

## Estructura

```
modules/dashboard/
├── actions/
│   └── get-dashboard-data.action.ts    # Server Action para obtener datos
├── hooks/
│   └── use-dashboard-data.ts           # Hook React para datos del dashboard
├── queries/
│   ├── query-keys.ts                   # Factory de query keys
│   └── queries.client.ts               # Configuración de TanStack Query
├── service/
│   └── dashboard.service.ts            # Lógica de negocio y consultas DB
├── utils/
│   └── date-utils.ts                   # Utilidades para manejo de fechas
└── types.ts                            # Tipos TypeScript

components/dashboard/
├── dashboard-client.tsx                # Componente principal del cliente
├── date-range-selector.tsx             # Selector de rango de fechas
├── kpi-card.tsx                        # Card para métricas con indicadores
├── top-clients-table.tsx               # Tabla de top clientes
├── top-products-table.tsx              # Tabla de top productos
├── operational-tab.tsx                 # Pestaña operativa
└── financial-tab.tsx                   # Pestaña financiera

app/org/[orgSlug]/dashboard/
└── page.tsx                            # Página principal del dashboard
```

## Características

### Pestaña 1: Torre de Control (Operativo)

**KPIs Superiores:**

- ✅ Ventas del período (Monto total y % de cambio)
- ✅ Pedidos pendientes de entrega
- ✅ Compras pendientes de recibir
- ✅ Stock crítico (productos con bajo inventario)
- ✅ Rotación promedio de inventario
- ✅ Clientes activos vs inactivos

**Secciones:**

- ✅ **Pedidos/Ventas**: Cards con total, entregados, pendientes, demorados
- ✅ **Top 5 Clientes** por volumen de ventas
- ✅ **Top 5 Productos** por unidades vendidas
- ✅ **Compras**: Pendientes de recibir y días promedio de demora
- ✅ **Semáforo de Stocks**: Crítico, Saludable, Lento (inmovilizado)
- ✅ **Productos con Stock Crítico**: Lista detallada
- ✅ **Alta Rotación**: Top productos más vendidos
- ✅ **Productos "Huesos"**: Sin venta en > 60 días
- ✅ **Insights**: Mensajes generados automáticamente basados en métricas

### Pestaña 2: Administración de Saldos (Financiero)

**KPIs Superiores:**

- ✅ Facturado (ventas totales)
- ✅ Cobrado (pagos recibidos)
- ✅ Por Cobrar (cuentas pendientes)
- ✅ Por Pagar (compras pendientes)
- ✅ Margen Bruto (% y monto)

**Secciones:**

- ✅ **Cuentas por Cobrar**: Total, Vencido, A vencer
- ✅ **Top 10 Clientes Deudores**: Con indicador "En rojo"
- ✅ **Cuentas por Pagar**: Proyección a 7, 15 y 30 días
- ✅ **Márgenes**: Margen promedio, por producto y por cliente
- ✅ **Alertas visuales**: Badges de color para márgenes bajos

## Tecnologías Utilizadas

- **Next.js 16**: App Router, Server Components
- **TanStack Query v5**: Estado asíncrono y caché
- **nuqs**: Estado de URL (filtros de fecha)
- **Supabase**: Consultas a PostgreSQL
- **Tailwind CSS**: Estilos
- **shadcn/ui**: Componentes UI
- **date-fns**: Manejo de fechas

## Uso

### Navegación

Acceder a: `/org/{orgSlug}/dashboard`

### Filtros de Fecha

La página soporta los siguientes presets de rango de fechas mediante query params:

- `?range=today` - Hoy
- `?range=week` - Esta semana
- `?range=month` - Este mes (default)
- `?range=year` - Este año
- `?range=last30` - Últimos 30 días

Ejemplo: `/org/mi-empresa/dashboard?range=week`

### Prefetch de Datos

La página utiliza Server Components para pre-fetchear datos y mejorar el rendimiento:

```typescript
const queryClient = getQueryClient();
await queryClient.prefetchQuery(dashboardDataQueryOptions(orgSlug, dateRange));
```

### Hook de Cliente

```typescript
import { useDashboardData } from "@/modules/dashboard/hooks/use-dashboard-data";

const { data } = useDashboardData(orgSlug, dateRange);
```

## Adaptaciones al Esquema Real

El servicio se adaptó al esquema real de Supabase:

1. **Estados de pedidos**: Usa `"DRAFT" | "CONFIRMED" | "DISPATCH" | "DELIVERED" | "CANCELLED"`
2. **Estados de compras**: Usa `"ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED"`
3. **Stock**: Calculado desde `product_lots.quantity_available` (no existe `products.current_stock`)
4. **Clientes**: Usa `customers.business_name` (no existe `customers.name`)
5. **Fechas**: No hay `expected_delivery_date`, se usa `created_at` y `sale_date`
6. **Márgenes**: Calculados aproximados usando `products.profit_margin` (no existe `sales_order_items.unit_cost`)

## Cálculos Clave

### Rotación de Inventario

```
Rotación = Unidades Vendidas / Stock Actual Total
```

### Margen Bruto

```
Margen % = ((Ingresos - Costos) / Ingresos) * 100
Costo ≈ Ingresos / (1 + profit_margin%)
```

### Stock Crítico

Productos con menos de 10 unidades totales (suma de todos los lotes).

### Productos Lentos

Sin ventas en más de 60 días.

### Pedidos Demorados

Más de 3 días desde creación sin estado "DELIVERED".

## Insights Generados

El sistema genera automáticamente insights basados en:

- Cambios porcentuales significativos en ventas (> ±10%)
- Cantidad de productos con stock crítico (> 5)
- Rotación de inventario (muy alta > 2x o muy baja < 0.5x)
- Cuentas por cobrar vencidas (> $0)
- Márgenes (saludables > 30% o bajos < 15%)
- Pedidos demorados (> 3)

## Performance

- ✅ Todas las consultas principales ejecutadas en **paralelo** con `Promise.all()`
- ✅ Agregaciones en **SQL** (no traer miles de registros al frontend)
- ✅ Cache de TanStack Query: 5 minutos de `staleTime`
- ✅ Pre-fetch en servidor para **First Contentful Paint** rápido
- ✅ Suspense boundaries para mejor UX

## Próximas Mejoras

- [ ] Agregar gráficos con Recharts (ventas vs costos, tendencias)
- [ ] Tabla interactiva de estado de pedidos con cambio rápido de status
- [ ] Exportar métricas a Excel
- [ ] Comparación con múltiples períodos
- [ ] Filtros adicionales (por vendedor, categoría, etc.)
- [ ] Alertas configurables
- [ ] Dashboard personalizable (drag & drop de cards)

## Notas Técnicas

- Cumple estrictamente con ARCHITECTURE.md
- Utiliza Ultracite/Biome para code quality
- TypeScript estricto sin `any`
- Accesibilidad (semantic HTML, ARIA)
- Responsive design (mobile-first)
- Error handling completo
- Logs para debugging

---

**Última actualización**: 24 de diciembre de 2025
