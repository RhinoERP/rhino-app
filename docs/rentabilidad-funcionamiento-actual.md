# Funcionamiento actual de rentabilidad

Este documento describe como se obtiene hoy la informacion usada por la tab `Rentabilidad` de la Torre de Control.

## Entrada desde la UI

La tab esta declarada en `src/components/dashboard/dashboard-client.tsx` con el valor `analytics` y el texto `Rentabilidad`.

El flujo visible actual es:

1. `DashboardClient` calcula el rango de fechas desde el query param `range` con `getDateRangeFromPreset`.
2. Al abrir la tab `analytics`, renderiza `AnalyticsTab`.
3. `AnalyticsTab` renderiza `RentabilidadClientes` y le pasa `orgSlug`, `startDate` y `endDate`.
4. `RentabilidadClientes` ejecuta React Query con `customerProfitabilityClientQueryOptions`.
5. La query llama a:

```text
GET /api/org/:orgSlug/torre-de-control/customer-profitability?startDate=<ISO>&endDate=<ISO>
```

La tab ya no renderiza el grafico generico de `useProfitabilityMetrics`; actualmente muestra el dashboard de rentabilidad por cliente.

## Query cliente

Archivo: `src/modules/dashboard/queries/customer-profitability.client.ts`.

`customerProfitabilityClientQueryOptions(orgSlug, startDate, endDate)`:

- Construye una query key con `dashboardKeys.customerProfitability`.
- Serializa `startDate` y `endDate` con `toISOString`.
- Hace `fetch` al endpoint `customer-profitability`.
- Si la respuesta no es OK, intenta leer `{ error }` del JSON y lo propaga como `Error`.
- Devuelve un `CustomerProfitabilityDashboardResponse`.
- Configura cache con `staleTime` de 2 minutos.
- Desactiva refetch automatico en mount y focus de ventana.

## Route handler de customer profitability

Archivo: `src/app/api/org/[orgSlug]/torre-de-control/customer-profitability/route.ts`.

La funcion `GET`:

- Crea un `requestId` con `crypto.randomUUID`.
- Lee `orgSlug`, `startDate` y `endDate`.
- Valida que ambas fechas existan.
- Convierte los parametros a `Date`.
- Rechaza fechas invalidas.
- Rechaza rangos donde `startDate > endDate`.
- Resuelve la organizacion con `getOrganizationBySlug(orgSlug)`.
- Devuelve 404 si no existe la organizacion.
- Llama a `getCustomerProfitabilityDashboard(org.id, startDate, endDate)`.
- Devuelve el resultado como JSON.
- Ante errores inesperados, loguea contexto y responde 500 con `requestId`.

## Servicio principal: getCustomerProfitabilityDashboard

Archivo: `src/modules/dashboard/service/dashboard.service.ts`.

`getCustomerProfitabilityDashboard(organizationId, startDate, endDate)` obtiene la rentabilidad por cliente usando solo ventas mayoristas de `sales_orders`.

### Consulta a Supabase

La funcion:

- Crea un cliente Supabase server con `createClient`.
- Convierte fechas a `YYYY-MM-DD` mediante `toDateOnly`.
- Consulta `sales_orders`.
- Filtra por `organization_id`.
- Filtra por `sale_date >= dateFrom` y `sale_date <= dateTo`.
- Selecciona:
  - `id`
  - `status`
  - `customer_id`
  - `sub_total`
  - `total_amount`
  - relacion `customer:customers(id, business_name, fantasy_name)`
  - relacion `items:sales_order_items(base_price, quantity, unit_quantity, subtotal)`

Si Supabase devuelve error, lanza `Failed to fetch customer profitability rows`.

### Filtros aplicados en memoria

Despues de traer datos, descarta ventas canceladas con:

```text
isActiveTransaction(status) => status !== "CANCELLED"
```

Esto significa que cualquier estado distinto de `CANCELLED` cuenta como activo.

### Agrupacion por cliente

Cada venta se acumula en un `Map<string, CustomerProfitabilityAccumulator>`.

La clave del cliente se resuelve asi:

1. `sale.customer_id`
2. `customer.id`
3. `"unknown-customer"`

El nombre visible se resuelve con `getCustomerLabel`:

1. `customer.fantasy_name`
2. `customer.business_name`
3. `"Consumidor final"`

### Calculo de ventas, costo y ganancia

La venta bruta de cada orden se calcula con:

```text
Number(sale.sub_total ?? sale.total_amount ?? 0)
```

El costo de cada item se calcula con:

```text
base_price * (unit_quantity ?? quantity ?? 0)
```

Para cada cliente:

- `totalSales`: suma de ventas.
- `totalCost`: suma de costos de items.
- `totalProfit`: `totalSales - totalCost`.
- `marginPercent`: `(totalProfit / totalSales) * 100` si `totalSales > 0`.
- `orderCount`: cantidad de ventas unicas usando un `Set` de ids.

Los importes y porcentajes se redondean a 2 decimales con `toMoney`.

### Estado de rentabilidad

`getCustomerProfitabilityStatus(marginPercent)` clasifica:

- `bueno`: margen mayor o igual a 30%.
- `regular`: margen mayor o igual a 15% y menor a 30%.
- `bajo`: margen menor a 15%.

### Respuesta final

`buildCustomerProfitabilityRows` convierte el map a filas `CustomerProfitabilityRow` y las ordena por `totalSales` descendente.

La respuesta tiene esta forma:

```ts
{
  kpis: {
    totalSales: number;
    totalProfit: number;
    averageMarginPercent: number;
    activeCustomers: number;
  };
  topCustomers: CustomerProfitabilityRow[];
  customers: CustomerProfitabilityRow[];
}
```

Donde:

- `kpis.totalSales`: suma de ventas de todos los clientes.
- `kpis.totalProfit`: suma de ganancias de todos los clientes.
- `kpis.averageMarginPercent`: `totalProfit / totalSales * 100`.
- `kpis.activeCustomers`: cantidad de clientes con ventas.
- `topCustomers`: primeros 8 clientes por ventas.
- `customers`: todos los clientes, ordenados por ventas.

## Renderizado en RentabilidadClientes

Archivo: `src/modules/dashboard/components/rentabilidad-clientes.tsx`.

El componente muestra:

- Skeleton mientras la query esta pendiente.
- Card de error si React Query devuelve error.
- Cuatro KPIs:
  - Ventas totales.
  - Ganancia total.
  - Margen promedio.
  - Clientes activos.
- Grafico `ComposedChart` con:
  - barras verdes para ventas,
  - barras azules para ganancia,
  - linea naranja para margen,
  - eje izquierdo monetario,
  - eje derecho porcentual.
- Tabla/listado `Detalle por Cliente`, ordenada por ventas de mayor a menor.

El grafico usa `topCustomers`; el detalle usa `customers`.

## Funcion generica todavia disponible: getProfitabilityMetrics

Tambien existe una ruta y servicio generico de rentabilidad:

```text
GET /api/org/:orgSlug/torre-de-control/profitability?startDate=<ISO>&endDate=<ISO>&groupBy=CLIENT|BRAND|PRODUCT
```

Archivos:

- `src/app/api/org/[orgSlug]/torre-de-control/profitability/route.ts`
- `src/modules/dashboard/hooks/use-dashboard.ts`
- `src/modules/dashboard/service/dashboard.service.ts`

Actualmente esta funcion no es la que renderiza `AnalyticsTab`, pero sigue disponible en el modulo dashboard.

`getProfitabilityMetrics(organizationId, startDate, endDate, groupBy)`:

- Consulta ventas mayoristas en `sales_orders`.
- Consulta venta directa/POS en `pos_sales`.
- Descarta estados `CANCELLED`.
- Agrupa por cliente, marca o producto.
- Usa el `subtotal` de cada item como revenue.
- Busca costos actuales en `products_with_price.cost_price`.
- Calcula COGS como `cost_price * cantidad`.
- En mayoristas usa `unit_quantity ?? quantity`.
- En POS usa `quantity`.
- Si un producto no tiene costo, lo trata como costo 0 y loguea un warning.
- Devuelve top 10 ordenado por `profit` descendente.

La respuesta generica usa `ProfitabilityMetric`:

```ts
{
  label: string;
  revenue: number;
  profit: number;
  margin_percent: number;
  order_count: number;
}
```

## Consideraciones actuales

- La tab visible de Rentabilidad usa solo `sales_orders`; no incluye `pos_sales`.
- La funcion generica `getProfitabilityMetrics` si contempla mayorista y POS, pero no esta conectada al render actual de `AnalyticsTab`.
- Los costos de `getCustomerProfitabilityDashboard` salen de `sales_order_items.base_price`; no de `products_with_price.cost_price`.
- Las ventas canceladas se excluyen por estado exacto `CANCELLED`.
- El rango se filtra con fechas tipo `YYYY-MM-DD`, derivadas del `Date` recibido.
- Los filtros globales del dashboard (`customerId`, `supplierId`) llegan a `AnalyticsTab` como prop opcional, pero hoy no se pasan a `RentabilidadClientes` ni a la API de customer profitability.

