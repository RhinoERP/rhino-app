# Accounting Service

Servicio Express de contabilidad para RHINO.

El servicio se puede ejecutar de dos formas:

- Local o servidor persistente: `src/server.ts` levanta Express con `app.listen`.
- Vercel serverless: `api/[...route].ts` adapta la misma app Express a una Function.

## Desarrollo local

```bash
pnpm install
pnpm --filter @rhinos/accounting-service dev
```

El modo local usa `services/accounting/.env` y escucha en `PORT`, por defecto `3001`.

## Variables de entorno del servicio

Configurar en local y en el proyecto Vercel del servicio:

```env
DATABASE_URL=postgresql://...
SERVICE_TOKEN=token-interno
NODE_ENV=production
ALLOWED_ORIGIN=https://<monolito>.vercel.app
```

Notas:

- `SERVICE_TOKEN` debe coincidir con `ACCOUNTING_SERVICE_TOKEN` en el monolito.
- `PORT` solo se usa en local o servidores persistentes; Vercel lo ignora.
- Para Vercel serverless conviene usar una connection string/pooler compatible con serverless y revisar limites de conexiones de Supabase.

## Deploy en Vercel como proyecto separado

Crear un segundo proyecto Vercel apuntando al mismo repo.

Configuracion recomendada:

- Root Directory: `services/accounting`
- Framework Preset: Other
- Install Command: `pnpm install`
- Build Command: `pnpm build`

El archivo `vercel.json` reescribe rutas root hacia la Function en `api/[...route].ts`. Por eso el servicio conserva rutas como:

- `/health`
- `/preview`
- `/eventos`
- `/diario`
- `/mayor/:cuentaId`
- `/libros/iva`
- `/libros/iibb`
- `/informal-entries`

En el monolito configurar:

```env
ACCOUNTING_SERVICE_URL=https://<accounting-service>.vercel.app
ACCOUNTING_SERVICE_TOKEN=token-interno
```

No usar slash final en `ACCOUNTING_SERVICE_URL`.

## Validacion

Desde la raiz del repo:

```bash
pnpm --filter @rhinos/accounting-service typecheck
pnpm --filter @rhinos/accounting-service typecheck:vercel
pnpm --filter @rhinos/accounting-service test
pnpm --filter @rhinos/accounting-service build
```

Despues del deploy:

```bash
curl https://<accounting-service>.vercel.app/health
```

Debe responder con `{ "ok": true, "service": "accounting" }`.

## Migrations

Vercel no ejecuta las migrations. Correr los SQL de `migrations/` en orden contra la base configurada en `DATABASE_URL`.

Se pueden ejecutar desde Supabase SQL Editor o con `psql`.

## Arquitectura de rutas

El handler serverless normaliza el prefijo `/api` antes de entregar la request a Express. Esto permite que funcionen ambos formatos:

- `https://<service>.vercel.app/health`
- `https://<service>.vercel.app/api/health`

Internamente Express sigue recibiendo `/health`, `/preview`, `/eventos`, etc.