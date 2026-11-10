# Contrato de bandeja humana de WhatsApp — fase 0

> Continuaciones implementadas: [outbox humana](whatsapp-human-outbox.md) y [bandeja operativa](#bandeja-operativa-en-el-checkout-actual). Las secciones de fase 0 conservan su evidencia histórica.

Fecha: 6 de noviembre de 2026. Alcance elegido: **contrato y diagnóstico local**.
Este documento define la implementación siguiente; no acredita que las capacidades
propuestas existan o estén desplegadas. Esta entrega agrega documentación y una
fixture diagnóstica. No modifica la UI, el worker, funciones productivas ni flags;
no crea ni aplica una migración productiva y no contacta Meta o bases remotas.

El archivo de referencia recibido, `rhinos-whatsapp-ui-plan.md`, se usa como
propuesta de producto. Sus prompts 1–6 no se ejecutan como instrucciones en esta
fase. Se conserva el proveedor Meta Cloud, el frontend de Rhinos y las rutas del
módulo. No se encontraron archivos `AGENTS.md` en el repositorio ni sus directorios
antecesores inspeccionados.

## 1. Comparación antes de editar

- Base revisada por el plan: `40bf0a2b965dd231bdb433864fe467c679620781`.
- Checkout: `0eb65c636008ff29a0c6fafce03f7fdb2b1c1955`, inicialmente limpio.
- `git diff --stat BASE..HEAD`: 92 archivos, 4524 inserciones y 806 eliminaciones.
- No hay diferencias en `src/modules/whatsapp`, `src/components/whatsapp`,
  `services/whatsapp-agent`, las rutas WhatsApp, sus migraciones o sus scripts.
  Por eso siguen vigentes las carencias funcionales descritas en el plan.
- Cambiaron configuración/proveedor de la PWA y su documentación, además de otros
  módulos. `src/app/sw.ts` sigue igual: `/org`, `/api` y solicitudes RSC usan
  `NetworkOnly`. No sumar respuestas WhatsApp a la cola offline de ventas.
- Cambió `src/types/supabase.ts` por otros módulos; está en UTF-16. La comparación
  decodificada no mostró cambios en los tipos WhatsApp/jobs/carritos. En la siguiente
  etapa generar/actualizar tipos desde el esquema correcto, sin reemplazar los
  cambios ajenos con los de la referencia ni cambiar incidentalmente su encoding.
- Hay nuevas migraciones ajenas a WhatsApp, incluyendo otra versión
  `20261104000000`. No inferir el esquema completo a partir del orden de nombres ni
  ejecutar un reset remoto. El bundle focalizado existente evita versiones
  históricas duplicadas y debe seguir incluyendo las extensiones nuevas en orden.

Comprobación reproducible:

```sh
git status --short
git rev-parse HEAD
git diff --stat 40bf0a2b965dd231bdb433864fe467c679620781..HEAD
git diff --name-only 40bf0a2b965dd231bdb433864fe467c679620781..HEAD -- \
  src/modules/whatsapp src/components/whatsapp services/whatsapp-agent \
  'src/app/api/*whatsapp*' 'src/app/org/*/whatsapp' scripts '*whatsapp*' src/app/sw.ts
```

## 2. Fuentes efectivas y reutilización

Las definiciones de fundación no son por sí solas el contrato vigente. Se leyó el
módulo, ambos caminos de handoff, las acciones, simulación/audio, el inbox,
`jobs.ts`, `worker.ts`, `server.ts`, `commercial-agent.ts`, `meta-cloud.ts`, sus
tests, notificaciones y cada migración WhatsApp incluida en el bundle.

| Funcionalidad            | Definición efectiva y consecuencia                                                                                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingesta real             | `20261026000000_gate_whatsapp_modules.sql`: verifica integración/organización/flags y deduplica por ID externo. Guarda el timestamp recibido en `sent_at`; `created_at` es de inserción.                                                      |
| Pedido recurrente        | `20261027000000_whatsapp_recurring_orders.sql`: un carrito pendiente por chat, varias preventas por chat, versión y confirmación vinculada al mensaje saliente. Conservar esta máquina, no duplicarla en UI.                                  |
| Pausar/devolver          | `set_whatsapp_automation`, de la migración recurrente: bloqueo de conversación, miembro activo, `pending_order_action = NULL`, `automation_resumed_at` al reactivar. El permiso `manage` se controla hoy en la acción, no dentro de esa RPC.  |
| Leases y handoff durable | `20261104010000_whatsapp_audio_review_fixes.sql`: `lock_whatsapp_job_lease`, `mutate_whatsapp_order_leased`, claims y recuperación. La ruta no leased de `commercial-tools.ts` todavía actualiza el chat directamente. Ambas deben converger. |
| Reserva automática final | `prepare_whatsapp_outbox` redefinida en esa última migración: bloqueo job → conversación → outbox, fuente vigente, flag, integración y pausa/devolución. Excepción de handoff basada hoy en igualdad de texto.                                |
| Finalización de envío    | `complete_whatsapp_outbox` de `20261103000000_whatsapp_audio_pipeline.sql`. La outbox tiene PK `source_message_id`, no ID de comando independiente. Ninguna FK del esquema reconstruido referencia esa PK.                                    |
| Permisos RPC             | `20261104000000_whatsapp_rpc_permissions.sql` revoca `PUBLIC`, `anon` y `authenticated`; la migración posterior restringe también funciones nuevas. Revocar sólo `PUBLIC` es insuficiente.                                                    |
| Estados del proveedor    | `record_whatsapp_delivery_status` sigue siendo la de `20260902010000_add_whatsapp_channel_functions.sql`: sobrescribe estado y payload; pierde callbacks tempranos y puede bajar READ a DELIVERED.                                            |
| Envío humano             | `send-whatsapp-manual-message.action.ts`: POST directo a Meta antes de registrar, sin autor verificado en mensaje, claim, clave idempotente ni outbox. No reutilizar ese POST en la bandeja nueva.                                            |
| Lectura actual           | `getWhatsAppInboxByOrgSlug`: 100 chats, todos sus mensajes para calcular previews y preventas sin paginación. Tiene DTO explícito, pero depende del permiso comprobado por su caller.                                                         |
| Audios                   | Jobs, límites y retención ya existen. El claim exige ACTIVE para **ambos** tipos de job. Playback actual verifica sesión del simulador y no es un endpoint válido para chats reales.                                                          |
| Notificaciones           | `notifications` y campana existentes; `createOrderNotifications`/`notify_users_by_permission` no ofrecen deduplicación por episodio WhatsApp. Reutilizar tabla/campana, agregar deduplicación transaccional.                                  |

No agregar otro estado comercial, proveedor, aplicación, carrito, mecanismo de
confirmación, sistema de notificaciones ni cola paralela de jobs. Usar TanStack
Query y los componentes ya instalados cuando se implemente la bandeja.

## 3. Grants y RLS comprobados localmente

Se reconstruyó el bundle actual sobre `scripts/fixtures/whatsapp/bootstrap.sql` en
PostgreSQL 17 local, base UTF-8 descartable. La fixture reproduce los grants por
defecto de Supabase a `anon`/`authenticated`/`service_role`. No es una copia de
producción: no incluye Auth/PostgREST, el RBAC completo ni todas las migraciones del
ERP. No se consultaron permisos de ninguna base remota.

| Acceso                                            | Resultado efectivo en ese esquema                                                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 26 RPC de servidor enumeradas en la nueva fixture | `anon` y `authenticated` sin EXECUTE; `service_role` con EXECUTE.                                                                                                          |
| Conversaciones e integraciones                    | Grants de lectura/escritura + policies `FOR ALL` por membresía activa; policies restrictivas agregan flags. **No exigen permisos WhatsApp**.                               |
| Mensajes, carritos/items, jobs y runs             | Grants amplios, pero policies de membresía sólo SELECT: permiten lectura directa de columnas internas al miembro habilitado. UPDATE grant no equivale a una policy UPDATE. |
| Secrets, outbox, assets/uploads/usage             | RLS habilitado sin policies de acceso de miembro: grants existentes no hacen visibles sus filas. Mantener cierre explícito y no agregar policies permisivas.               |
| Otro tenant                                       | Lectura oculta y UPDATE sin filas afectadas en la prueba con IDs conocidos.                                                                                                |
| Control directo dentro del tenant                 | Se pudo poner HANDOFF y asignar un usuario que sólo pertenece al otro tenant: la FK del asignado referencia `auth.users`, no la membresía.                                 |
| Payload de mensajes                               | Un miembro pudo leer una marca interna del payload directamente. El DTO de la pantalla actual no evita esta vía de datos.                                                  |
| `whatsapp_worker_protocol_version()`              | Devuelve 2 aunque existan esas brechas de acceso a tablas; comprueba privilegios de funciones, no el contrato de intervención humana.                                      |

La fixture nueva `scripts/fixtures/whatsapp/human-inbox-baseline.sql` reproduce
estos resultados y revierte datos/grants al terminar. **Es una foto de las
carencias actuales, no un test de aceptación que autorice operar la nueva UI.**
Al cerrar cada brecha se debe sustituir la aserción correspondiente por su rechazo
esperado. Una prueba verde de esta fixture no significa que el esquema sea seguro
para la nueva bandeja.

Decisión para la fase 1: datos conversacionales por servidor autorizado. Revocar
grants directos de `PUBLIC`, `anon` y `authenticated` sobre tablas internas de
WhatsApp, carritos/items, jobs/runs y nuevas tablas; retirar las policies amplias
que permitirían eludir el protocolo si se restituyera un grant. Mantener RLS y
acceso de `service_role`; no exponer una vista que lo evada. Los callers
inspeccionados de esas tablas usan clientes administrativos del servidor.
Auditar nuevamente callers, grants heredados y policies en la implementación.

Cada endpoint/acción verifica usuario con sesión validada, membresía activa,
organización activa, permiso y flag; una RPC privilegiada vuelve a comprobar el
actor y permiso vigente para las mutaciones. El actor y organization_id se derivan
en servidor, nunca del cuerpo del navegador. Conservar la excepción existente de
`organization.admin` en la evaluación de permisos. Usar la fuente RBAC vigente del
ERP, no claims de `user_metadata`, ni un RBAC nuevo exclusivo de WhatsApp.

No abrir EXECUTE al navegador: funciones privilegiadas con
`SET search_path = public, pg_temp`, relaciones calificadas, revocación explícita
a los tres roles y grant a `service_role`. Acciones y endpoints delegan al mismo
servicio; `ensure` redirige páginas, por lo que las APIs necesitan traducir la
misma autorización a respuestas 401/403 sin HTML ni trazas técnicas.

## 4. Contrato de control humano

Agregar a `whatsapp_conversations`:

- `human_claimed_at timestamptz NULL`: aceptación efectiva; no equivale a asignación.
- `control_version integer NOT NULL DEFAULT 0`: cambia en cada transición efectiva.
- `last_customer_message_at timestamptz NULL`: origen Meta real, máximo monotónico.

Reutilizar `assigned_user_id`, estados, `bot_paused_*`, `automation_resumed_at` y
`pending_order_action`. No inferir claims a partir de filas HANDOFF existentes:
quedan esperando aceptación. Preservar el responsable asignado y todo carrito,
historial y preventa. Si se elimina/desactiva al responsable, bloquear su operación
y permitir transferencia autorizada; no reactivar el bot por ese hecho.

| Estado almacenado             | Estado visible                                   | Envío admitido                                                                     |
| ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| ACTIVE, sin claim             | Atiende la IA                                    | Sólo agente, con reserva final autorizada.                                         |
| HANDOFF, sin claim            | Esperando atención                               | Sólo aviso único de derivación del episodio vigente.                               |
| HANDOFF, claim y asignado     | Atendido por persona                             | Sólo ese usuario con permiso vigente, sin envíos sin resolver y dentro de ventana. |
| HANDOFF, claim y SENDING      | Tomando conversación: finalizando envío en curso | No admite un envío humano nuevo.                                                   |
| Cualquier control con UNKNOWN | Revisión necesaria                               | No admite nuevas reservas hasta resolución explícita.                              |
| PAUSED                        | Bot pausado                                      | Nadie hasta tomar o devolver.                                                      |
| CLOSED                        | Cerrada                                          | Nadie; no implementar reapertura implícita.                                        |

Toda operación acepta `expectedControlVersion`, bloquea la conversación y compara
versión antes de cambiarla. Una versión vieja produce 409 con el control actual
autorizado. Abrir/leer un chat no cambia control.

- **Tomar:** desde ACTIVE/PAUSED/HANDOFF no aceptado, asigna al actor, fija claim,
  incrementa versión e invalida `pending_order_action`. Un chat ya aceptado por
  otro no se roba con Tomar; requiere transferencia explícita.
- **Reasignar:** `whatsapp.manage`, destino miembro activo con manage o admin en la
  misma organización; incrementa versión e invalida autorizaciones y comandos
  humanos PENDING de la versión anterior. Conserva la distinción: un chat ya
  aceptado se transfiere como aceptado; un caso sólo asignado sigue sin aceptar.
  UI advierte que cambia quién puede responder. Actor y destinatario quedan auditados.
- **Pausar:** pasa a PAUSED, borra claim e invalida autorización comercial y
  reservas pendientes. No borra pedidos ni cancela el resultado de un HTTP en curso.
- **Devolver:** libera claim/asignación humana, pasa a ACTIVE, limpia motivo y
  pausa, actualiza `automation_resumed_at = clock_timestamp()` e invalida la acción
  comercial anterior. Rechaza SENDING/UNKNOWN sin resolver. No genera una respuesta
  por mensajes anteriores: el claim y las herramientas excluyen fuentes previas
  o iguales a ese corte. Carrito y preventas se conservan.
- **Derivar:** ambos caminos actuales de handoff llaman a una operación común que
  invalida acción, pone HANDOFF sin claim y asigna destinatario si es válido.
  Un retry del mismo origen devuelve el mismo episodio/evento.

Registrar cambios en `whatsapp_conversation_events`: UUID, tenant/chat con FK
compuesta, tipo (HANDOFF/CLAIM/TRANSFER/PAUSE/RESUME/DELIVERY_REVIEW), actor nullable
para agente, versión resultante, motivo acotado, destino y fecha del servidor.
Evento de transición único por chat/versión; clave de episodio vinculada al evento
HANDOFF. No guardar en la parte visible argumentos de herramientas ni trazas LLM.

### Concurrencia con reservas y jobs

La reserva final y cualquier cambio de control comparten el **mismo bloqueo de
fila de conversación**. Orden compatible con la implementación vigente:
job (si existe) → conversación → outbox. El control humano no bloquea ni actualiza
jobs mientras mantiene el lock de conversación: evitar la inversión
conversación → job que produciría deadlocks con leases. Cancela sólo comandos
PENDING bajo conversación → outbox. Los jobs antiguos se rechazan al reclamar o
reservar, sin ejecutar herramientas comerciales.

Si el bot estaba generando, tomar gana antes de la reserva y el texto automático
se cancela. Si la reserva SENDING ya ganó, tomar impide las siguientes reservas y
registra el claim, pero su `canSend` permanece false hasta resultado conocido.
No se sostiene una transacción SQL durante HTTP. Al expirar un lease de despacho
SENDING se pasa a UNKNOWN; no se interpreta como prueba de que no se envió.

El aviso de derivación se identifica por episodio/propósito, **no por comparar
texto**. Sólo se reserva una vez mientras sigue HANDOFF sin aceptación; se cancela
si el humano tomó antes. No permite otros textos de IA en HANDOFF. Esto también
elimina la dependencia entre los distintos textos por defecto actuales.

## 5. Outbox común e idempotencia

Evolucionar `whatsapp_outbox` sobre la misma tabla:

| Campo/constraint                   | Contrato                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id uuid`                          | Backfill de cada fila, NOT NULL, nueva PK de comando. No recrear/borrar filas.                                                                                                            |
| `source_message_id`                | Conserva FK y unicidad **no parcial**, pasa a nullable. Así siguen funcionando búsquedas y `ON CONFLICT(source_message_id)` de wrappers anteriores; varios NULL son válidos.              |
| `origin`                           | AGENT para outbox existente; HUMAN para comandos manuales. No fabricar inbound para un humano.                                                                                            |
| `integration_id`                   | Backfill desde conversación; FK compuesta tenant/chat/integración para impedir mezclar canales.                                                                                           |
| `actor_user_id`, `control_version` | Actor verificado y versión de aceptación del comando humano. Validación de membresía/permiso al aceptar y despachar. Guardar identidad de auditoría aunque luego se desactive el usuario. |
| `client_request_id uuid NULL`      | UNIQUE(organization_id, client_request_id); obligatorio para HUMAN, nullable para AGENT.                                                                                                  |
| Texto y comparación de solicitud   | Guardar texto normalizado una sola vez y comparar tenant/chat/actor/texto/versión frente a la misma clave. No deduplicar sólo por texto.                                                  |
| Despacho                           | Mantener `lease_token`; añadir vencimiento, `available_at` y contador de intentos del comando humano. Reservar PENDING una sola vez bajo lock; no reutilizar el lease de un job ajeno.    |
| Resultado                          | Mantener PENDING/SENDING/SENT/UNKNOWN/CANCELLED e ID externo. SENT significa aceptación por Meta, no entrega al cliente.                                                                  |

Los wrappers `prepare_whatsapp_outbox`, `recover_whatsapp_outbox` y
`complete_whatsapp_outbox` conservan sus firmas y campos JSON existentes para
AGENT, resolviendo ahora el comando por `source_message_id`. La lógica común de
reserva/finalización opera por `id`. Sólo `service_role` invoca estos wrappers.

El POST manual persiste el comando y devuelve 202 con su ID/estado. El consumidor
del **worker existente** reclama HUMAN PENDING de la outbox; no insertar un
`agent_job` con un inbound ficticio ni montar otro servicio. Antes de reservar
revalida control/version/actor, integración, flags y ventana. El texto, destinatario
y teléfono proveedor vienen del comando y relaciones autorizadas, no del navegador.

El cliente crea una UUID al iniciar un envío y conserva clave+contenido hasta
conocer el resultado, incluidos timeout/reconexión. Repetición exacta devuelve el
mismo comando después de comprobar acceso actual, incluso si ahora cambió el
control. Reutilización con parámetros distintos: 409, sin nuevo comando. Dos
mensajes iguales intencionales usan claves distintas. Error antes de aceptar no
borra borrador; aceptación durable no se anuncia como «entregado».

Compartir el transporte actual de `meta-cloud.ts` desde el worker y retirar el
fetch de la acción. Conservar el tratamiento de rechazo explícito de número
argentino de prueba; ningún fallback de destinatario se aplica a resultados
inciertos. El camino operativo nuevo siempre exige reserva durable; no conserva
un fallback de envío sin lease.

- Timeout, corte de red, 5xx o respuesta exitosa sin ID: UNKNOWN, sin reenvío.
- 429 explícito: reprogramar PENDING con backoff/intentos acotados y revalidación
  completa al próximo intento. Otros rechazos explícitos: terminal, con motivo
  seguro que permita distinguir fallo de cancelación de control en el DTO.
- ID de Meta conocido: reintentar **sólo la persistencia** con el mismo token/ID,
  nunca el POST. Finalización repetida del mismo resultado es idempotente; un ID
  diferente para el mismo comando es conflicto. Una caída antes de persistir ese
  ID puede dejar UNKNOWN; no se promete exactly-once.
- Resolución UNKNOWN: actor con manage registra motivo y evidencia, evento
  DELIVERY_REVIEW y resultado SENT con ID externo conocido o CANCELLED tras
  revisión explícita. Nunca UNKNOWN → PENDING. No confundir cancelación local con
  garantía de que el cliente no recibió el mensaje.

Agregar autor explícito a mensajes salientes: `origin` AGENT/HUMAN/LEGACY y
`sender_user_id` nullable, con pertenencia verificada al insertar y tenant coherente
con la conversación. En entrantes el autor visible es siempre Cliente. Backfill de
salientes sin evidencia verificable: LEGACY/«Equipo», sin inventar vendedores.

### Callbacks y ventana de atención

Persistir hechos de estado del proveedor, deduplicados por ID externo/estado/hora;
si llegan antes del registro saliente quedan pendientes de conciliación. Asociar
al tenant a través de la integración del webhook, no aceptando sólo un ID externo
sin contexto. No exponer el payload de esos hechos. Reducir SENT < DELIVERED < READ
monotónicamente, conservar FAILED como hecho independiente si contradice una
entrega/leído y someter inconsistencia a revisión; no borrar los hechos previos.
El cliente necesita tanto comandos sin burbuja aún como mensajes con aceptación.

La ventana del contrato es de 24 horas desde `last_customer_message_at`. Alimentar
ese máximo sólo con timestamp válido del mensaje real firmado de Meta; no con
salientes, `last_message_at`, apertura, transcripción o simulación. El parser actual
sustituye timestamps inválidos por la hora actual: separar ese fallback visual de
la evidencia que habilita envíos. Timestamp ausente/inválido/futuro no extiende la
ventana. Backfill conservador desde entrantes reales verificables; si no hay
evidencia, bloquear texto libre. No reconstruir la ventana desde `created_at`.

Comprobar límite con hora real del servidor inmediatamente antes de SENDING y
mostrar `replyWindowExpiresAt` en UI. Ventana vencida: rechazo recuperable, preservar
borrador, sin botón de plantillas no implementadas. La reserva reduce carreras,
pero Meta sigue siendo la autoridad sobre aceptación y puede rechazar la petición.

## 6. Lectura, DTOs y sincronización

Ninguna respuesta usa `select('*')` ni serializa filas completas. Nunca retornar
payloads, secretos/referencias de secreto, tokens, leases, `pending_order_action`,
`quote_snapshot`, `commercial_rules`, paths de Storage, tool calls o errores SQL.
Errores públicos: código estable + texto seguro; detalles sólo en logs internos
sin cuerpos de mensajes, credenciales ni trazas completas del modelo.

| DTO                 | Campos públicos permitidos                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ConversationSummary | id, nombre/teléfono autorizado, isSimulator, status, responsable {id,label}, humanClaimedAt, controlVersion, lastActivityAt, preview {tipo,texto acotado,dirección,hora}, unreadCount.                                       |
| ConversationDetail  | summary + motivo de handoff, claim/transición/revisión, replyWindowExpiresAt, capabilities {canRead,canClaim,canSend,canTransfer,canResume,reasonCode}, contexto comercial acotado (pedido y enlaces a preventas paginadas). |
| Message             | id, dirección, tipo, contenido/transcripción, createdAt, providerOccurredAt separado, autor {kind,label}, deliveryStatus y audio {estado público,expiresAt} si está habilitado. Sin objeto de auditoría.                     |
| Command             | id, clientRequestId, texto propio, origen/autor visible, estado, messageId nullable, motivo público seguro y fechas. Sin lease ni datos de transporte.                                                                       |
| Event               | id, tipo, fecha, actor/destino visibles, motivo acotado, versión. Sin metadata arbitraria.                                                                                                                                   |

Rutas bajo `/api/org/[orgSlug]/whatsapp/conversaciones`:

| Método/ruta                          | Entrada y salida                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET colección                        | `q` acotado, filtro all/attention/mine/agent, `mode=live` por defecto, cursor y límite 50 máximo. Devuelve summaries + nextCursor. Sandbox sólo explícito y con su flag. |
| GET /:id                             | Detail, comandos sin resolver y capabilities reales; no basta conocer el UUID.                                                                                           |
| GET /:id/mensajes                    | `before` o `after`, cursor compuesto, límite 50; items en orden ascendente, nextBefore/nextAfter y hasMore. Sin cursores incompatibles.                                  |
| GET /:id/mensajes?ids=…              | Refresco de hasta 50 mensajes visibles, sin combinar con before/after; actualiza estados y transcripciones aunque no haya mensajes nuevos.                               |
| GET /:id/eventos                     | Página separada de eventos internos, mismo orden/cursor; nunca se trata como texto para Meta.                                                                            |
| POST /:id/tomar                      | expectedControlVersion → control actualizado o 409.                                                                                                                      |
| POST /:id/reasignar                  | expectedControlVersion + targetUserId → control o conflicto.                                                                                                             |
| POST /:id/pausar y /devolver         | expectedControlVersion → control; conservan la semántica recurrente.                                                                                                     |
| POST /:id/mensajes                   | clientRequestId, expectedControlVersion, text 1–4000 → Command durable (202 nuevo, 200 repetición).                                                                      |
| POST /:id/lectura                    | messageId perteneciente al chat → cursor personal actualizado monotónicamente.                                                                                           |
| POST /:id/envios/:commandId/resolver | expectedControlVersion, resolución y motivo → Command + evento; sólo operador autorizado.                                                                                |

`whatsapp.read` permite lecturas y avance de lectura propio. `manage` para todas
las demás mutaciones; no asumir que un usuario manage sin read puede abrir el
historial. 401 sin sesión, 403 sin permiso/módulo, 404 para recurso ajeno/inexistente,
409 conflicto/idempotencia/ventana/control, 422 entrada inválida, 503 protocolo no
disponible. Verificar origen/CSRF de mutaciones con cookie. `Cache-Control: private,
no-store`, sin cache de CDN, sin habilitar CORS general.

### Cursores, consultas e indicadores personales

Historial ordenado por `(created_at,id)` del servidor; timestamp Meta sólo
informativo. Cursor validado y vinculado a tenant/chat/dirección de recorrido.
Paginar con predicado de tupla, sin OFFSET. Para evitar saltar un INSERT que estaba
sin commit al emitir un cursor, **todos** los productores (ingesta, finalización y
simulador) deben serializar append sobre la fila de conversación y asignar una
hora de inserción monotónica después de adquirirla. El `now()` actual de comienzo
de transacción y el `sequence_no` identity existente no garantizan orden de commit.
Probar explícitamente una transacción demorada; no prometer recuperación sin huecos
por agregar sólo un ID al cursor. No reescribir timestamps históricos.

Lista por actividad del servidor + ID; actualizar `last_message_at` monotónicamente
sin usarlo para la ventana. Último mensaje mediante LATERAL/index scan LIMIT 1 por
chat de la página, no descargando historiales. Acotar también carritos, preventas y
resolución de nombres. Índices: mensajes `(conversation_id,created_at,id)`, lista
`(organization_id,last_message_at DESC,id DESC)`, pendientes de outbox por estado/
disponibilidad e índice de eventos por chat/fecha/ID. Medir búsqueda y contadores con
EXPLAIN ANALYZE/BUFFERS antes de agregar índices de texto adicionales.

`whatsapp_conversation_reads`: PK `(organization_id,conversation_id,user_id)`, FK
tenant/chat, último message_id con fecha/ID validados contra ese chat. Sólo avanza
el actor autenticado, bajo UPSERT monotónico; no acepta timestamps del navegador.
Unread cuenta INBOUND posteriores a ese cursor. Lectura no acepta handoff ni
cierra alerta de atención. Dos dispositivos del mismo usuario no retroceden lectura.

TanStack Query: claves con organización + sesión + modo + chat; chat activo 3 s,
lista 10 s en constantes del módulo. Sólo pestaña visible/online. Consultar nuevos
mensajes con after y drenar páginas; refrescar IDs de la página visible para
delivery/transcripción, además de control y comandos. Al volver foco/conexión,
recuperar desde cursor y refrescar la primera página de lista. Deduplicar por ID,
actualizar DTO existente, no sumar una burbuja por callback o por Command + Message.

Abandonar organización/sesión cancela requests, elimina queries del módulo y
borradores en memoria. Respuestas tardías de otro scope no se incorporan. No guardar
mensajes o borradores en localStorage/IndexedDB; sin cola de envío offline. Scroll
al paginar se conserva con un ancla; nuevos mensajes sólo desplazan si el usuario
estaba al fondo. Si estaba leyendo atrás, mostrar indicador «Nuevos mensajes».

## 7. Avisos, audio y compatibilidad de operación

El evento HANDOFF es la identidad durable del episodio. En la misma transacción se
insertan notificaciones existentes con enlace
`/org/<slug>/whatsapp/conversaciones?conversationId=<id>` y deduplicación única por
episodio/destinatario. Responsable activo y autorizado como destinatario; si no lo
hay, los miembros habilitados con manage/admin. El esquema de notificaciones debe
reproducirse con su RBAC real en las pruebas futuras: bootstrap actual no lo incluye.
Leer campana no cambia claim ni contador de casos por aceptar. Cada enlace vuelve a
autorizar acceso; una notificación no concede permiso al chat.

Primera entrega: texto saliente; tipos no textuales con rótulo; transcripción y
estado del audio cuando existan. **No habilitar transcripción nueva durante
HANDOFF/PAUSED en este MVP**: preservar el claim ACTIVE actual. Mostrar pendiente
de forma honesta, sin reactivar agente. Antes de cualquier ampliación, separar
transcripción de desbloqueo del job comercial, respetando flags, cuotas y retención.

Playback real es segunda entrega: endpoint nuevo de lectura autenticada con
whatsapp.read, tenant/chat/mensaje, flags de audio, expiración y purged_at; stream
privado o URL firmada breve sólo tras autorización. No reutilizar el verificador
de sesión del simulador ni hacer público el bucket. Sin grabación, archivos
salientes, notas libres ni plantillas en esta entrega.

### Migraciones compatibles y workers anteriores

No escribir ni aplicar migraciones ejecutables en fase 0: el siguiente cambio de
esquema se crea con la CLI disponible y timestamp nuevo, después de concretar las
pruebas de fase 1. La secuencia debe ser:

1. **Expansión aditiva:** campos/constraints/índices/eventos/lecturas; outbox con ID
   independiente, source nullable+UNIQUE, backfills conservadores y wrappers
   compatibles. Prueba sobre instalación vacía, datos actuales, upgrade y rerun del
   bundle. No activar módulos, inferir autores o volver ACTIVE chats humanos.
2. **Cierre de acceso y protocolo humano:** revocar accesos directos y publicar
   RPC nuevas + controles de wrappers antiguos. Declarar protocolo humano 3 sólo
   cuando estén todas las garantías. API/UI en observación sin esa capacidad.
3. **Worker compatible:** nuevas reservas/finalización, consumidor humano y guardas
   finales; misma outbox, misma exclusión por conversación, leases y cuotas.
4. **API y después UI:** acciones existentes delegan al servicio nuevo; nunca dejar
   el POST manual viejo como vía alternativa. Incluir adaptador de simulación que
   no despache Meta. Finalmente alertas y piloto controlado.

Compatibilidad de datos/firmas no equivale a permitir coexistencia operativa sin
límites. Hoy `workerDatabaseReady` exige exactamente 2; el daemon comprueba readiness
al arrancar y **no la revalida en cada claim**. Cambiar sólo el valor a 3 no detiene
un daemon antiguo ya iniciado. Agregar admisión de protocolo en cada nueva reserva
y claim; los claims antiguos deben dejar de admitir trabajo al habilitar humano.
Puede requerirse una RPC claim v3 manteniendo v2 cerrada, no dos workers consumiendo
la misma conversación por caminos distintos.

Antes de activar intervención, detener/drenar consumidores anteriores (incluidos
legacy sin lease y peticiones al endpoint de herramientas), confirmar ausencia de
SENDING/leases activos y revisar UNKNOWN. Los wrappers deben tolerar finalizar un
resultado conocido del protocolo anterior sin habilitar envíos nuevos. No es
seguro activar con workers viejos arbitrarios que ya tengan un HTTP en vuelo.

Reversión: bloquear nuevas intervenciones/despachos de forma controlada y mantener
lectura/revisión; no degradar schema ni devolver control a IA automáticamente.
Conservar outbox, eventos, mensajes y preventas. No volver al POST manual directo.
El despliegue y el piloto no forman parte de esta entrega.

## 8. Mapa de cambios y orden de implementación

| Etapa                 | Archivos/callers que debe alcanzar                                                                                                                                                                                                                  | Verificación de salida                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Control y permisos | Migración nueva; `server/access.ts` y servicio de control en WhatsApp; `set-whatsapp-conversation-automation.action.ts`; ambos handoffs en `commercial-tools.ts`; adaptadores de `simulation.ts`, simulación route y audio; tipos y fixture/bundle. | Claims concurrentes con CAS, transferencia a miembro autorizado, rechazo REST directo/otro tenant/lector, versiones y acciones comerciales anuladas. |
| 2. Envío              | Outbox/migración y wrappers; `send-whatsapp-manual-message.action.ts`; `meta-cloud.ts`, `commercial-agent.ts`, `jobs.ts`, `server.ts`; webhook/parseo/estados; simulación; pruebas unitarias/SQL y `build-whatsapp-release-sql.mjs`.                | Clave estable, ninguna repetición de POST tras aceptación, ventana real, SENDING/UNKNOWN, cierre de caminos sin lease y protocolo.                   |
| 3. Lectura            | `whatsapp-conversations.service.ts`, DTOs/schemas compartidos seguros, rutas nuevas, reads, paginación de contexto y nombres.                                                                                                                       | Consultas acotadas, cursores sin mezcla, estados sin nuevos mensajes, permisos/flags en todos los servicios, EXPLAIN con volumen.                    |
| 4. UI                 | `whatsapp-inbox.tsx`, página existente y hooks Query del módulo; componentes UI y navegación móvil existentes.                                                                                                                                      | URL seleccionable, lista/chat/ficha, permisos, estados reales, borradores/scroll, teclado IME, 390 px y escritorio; no segundo frontend.             |
| 5. Avisos básicos     | Evento/RPC común de handoff, tabla y servicio de notificaciones existentes y navegación de campana.                                                                                                                                                 | Retry sin duplicar alerta, enlace autorizado y lectura independiente del claim. Playback real queda separado.                                        |
| 6. Evidencia y piloto | Fixtures/scripts WhatsApp, docs de operación y pruebas de aceptación de cada etapa.                                                                                                                                                                 | Recorrido completo con mocks/base local; piloto Meta sólo con autorización y entorno real posterior.                                                 |

La creación de destinatarios reutiliza membresía/RBAC de organización; nombres
mediante resolución en servidor acotada a usuarios del tenant. No descargar la
lista global de auth al navegador. Actualizar tests y tipos de todos los callers
identificados al cambiar las firmas; no dejar dos implementaciones manuales.

Carreras a comprobar con dos sesiones/procesos reales, no sólo mocks:

1. Dos claims con misma versión: uno gana; el otro 409 con responsable actual.
2. Generación bloqueada, claim humano, reserva del bot: CANCELLED, cero POST.
3. Reserva SENDING bloqueada en Meta mock, claim humano: transición sin compositor;
   al terminar persiste resultado y habilita sólo al dueño. Timeout → UNKNOWN.
4. Claim/transfer/return frente a enqueue/reserva humana con versión anterior:
   ninguna reserva posterior al cambio; PENDING viejo cancelado.
5. Misma clave manual desde dos requests: un comando/una reserva. Texto distinto
   con misma clave: conflicto. Misma aceptación finalizada dos veces: una burbuja.
6. Fallo de DB después de ID Meta, crash/lease vencido y callback temprano: no repetir
   HTTP; conservar evidencia y resolver explícitamente la incertidumbre.
7. READ → DELIVERED, FAILED tardío y callbacks duplicados: sin degradar ni perder hechos.
8. Pérdida de permiso/flag/ventana tras enqueue y antes de reservar: rechazo.
9. Inbound anterior al return y autorización vieja de pedido recurrente: no actuar.
10. Append demorado mientras se consulta after, empates de timestamp, más de 50
    nuevos y refresh de un audio/estado viejo: sin huecos ni duplicados.

También cubrir sandbox sin tráfico Meta, audio sin acción comercial durante humano,
no leído por persona, datos limpiados al cambiar sesión/org, offline sin enqueue y
ausencia de payload/secrets en respuestas. Estas son pruebas pendientes del producto
nuevo, no resultados de la fase 0.

## 9. Evidencia ejecutada el 6 de noviembre

| Ejecución                                                                                                                                        | Resultado real                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Diff/status y búsqueda de instrucciones                                                                                                          | Checkout y comparación de sección 1; sin AGENTS encontrados.                                                        |
| PostgreSQL 17 local UTF-8 + bootstrap + bundle completo dos veces                                                                                | OK; rerun después de pedidos y conversión concurrente también OK.                                                   |
| `psql ... -f scripts/fixtures/whatsapp/module-gates.sql`                                                                                         | OK: flags opt-in, aislamiento, deduplicación y bloqueo de consumo deshabilitado.                                    |
| `psql ... -f scripts/fixtures/whatsapp/recurring-orders.sql`                                                                                     | OK en UTF-8: pedidos múltiples, confirmación, rollback, versiones y rechazo de fuente/tenant/integración inválidos. |
| `run_whatsapp_concurrency_test()` en dos sesiones + conteos posteriores                                                                          | OK: una preventa y sus items, sin duplicados. Es carrera de conversión existente, **no** de claims humanos futuros. |
| Nueva `human-inbox-baseline.sql`                                                                                                                 | OK: 26 RPC restringidas, aislamiento, estructura outbox y reproducción de las brechas de tablas/estados.            |
| `audio.sql`, recuperación de lease sin vencimiento, re-aplicación de audio review y `audio-review.sql` en otra base UTF-8                        | OK: leases, cuotas, incertidumbre, exclusión, permisos y regresiones existentes.                                    |
| Cuatro sesiones simultáneas `claim_whatsapp_job_v2` y asserts del script de audio                                                                | OK: cuatro trabajos, ninguna conversación superpuesta, dos organizaciones.                                          |
| `node_modules/.bin/vitest run src/modules/whatsapp 'src/app/api/internal/whatsapp-agent/tools/[tool]/route.test.ts' services/whatsapp-agent/src` | 17 archivos y 177 pruebas OK tras instalar dependencias del servicio.                                               |
| `services/whatsapp-agent/node_modules/.bin/vitest run --root services/whatsapp-agent`                                                            | 8 archivos y 78 pruebas OK. Se superpone con la ejecución anterior: no sumar como 255 pruebas distintas.            |
| `services/whatsapp-agent/node_modules/.bin/tsc --project services/whatsapp-agent/tsconfig.json --noEmit`                                         | OK.                                                                                                                 |
| Mismo `tsc --project ...` sin `--noEmit`                                                                                                         | Build del worker OK; salida en dist ignorado.                                                                       |

Incidencias de entorno resueltas, sin ocultar intentos fallidos:

- Docker instalado, daemon no iniciado. No se ejecutaron los wrappers Docker
  `test-whatsapp-db.sh`/`test-whatsapp-audio-db.sh` completos. Se ejecutaron sus
  fixtures/consultas indicadas con psql y PostgreSQL nativo; no el escenario de
  backfill legacy/corrupción de datos del primer wrapper.
- La primera base descartable fue SQL_ASCII y rechazó «sí» en la fixture recurrente
  (`translate` producía «sa»). Se confirmó encoding/expresión, se recrearon las bases
  de validación en UTF-8 y pasó la fixture sin editarla. No fue un fallo atribuido
  al producto ni se cambió una validación comercial para hacerlo pasar.
- `pnpm exec` raíz intentó actualizar node_modules y abortó por ausencia de TTY.
  Se usaron los binarios instalados directamente. Primer Vitest: 166 pruebas OK y
  dos suites no cargaron por falta de `music-metadata` en el servicio.
- `pnpm --dir services/whatsapp-agent --ignore-workspace install --frozen-lockfile
--ignore-scripts` instaló las dependencias existentes. Ningún package/lock cambió.
  La repetición de Vitest, typecheck y build tuvo los resultados de la tabla.

Reproducción mínima del diagnóstico nuevo (PostgreSQL nativo instalado, `initdb`,
`pg_ctl` y `psql` en PATH; siempre base descartable, sin variables de conexión remota):

```sh
set -eu
task_pg_dir=$(mktemp -d /tmp/rhino-whatsapp-baseline.XXXXXX)
trap 'pg_ctl -D "$task_pg_dir/data" -m fast -w stop >/dev/null' EXIT
initdb -D "$task_pg_dir/data" -U postgres --auth=trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "$task_pg_dir/data" -l "$task_pg_dir/server.log" \
  -o "-k $task_pg_dir -h '' -p 55491" -w start
export PGHOST="$task_pg_dir" PGPORT=55491 PGUSER=postgres PGDATABASE=postgres
unset PGSERVICE PGSERVICEFILE PGOPTIONS
psql -XqAt -v ON_ERROR_STOP=1 -f scripts/fixtures/whatsapp/bootstrap.sql
node scripts/build-whatsapp-release-sql.mjs > "$task_pg_dir/release.sql"
psql -XqAt -v ON_ERROR_STOP=1 -f "$task_pg_dir/release.sql"
psql -XqAt -v ON_ERROR_STOP=1 -f "$task_pg_dir/release.sql"
psql -XqAt -v ON_ERROR_STOP=1 -f scripts/fixtures/whatsapp/human-inbox-baseline.sql
```

El proceso escucha sólo por socket dentro del directorio privado creado, sin TCP;
la fixture revierte su transacción. Para gates/recurrentes usar esos archivos en
esa base; para audio usar otra base vacía con bootstrap+bundle. La ejecución de esta
fase usó los binarios de `/opt/homebrew/opt/postgresql@17/bin` y bases explícitas
`whatsapp_bundle_utf8`/`whatsapp_audio_utf8` en un cluster temporal equivalente.

La nueva fixture se repitió con éxito y se comprobó que sus organizaciones de
prueba no quedaron persistidas. El cluster local se detuvo al terminar. Pasaron
`git diff --check`, una comprobación explícita de whitespace de los dos archivos
nuevos y `prettier --check` del documento.

No se ejecutaron build/typecheck/lint globales del ERP, navegador/390 px, carga con
volumen representativo, prueba REST con PostgREST, RBAC completo, ni Meta/LLM reales.
No hay implementación nueva de control, envío humano durable o UI que pueda
declararse validada end-to-end. No se inspeccionó el despliegue ni el esquema remoto.

Como referencia de permisos, se contrastaron las guías oficiales de
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y
[grants + Data API](https://supabase.com/docs/guides/api/securing-your-api), además
del changelog vigente. La evidencia de este informe proviene de SQL y código
locales, no de asumir que esas guías describen un despliegue concreto.

## Bandeja operativa en el checkout actual

Al inicio del trabajo, `HEAD` era `0834ae1205ca8977dbc8b93ed5677ed8feadefa4`,
descendiente de `40bf0a2b965dd231bdb433864fe467c679620781`. El commit incorporó
control versionado, asignación, aceptación, auditoría y cierres de acceso
directo. El árbol local ya incluía la outbox humana persistente, recuperación
de estados de Meta, ventana de 24 h y consumidor del mismo worker. La bandeja
usa esos contratos y reemplaza la consulta anterior, que limitaba el listado a
100 conversaciones y descargaba sus mensajes para elegir las vistas previas.

- `src/app/api/org/[orgSlug]/whatsapp/conversaciones` sirve lista, detalle,
  historial y reproducción. El POST del detalle registra lectura personal.
  Toma, pausa, transferencia, devolución, texto y revisión usan las acciones
  existentes con versión de control. La lista separa simulaciones y acota cada
  página a 30 conversaciones. El historial ordena mensajes y eventos en
  páginas de 50. Los no leídos se muestran hasta 99+ y el contador de
  derivaciones sigue el estado de control.
- `src/modules/whatsapp/inbox-contract.ts` y `server/inbox.ts` validan entradas
  y salidas explícitas. Cada operación deriva organización y actor de la sesión
  y la consulta revalida membresía, permiso y flags. El audio sale por el ERP
  desde el bucket privado, con expiración, sin URL firmada en la respuesta y
  con `Cache-Control: private, no-store`. No se alteró la política offline.
- `src/components/whatsapp/whatsapp-*.tsx` presenta lista, historial, ficha
  lateral y compositor en la misma ruta con enlace `?chat=<uuid>`. Conserva el
  borrador y la clave de un intento incierto en memoria por chat. La aceptación
  se muestra como comando pendiente hasta que el worker registre el resultado.
  Los cambios de tamaño conservan el final del chat si el operador estaba al
  día. La lista consulta cada 10 s, y el detalle y la ventana de 50 eventos y
  mensajes cada 3 s con pestaña visible. Un hueco se recupera por cursor hacia
  adelante. Las páginas antiguas cargadas se actualizan al volver al foco,
  reconectar o invalidar tras una acción.
- `20261107185748_whatsapp_human_inbox.sql` agrega lecturas personales,
  índices, funciones de lectura y un reloj de sincronización por conversación.
  Conserva la fecha original para mostrarla y la usa como cursor para datos
  históricos. Los nuevos elementos se ordenan con un timestamp asignado bajo
  el lock de conversación, para que un insert tardío con una fecha de proveedor
  anterior quede visible en la recuperación incremental.
- Un evento nuevo de derivación real inserta el aviso de campana en su misma
  transacción. Si el destinatario asignado puede leer y gestionar, recibe el
  aviso. En caso contrario se avisa a los operadores con ambos permisos. La
  deduplicación se apoya en la unicidad del evento por conversación y origen.
  Leer un aviso usa la sesión y verifica su propietario. La creación genérica
  de avisos queda disponible para el rol de servicio que usan los pedidos. Los eventos históricos
  siguen en el historial sin generar avisos retroactivos.

### Validación local

- `WHATSAPP_PG_BIN=/opt/homebrew/opt/postgresql@17/bin bash scripts/test-whatsapp-human-control.sh`.
  PostgreSQL 17 descartable con socket privado. Pasaron actualización con datos
  y reaplicación, grants efectivos, carreras de dos sesiones, pedido recurrente,
  flags y audio. La fixture de bandeja usa 750 conversaciones y 2.500 mensajes
  generados. Valida cursores, lectura monotónica por persona, aislamiento,
  alertas deduplicadas y audio con flag y expiración. También recorre derivación,
  toma, reserva, aceptación simulada, callbacks tempranos y fuera de orden,
  devolución a la IA y nuevo entrante. `EXPLAIN (ANALYZE, BUFFERS)` usó los
  índices de cursor para las consultas de listado e historial de la fixture.
- `node_modules/.bin/vitest run src/modules/whatsapp src/components/whatsapp
services/whatsapp-agent/src 'src/app/api/internal/whatsapp-agent/tools/[tool]/route.test.ts'`.
  243 pruebas en 21 archivos.
- `node_modules/.bin/biome check .`, `git diff --check` y `bash -n` de los
  dos runners SQL. Typecheck y emisión del worker con su `tsconfig.json`.
- Build de Next con el lockfile instalado en una copia temporal, variables
  ficticias apuntando a localhost y `NODE_OPTIONS=--max-old-space-size=8192`.
  El build incluye la comprobación de tipos de Next. El contador de usuarios
  de la página pública registró un rechazo de conexión a localhost durante
  la generación estática y el build terminó con código 0.
- Chromium con la UI del repo y respuestas/actions simuladas en localhost.
  Escritorio de 1.440 px, móvil de 390 px y reducción de viewport que emula la
  altura disponible con teclado. Se comprobó el enlace directo, el borrador,
  el envío bloqueado hasta tomar, el reintento con la misma clave, la devolución,
  el scroll al cargar y al recibir, los cambios de estado sin mensajes nuevos,
  la ficha y la desconexión/reconexión.

### Compatibilidad y piloto

El bundle requiere el esquema previo de notificaciones del ERP y conserva las
firmas de jobs y outbox v2. Antes de habilitar intervención en un piloto, verificar
la migración, el consumidor humano y el webhook de estados. La UI verifica el
protocolo de la outbox. La disponibilidad del consumidor se comprueba mediante
sus logs y el avance de comandos; los pendientes quedan durables si el worker no
está consumiendo. Coordinar el cambio de la campana con el servidor actualizado
que usa la sesión del usuario.

Para el piloto, usar un número/cliente de prueba, revisar que el aviso llegue al
operador, tomar el chat, enviar dentro de la ventana, comprobar el callback y
devolver el control antes de enviar un nuevo mensaje desde el teléfono. Si hay
que revertir, detener nuevas intervenciones y preservar comandos, eventos y
claims para resolver los estados inciertos antes de reactivar. Los comandos ya
reservados pueden completar su envío.

El pipeline de audio conserva sus reglas actuales: la bandeja muestra y
reproduce los audios disponibles. La transcripción sigue sujeta a que el
worker pueda reclamar el trabajo, con la conversación activa. No se agregaron
plantillas, medios salientes ni suscripciones Realtime. El historial reciente
se sondea y la campana conserva su intervalo existente. Queda pendiente el
piloto con Meta/LLM y Auth/PostgREST reales y el teclado de un teléfono físico.
Docker no estaba activo. `supabase db advisors --type security` no pudo conectar
al stack local; las comprobaciones de grants corrieron en PostgreSQL nativo.

### Validación desde la aplicación principal

El commit `75fccbc2` ya montaba la bandeja en el layout autenticado. La
vista de prueba anterior montaba los componentes en un servidor separado
con respuestas simuladas. Para comprobar el recorrido real se inició
Rhinos con Next en `http://127.0.0.1:4319`, GoTrue, PostgREST y un PostgreSQL
17 descartable con el bundle de WhatsApp. Se sembraron organizaciones,
roles, clientes y mensajes ficticios. El menú ahora muestra **Conversaciones
de WhatsApp** junto a **Simulador WhatsApp** con sus flags independientes.

La primera navegación real encontró un HTTP 503 en el listado. El handler
de Next no disponía del contexto de `cookies()`. Los endpoints de la bandeja
leen la sesión desde el `NextRequest` y usan ese cliente de usuario también
para buscar la organización y verificar el permiso. El proxy conserva el
refresco de la sesión. Las acciones de atención siguen haciendo la
validación en el servidor y la base conserva sus controles de organización.

Se inició sesión desde el formulario de Rhinos y se entró haciendo clic en
el menú de `/org/rhino-pruebas`. En `/org/rhino-pruebas/whatsapp/conversaciones`,
el operador cargó el historial, tomó la conversación, envió un texto y
devolvió el control. El consumidor real de la outbox recibió un ID de Graph
simulado. Un callback firmado al webhook local actualizó la burbuja a
`Entregado`. Una segunda sesión con sólo `whatsapp.read` pudo leer el
historial. El servidor rechazó toma, envío y devolución al repetir las
solicitudes de las Server Actions con la sesión lectora y respondió 403 al
pedir el detalle de un chat de otra organización.

También se abrió la ruta del simulador desde el menú. En una organización
con sólo el flag de sandbox apareció únicamente esa entrada. La consulta de
capacidades de audio del simulador devolvió 500 en el entorno local. La
validación del simulador cubrió navegación y flags, y queda pendiente probar
su ejecución de audio y LLM. Queda pendiente usar un número real de prueba
con Meta Cloud, incluidas las credenciales, la entrega y los callbacks del
proveedor. La validación se hizo en localhost.

### Autorización del envío humano antes de Meta

El checkout `2d381780`, comparado con `40bf0a2`, ya incluía la bandeja, el
control versionado, las alertas y la outbox común. También validaba el
vencimiento de la ventana entre la reserva humana y el HTTP. En ese tramo
todavía podía cambiar el vendedor responsable o su permiso, y un canal
deshabilitado podía dejar un envío sin confirmar aunque no se hubiera
contactado a Meta.

La migración `20261110005932_whatsapp_human_dispatch_guard.sql` agrega RPC
exclusivas del rol de servicio. El worker vuelve a verificar el lease, el canal y destinatario
reservados, el permiso del vendedor, la versión de control y la ventana con
el mismo bloqueo de conversación que usa una transferencia. La consulta
termina antes de cada POST, incluido el fallback ante el rechazo explícito
del número de prueba. Si detecta una revocación o vencimiento, cancela el
comando con el motivo correspondiente. Los resultados ambiguos de Meta
siguen usando `UNKNOWN`.

El detalle de la bandeja y la acción de envío consultan `whatsapp_guarded_dispatch_ready`
antes de habilitar o aceptar envíos humanos nuevos. La comprobación también protege
la reserva nueva y verifica las firmas y permisos de las RPC. Si falta la migración
o los grants son incorrectos, el historial sigue disponible y el compositor indica
que el envío humano está deshabilitado. La revisión de comandos previos conserva
el protocolo anterior. Esta capacidad describe el esquema y sus permisos.

Instalar la migración antes de actualizar el worker. El consumidor nuevo
sólo reserva por la RPC nueva. Las firmas de jobs, reserva y finalización
anteriores siguen disponibles, por lo que un worker viejo puede seguir
operando con su comportamiento previo. La nueva garantía se aplica cuando
todos los consumidores humanos usan la comprobación nueva. Un cambio de
control posterior a esa comprobación puede coincidir con un POST en curso.

Validación local de este cambio:

- `WHATSAPP_PG_BIN=/opt/homebrew/opt/postgresql@17/bin bash scripts/test-whatsapp-human-control.sh`:
  aprobó reaplicación con datos, permisos, pedido recurrente, flags y audio.
  Dos sesiones verificaron que la comprobación espera el lock de transferencia
  y cancela el comando con `CONTROL_CONFLICT` al ver la versión nueva.
  Un grant incorrecto bloqueó la reserva nueva y dejó el comando pendiente.
- Vitest del módulo, componentes, worker y endpoint interno: 255 pruebas en
  21 archivos, con Meta simulado. Incluye cancelación antes del primer POST,
  revocación y autorización antes del fallback, y bloqueo de envíos nuevos
  con la migración ausente mientras el detalle sigue disponible.
- Biome del repositorio, sintaxis del runner, typecheck y build del worker
  aprobados.
- Build de Next con chequeo de tipos aprobado en una copia temporal, usando
  `node scripts/clean-next-build.mjs && node_modules/.bin/next build` con
  credenciales ficticias y Supabase apuntando a localhost. El contador de
  usuarios de la página pública registró un error de conexión esperado y el
  build terminó con código 0.
