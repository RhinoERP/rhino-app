# Arquitectura, convenciones y librerias

Este documento describe el estado actual del proyecto Rhino App a partir del codigo del repositorio.

## Stack principal

- Framework: Next.js 16 con App Router.
- Lenguaje: TypeScript con `strict` y `strictNullChecks` habilitados.
- UI: React 19, Tailwind CSS 4, componentes estilo shadcn/ui en `src/components/ui`.
- Backend de datos y autenticacion: Supabase con `@supabase/ssr` y tipos generados en `src/types/supabase.ts`.
- Estado y cache del cliente: TanStack React Query.
- Estado en URL: `nuqs`.
- Formularios y validacion: `react-hook-form`, `@hookform/resolvers` y `zod`.
- Tablas: TanStack Table y componentes compartidos en `src/components/data-table`.
- Graficos: Recharts.
- Iconos: `lucide-react` y `@phosphor-icons/react`; `components.json` declara Phosphor como libreria de iconos shadcn.
- Email: React Email y Resend.
- Archivos/exportaciones: `xlsx`, `jspdf` y `html2canvas`.
- Lint/formato: Biome con presets `ultracite/core` y `ultracite/next`.
- Package manager esperado: pnpm.

## Estructura general

```text
src/
  app/             Rutas App Router, layouts, pages y route handlers API.
  components/      Componentes reutilizables de UI y componentes de pantallas.
  hooks/           Hooks genericos reutilizables.
  lib/             Utilidades compartidas, clientes Supabase, formatters y parsers.
  modules/         Modulos de dominio con service/actions/hooks/queries/types.
  types/           Tipos globales y tipos generados.
```

Las rutas de negocio viven bajo `src/app/org/[orgSlug]`. El dashboard principal esta en `src/app/org/[orgSlug]/page.tsx` y renderiza `DashboardClient`, que controla las tabs de Torre de Control, Administracion de Saldos, Venta Directa y Rentabilidad.

## Patron por modulo

Los dominios principales se agrupan en `src/modules/<dominio>`. El patron mas repetido es:

- `service/`: funciones de acceso a datos y reglas de dominio ejecutadas en servidor.
- `actions/`: Server Actions para mutaciones desde UI. Suelen llamar servicios y luego `revalidatePath`.
- `hooks/`: hooks cliente basados en React Query para leer o mutar datos.
- `queries/`: `queryOptions` y query keys compartidas para React Query.
- `types.ts`: contratos del dominio y, cuando aplica, schemas Zod.
- `utils/`: helpers locales del dominio.

Los componentes visuales especificos de pantallas suelen estar en `src/components/<feature>` o dentro del modulo cuando son muy propios del dominio, como `src/modules/dashboard/components/rentabilidad-clientes.tsx`.

## Flujo de datos recomendado

1. UI cliente usa `useQuery`, `useMutation` o `queryOptions`.
2. La lectura cliente llama a un route handler en `src/app/api/...` cuando necesita datos dinamicos desde navegador.
3. El route handler valida parametros, resuelve `orgSlug` con `getOrganizationBySlug` y delega el calculo a un servicio.
4. El servicio usa `createClient` desde `src/lib/supabase/server.ts` para consultar Supabase.
5. Los tipos de respuesta viven en `src/types` o en `src/modules/<dominio>/types.ts`.

En paginas server-rendered se prefetchan algunas queries con `getQueryClient`, `queryOptions`, `prefetchQuery` y `HydrationBoundary`. En el dashboard, `src/app/org/[orgSlug]/page.tsx` prefetcha Torre de Control y Administracion de Saldos; la tab de Rentabilidad se carga en cliente cuando se renderiza.

## Layout, autenticacion y permisos

- `src/app/layout.tsx` configura providers globales: `NuqsAdapter`, theme provider, React Query provider y toaster.
- `src/app/org/[orgSlug]/layout.tsx` carga datos de organizacion y usuario con `getOrganizationLayoutData`, inicializa `PermissionsProvider`, sidebar y navegacion inferior.
- `proxy.ts` actualiza la sesion Supabase para casi todas las rutas, excluyendo assets de Next e imagenes.
- Las rutas por organizacion usan `orgSlug` como identificador publico y resuelven internamente el `organization.id`.
- Los permisos se chequean antes de mostrar el dashboard; si falta `dashboard.read`, se redirige a la primera ruta accesible.

## Convenciones de codigo

- Imports absolutos con alias `@/*`, definido en `tsconfig.json`.
- Componentes cliente declaran `"use client"` al inicio.
- Servicios de servidor crean el cliente Supabase dentro de cada funcion; no se guarda el cliente server en una variable global.
- Query keys centralizadas por modulo, por ejemplo `src/modules/dashboard/queries/query-keys.ts`.
- Route handlers devuelven `NextResponse.json` y hacen validacion explicita de parametros.
- Los errores de API incluyen mensajes estables para el cliente y logs con contexto en servidor.
- Se prefiere tipar respuestas con tipos compartidos antes de usar objetos implicitos.
- Fechas de APIs del dashboard se envian como ISO desde cliente y se convierten a `YYYY-MM-DD` en servicios cuando se filtra por columnas tipo fecha.
- Importes monetarios se redondean a dos decimales con helpers locales cuando se calculan KPIs.
- UI usa componentes base de `src/components/ui` y utilidades como `cn` de `src/lib/utils`.
- El codigo generado de Supabase y algunos componentes base quedan excluidos del lint segun `biome.jsonc`.

## Scripts disponibles

- `pnpm run dev`: levanta Next en desarrollo.
- `pnpm run build`: build de produccion.
- `pnpm run start`: sirve el build.
- `pnpm run lint`: ejecuta `biome check .`.
- `pnpm run lint:fix`: ejecuta `biome check . --write`.
- `pnpm run test`: actualmente apunta a `pnpm lint`.

## Variables de entorno relevantes

Los clientes Supabase requieren:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

El archivo `.env.example` documenta las variables esperadas. Las credenciales sensibles no deben hardcodearse en el codigo.

## Librerias por responsabilidad

- Datos remotos/cache: `@tanstack/react-query`, `@tanstack/react-query-devtools`.
- Base de datos/auth: `@supabase/ssr`, `@supabase/supabase-js`.
- UI primitives: Radix UI, shadcn/ui, Tailwind CSS, `class-variance-authority`, `clsx`, `tailwind-merge`.
- Navegacion y URL state: Next App Router, `nuqs`.
- Visualizacion: Recharts.
- Formularios: `react-hook-form`, Zod.
- Tablas y filtros: TanStack Table, componentes propios de `src/components/data-table`.
- Emails: React Email, Resend.
- Exportacion/importacion: `xlsx`, `jspdf`, `html2canvas`.

