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
| `WHATSAPP_AGENT_OPENAI_MODEL` | Opcional; por defecto `gpt-5-mini`. Usar el mismo modelo en el worker. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Secreto elegido para verificar la suscripción de Meta. |
| `WHATSAPP_META_APP_SECRET` | App Secret de la aplicación Meta; valida las firmas de POST. |
| `WHATSAPP_AGENT_SERVICE_TOKEN` | Secreto largo para autenticar el worker contra la API interna. |
| `WHATSAPP_META_ACCESS_TOKEN` | Token de Meta para responder manualmente desde el inbox. |
| `WHATSAPP_META_GRAPH_VERSION` | Opcional; el código usa `v23.0` por defecto. Configurar la misma versión en el worker. |

Los secretos no llevan prefijo `NEXT_PUBLIC_`. Para usar sólo sandbox alcanzan las
credenciales existentes de Supabase y OpenAI en Vercel. No necesita Meta ni
Railway. El endpoint del sandbox tiene `maxDuration = 60`; verificar que la
configuración del proyecto Vercel permita ese tiempo.

## 3. Vercel Daemons: worker en el proyecto Pro de Rhinos

Vercel Daemons ejecuta el proceso permanente del worker junto al frontend. Es
beta pública, funciona sólo en Production y cobra CPU activa y memoria
provisionada en Pro; tener Pro no implica consumo ilimitado ni gratuito.

El repositorio incluye `vercel.json` y
`services/whatsapp-agent/Dockerfile`, con una imagen Node 22 para Linux amd64,
dependencias fijadas en un lockfile independiente y ejecución como usuario sin
privilegios. El contexto Docker excluye los archivos `.env`, el `node_modules`
local y cualquier archivo ajeno al worker. No agregar secretos al Dockerfile.

**El daemon se publica con cero instancias** (`iad1: 0`). Así el deploy registra
la configuración, pero no arranca el proceso ni consume jobs hasta activarlo.
Se configura un tamaño de 1 GiB y 120 segundos para finalizar trabajos al recibir
SIGTERM. El sandbox funciona con el daemon detenido.

### Preparación y publicación

1. En el proyecto **productivo** de Rhinos, comprobar que Root Directory sea la
   raíz del repositorio, sin subcarpeta. La beta de Daemons no admite proyectos
   con Root Directory configurado en una subcarpeta.
2. Aplicar primero la base del paso 1. Después configurar las variables de
   Production del paso 2 y las del worker indicadas abajo. Usar un secreto nuevo
   para `WHATSAPP_AGENT_SERVICE_TOKEN` y guardar el mismo valor para la API interna.
3. Mergear el PR y dejar que Vercel despliegue `main`. No hace falta crear un
   segundo proyecto Vercel ni contratar Railway. Conservar los comandos actuales
   de build de Next; Vercel construye el Dockerfile del daemon por separado.
4. En **Daemons → whatsapp-agent → Scale**, habilitar **1 instancia en iad1**
   (o ajustar primero la región a la de la base). Este override persiste entre
   despliegues, aunque `vercel.json` conserve cero instancias. Mantener detenida
   cualquier copia del worker en Railway u otro proyecto si se está migrando.
5. En los logs del daemon, comprobar
   `[whatsapp-agent] worker configurado; iniciando polling`. Si aparece el aviso
   de variables comerciales faltantes, corregirlas y hacer un nuevo deploy de
   Production. Cambiar variables en Settings sin redesplegar no actualiza un
   proceso ya iniciado. La prueba de punta a punta sigue siendo necesaria.
6. Habilitar únicamente la empresa piloto y su integración según el paso 4.

Variables del worker en **Settings → Environment Variables → Production**:

```dotenv
# El worker reutiliza NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY
# que ya tiene el proyecto de Rhinos. No necesita repetirlas con otros nombres.
WHATSAPP_AGENT_RHINOS_URL=https://<dominio-productivo-de-rhinos>
WHATSAPP_AGENT_SERVICE_TOKEN=<secreto-largo-para-la-api-interna>
WHATSAPP_META_ACCESS_TOKEN=<token-de-meta-con-acceso-a-los-numeros-habilitados>
WHATSAPP_META_GRAPH_VERSION=v23.0
OPENAI_API_KEY=<clave-de-openai>
WHATSAPP_AGENT_OPENAI_MODEL=gpt-5-mini
WHATSAPP_AGENT_POLL_INTERVAL_MS=5000
```

`WHATSAPP_AGENT_WORKER_ID` es opcional; cada proceso recibe un identificador
propio por defecto. El intervalo recomendado revisa la cola cada cinco segundos,
conservando los horarios y demoras configurados por empresa. La URL de Rhinos
debe permitir acceso del worker a `/api/internal/whatsapp-agent/tools/*`, sin
login o protección de preview delante. La API autentica el secreto compartido.
El webhook de Meta sigue apuntando al dominio de Rhinos en Vercel.

Daemons no recibe tráfico HTTP entrante durante la beta. El `/health` del worker
sirve para pruebas locales y Railway; en Vercel usar el estado del daemon, sus
logs y las tablas `agent_jobs` y `agent_runs`. Nunca cambiar el callback de Meta
para apuntarlo al daemon.

Para detenerlo: **Daemons → whatsapp-agent → Scale → 0 instancias** en todas las
regiones. Desactivar los flags de una empresa sólo detiene su operación; el
proceso global sigue consultando la cola mientras haya una instancia.

### Prueba local de la imagen

```sh
docker build --platform linux/amd64 -t rhino-whatsapp-daemon services/whatsapp-agent
# Usar un archivo privado con credenciales de prueba, fuera del contexto Docker:
docker run --rm --env-file /ruta/privada/worker.env rhino-whatsapp-daemon
```

La imagen usa `services/whatsapp-agent/pnpm-lock.yaml`; el desarrollo del monorepo
sigue usando el lockfile de la raíz. Al actualizar dependencias del worker,
actualizar también el lockfile independiente y repetir la construcción Docker.

### Alternativa: Railway

El mismo worker puede ejecutarse en Railway si se prefiere otra plataforma. Crear
un servicio independiente con raíz `/`, Node 22, instalación
`pnpm install --frozen-lockfile`, build
`pnpm --filter @rhinos/whatsapp-agent build`, inicio
`pnpm --filter @rhinos/whatsapp-agent start` y healthcheck `/health`.
Configurar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del mismo proyecto que
Vercel, además de las variables del worker anteriores. El secreto compartido debe
coincidir en ambos servicios. Watch paths: `/services/whatsapp-agent/**`,
`/pnpm-lock.yaml`, `/pnpm-workspace.yaml`, `/package.json`.
Consultar `/health`: debe devolver `ok: true` **y `configured: true`**. Esto
comprueba la presencia de variables, no que los proveedores las acepten.

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
todo el canal real, escalar el daemon a cero (o detener Railway si se usa esa
alternativa) y dejar las integraciones en
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
docker build --platform linux/amd64 -t rhino-whatsapp-daemon services/whatsapp-agent
```

La última prueba requiere Docker y crea un PostgreSQL 16 descartable con las
dependencias mínimas del módulo. Valida migraciones, defaults, RLS, protección de
flags, sandbox independiente, ingesta, deduplicación, cola y demoras. No inicia
Supabase ni conecta a producción.

Referencias oficiales: [Vercel Daemons](https://vercel.com/docs/daemons),
[Configuración](https://vercel.com/docs/daemons/config-reference),
[Escalado y activación](https://vercel.com/docs/daemons/managing-daemons),
[Límites y facturación](https://vercel.com/docs/daemons/limits),
[Railway monorepos](https://docs.railway.com/deployments/monorepo),
[Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations),
[Supabase db push](https://supabase.com/docs/reference/cli/supabase-db-push),
[Meta Webhooks](https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks).
