# Publicación de WhatsApp y sandbox

Revisado el 26 de octubre de 2026. El PR publica código; las operaciones de esta
guía se ejecutan en los entornos correspondientes después de revisar el SQL.
No se aplicaron cambios a la base productiva durante esta revisión.

## 1. Base de datos antes del frontend

**Aplicar primero la base y después desplegar Vercel.** Las consultas compartidas
de organizaciones ya incluyen `whatsapp_enabled` y `whatsapp_sandbox_enabled`;
si faltan esas columnas, también falla la carga de pantallas ajenas a WhatsApp.

El repositorio tiene timestamps duplicados anteriores a este release. Por ejemplo,
`20260902000000_create_whatsapp_agent_foundation.sql` comparte versión con
`20260902000000_harden_category_accounting_rules.sql`. Una entrada en el historial
para esa versión no demuestra que exista la fundación de WhatsApp. Además,
`20260907000000_prevent_duplicate_whatsapp_pre_sales.sql` es anterior a migraciones
de `main` recientes. **No ejecutar `supabase db push --include-all` a ciegas.**

Inspeccionar el proyecto correcto desde SQL Editor:

```sql
select to_regclass('public.whatsapp_integrations') as integrations,
       to_regclass('public.whatsapp_conversations') as conversations,
       to_regclass('public.agent_jobs') as jobs;
select version, name from supabase_migrations.schema_migrations order by version desc;
```

La revisión local no pudo leer el historial remoto: la conexión directa resuelve
a IPv6 y esta red no tiene ruta IPv6. Usar SQL Editor o el pooler IPv4 del
proyecto para inspeccionarlo; no inferir su estado a partir del repositorio.

Para este release se incluye un generador de SQL específico que evita depender
de esas versiones históricas:

```sh
node scripts/build-whatsapp-release-sql.mjs > /tmp/whatsapp-release.sql
```

Revisar el archivo generado y ejecutarlo completo en el SQL Editor del proyecto
Supabase de producción, como `postgres`, o con `psql` y la conexión segura de ese
proyecto (`psql "$WHATSAPP_DEPLOY_DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/whatsapp-release.sql`).
El script generador solamente escribe SQL; no abre conexiones ni despliega.

El SQL usa una transacción e incluye, en orden:

1. Fundación `20260902000000_create_whatsapp_agent_foundation.sql`, sólo si no
   existe ninguna de las ocho tablas del módulo. Si la fundación es parcial,
   aborta para permitir inspeccionarla antes de continuar.
2. RPCs del canal `20260902010000_add_whatsapp_channel_functions.sql`.
3. Índice de preventa única por conversación `20260907000000_prevent_duplicate_whatsapp_pre_sales.sql`.
4. Horarios y demoras `20261017010000_whatsapp_business_hours_and_response_delay.sql`.
5. Opt-in, protección de flags, políticas restrictivas y RPCs con bloqueo por
   empresa `20261026000000_gate_whatsapp_modules.sql`.

Se puede volver a ejecutar sobre una fundación completa; no borra conversaciones,
no habilita empresas y no modifica el historial de migraciones. Las migraciones
originales quedan versionadas; la reconciliación de las versiones duplicadas del
repositorio debe hacerse por separado. Conservar el SQL ejecutado y el commit del
release como registro del despliegue manual.

Si el índice único falla por datos previos, la transacción se revierte completa.
Inspeccionar las duplicaciones, sin borrar ventas automáticamente:

```sql
select organization_id, conversation_id, count(*)
from public.sales_orders
where conversation_id is not null
group by organization_id, conversation_id having count(*) > 1;
```

Después de aplicar, comprobar que los flags estén apagados en todas las empresas
que no se habilitaron expresamente:

```sql
select id, slug, is_active, whatsapp_enabled, whatsapp_sandbox_enabled
from public.organizations
order by slug;
```

## 2. Vercel: aplicación, sandbox, webhook y API interna

Desplegar el commit del PR una vez mergeado a `main`, con las variables en el
entorno **Production**, además de las variables existentes de Rhinos:

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Proyecto Supabase de producción. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública del mismo proyecto. |
| `SUPABASE_SECRET_KEY` | Clave privada de servidor para las operaciones del módulo. |
| `OPENAI_API_KEY` | Obligatoria para el sandbox. |
| `WHATSAPP_AGENT_OPENAI_MODEL` | Opcional; por defecto `gpt-5-mini`. Usar el mismo modelo en Railway. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Secreto elegido para verificar la suscripción de Meta. |
| `WHATSAPP_META_APP_SECRET` | App Secret de la aplicación Meta; valida las firmas de POST. |
| `WHATSAPP_AGENT_SERVICE_TOKEN` | Secreto largo compartido exactamente con Railway. |
| `WHATSAPP_META_ACCESS_TOKEN` | Token de Meta para responder manualmente desde el inbox. |
| `WHATSAPP_META_GRAPH_VERSION` | Opcional; el código usa `v23.0` por defecto. Configurar la misma versión en Railway. |

Los secretos no llevan prefijo `NEXT_PUBLIC_`. Para usar sólo sandbox alcanzan las
credenciales existentes de Supabase y OpenAI en Vercel. No necesita Meta ni
Railway. El endpoint del sandbox tiene `maxDuration = 60`; verificar que la
configuración del proyecto Vercel permita ese tiempo.

## 3. Railway: worker persistente para WhatsApp real

Crear o actualizar un servicio independiente del servicio contable y del frontend.
Configurar el repositorio, rama `main`, Node 22 y raíz **`/`**. Es un workspace
compartido: el lockfile está en la raíz, no en el directorio del worker.

| Ajuste | Valor |
| --- | --- |
| Instalación | `pnpm install --frozen-lockfile` |
| Build | `pnpm --filter @rhinos/whatsapp-agent build` |
| Start | `pnpm --filter @rhinos/whatsapp-agent start` |
| Healthcheck | `/health` |
| Watch paths | `/services/whatsapp-agent/**`, `/pnpm-lock.yaml`, `/pnpm-workspace.yaml`, `/package.json` |

Variables del servicio:

```dotenv
SUPABASE_URL=https://<mismo-proyecto-que-vercel>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<clave-privada-del-mismo-proyecto>
WHATSAPP_AGENT_RHINOS_URL=https://<dominio-productivo-de-rhinos>
WHATSAPP_AGENT_SERVICE_TOKEN=<mismo-secreto-que-vercel>
WHATSAPP_META_ACCESS_TOKEN=<token-de-meta-con-acceso-a-los-numeros-habilitados>
WHATSAPP_META_GRAPH_VERSION=v23.0
OPENAI_API_KEY=<clave-de-openai>
WHATSAPP_AGENT_OPENAI_MODEL=gpt-5-mini
WHATSAPP_AGENT_POLL_INTERVAL_MS=1000
```

`PORT` lo provee Railway. `WHATSAPP_AGENT_WORKER_ID` es opcional. La URL de Rhinos
debe ser accesible desde Railway, sin login o protección de preview delante de
`/api/internal/whatsapp-agent/tools/*`. Esas rutas autentican el secreto compartido;
el webhook autentica a Meta y no depende de cookies de navegador.

Consultar `/health`: debe devolver `ok: true` **y `configured: true`**. Un HTTP 200
con `configured: false` indica que el proceso está vivo, pero no reclama jobs.
La salud no certifica que Meta, OpenAI o la API interna acepten las credenciales;
para eso hace falta la prueba real del paso 5.

## 4. Activación por empresa desde superadmin

En `/admin/organizacion/<slug>` → **Configuración de Módulos**, usar los switches y
**Guardar**:

- **Sandbox de WhatsApp:** habilita `/org/<slug>/whatsapp/simulador` de manera
  independiente. Requiere `whatsapp.read` y `whatsapp.manage`; crear una preventa
  requiere además `sales.manage`. `organization.admin` conserva el acceso
  administrativo habitual. Seleccionar cliente y lista activos de esa empresa.
- **WhatsApp comercial:** habilita inbox, configuración, webhook y worker real.
  Después ir a `/org/<slug>/whatsapp/configuracion`, cargar el **Phone Number ID**
  de Meta, lista de precios y responsable activo, horario, demora y derivación.
  Conservar la integración en `DRAFT` hasta completar las credenciales; el estado
  `ACTIVE` es necesario para procesar mensajes reales.

Ambos switches parten apagados en empresas nuevas y existentes. Sólo superadmin
puede modificar su disponibilidad. Un administrador de empresa configura la
integración una vez habilitada, pero no puede habilitarse el módulo por API o REST.

**Sandbox usa datos reales.** Guarda conversaciones, carritos y preventas reales
en borrador. No es un catálogo ficticio ni una base descartable. No envía a Meta,
no confirma ventas, no factura ni reserva stock. Las integraciones del sandbox
usan el prefijo `rhinos-local-simulator:` y permanecen en `DRAFT`.

## 5. Meta y prueba de punta a punta

En la aplicación Meta correspondiente al token y a los números configurados:

1. Callback HTTPS: `https://<dominio-productivo>/api/webhooks/whatsapp`.
2. Verify Token: mismo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN` en Vercel.
3. Suscribir el campo `messages` de la cuenta WhatsApp Business correspondiente.
4. Confirmar que el token puede enviar desde el Phone Number ID configurado y
   que el App Secret corresponde a la aplicación que firma los webhooks.
5. Habilitar sólo una empresa piloto e integración `ACTIVE`. Iniciar desde un
   teléfono autorizado una conversación con el número de prueba/producción.

Verificar el recorrido: `whatsapp_messages` entrante → `agent_jobs` → demora y
horario → `agent_runs` → respuesta Meta → mensaje saliente y estado de entrega.
Probar consulta, carrito, resumen, confirmación y una única preventa `DRAFT`.
Repetir un webhook y comprobar que no duplica mensaje ni preventa. Probar pausa,
derivación, respuesta manual desde el inbox y reactivación explícita.

En otra empresa, con ambos switches apagados, comprobar que no aparecen los
accesos y que pegar las URLs de configuración, inbox y simulador no permite
entrar. Deshabilitar la empresa piloto desde superadmin: los nuevos eventos no
encolan automatización y los jobs pendientes dejan de reclamarse.

## 6. Límites operativos y reversión

El envío usa actualmente **un token Meta global por servicio**, no los secretos
por integración de `whatsapp_integration_secrets`. Para varias empresas, ese token
debe tener acceso a cada número habilitado. No se implementó aprovisionamiento
de tokens independientes por empresa. Las referencias a secretos en la tabla
no sustituyen las variables de entorno.

Los mensajes son texto libre; no se implementaron plantillas ni campañas. Los
errores de Meta y OpenAI quedan en la auditoría/reintentos. No se ejecutó una
prueba contra proveedores reales durante esta revisión.

Para apagar una empresa, desactivar ambos switches en superadmin. Para detener
todo el canal real, detener el servicio Railway y dejar las integraciones en
`PAUSED` o `DRAFT`. Los mensajes recibidos con el módulo apagado se reconocen pero
se descartan; no se recuperan automáticamente al habilitarlo. Los jobs que ya
estaban pendientes se conservan y pueden continuar al reactivarlo. Un envío ya
aceptado por Meta no se puede retirar. Conservar las tablas y columnas si se
revierte el frontend; no eliminar datos como parte del rollback.

## Verificación local reproducible

```sh
pnpm exec biome check .
pnpm exec vitest run
pnpm --filter @rhinos/whatsapp-agent build
pnpm build
bash scripts/test-whatsapp-db.sh
```

La última prueba requiere Docker y crea un PostgreSQL 16 descartable con las
dependencias mínimas del módulo. Valida migraciones, defaults, RLS, protección de
flags, sandbox independiente, ingesta, deduplicación, cola y demoras. No inicia
Supabase ni conecta a producción.

Referencias oficiales: [Railway monorepos](https://docs.railway.com/deployments/monorepo),
[Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations),
[Supabase db push](https://supabase.com/docs/reference/cli/supabase-db-push),
[Meta Webhooks](https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks).
