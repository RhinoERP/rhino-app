# WhatsApp: envío persistente común — fase 2

7 de noviembre de 2026. El alcance confirmado es **fase 2**.
Se implementa sobre el proveedor, frontend, server actions y worker existentes.
No se aplicaron migraciones remotas, no se enviaron mensajes reales ni se desplegó.
Los prompts de fases posteriores del documento adjunto siguen siendo propuestas.

## Comparación y decisiones antes de editar

- Referencia del plan adjunto: `40bf0a2b965dd231bdb433864fe467c679620781`.
- Checkout inicial limpio: `0834ae1205ca8977dbc8b93ed5677ed8feadefa4`.
- Diferencia inicial: 116 archivos, 6989 inserciones y 1144 eliminaciones; incluye
  cambios ajenos a WhatsApp que no se reemplazan.
- Ya estaban implementadas fases 0–1: contrato, aceptación humana separada de
  asignación, versiones, eventos, transferencia/pausa/devolución, permisos directos
  cerrados y bloqueo común con la reserva del agente. El envío manual estaba
  deshabilitado. Se reutiliza esa base, sin recrear su lógica de control.
- No se encontraron `AGENTS.md` en el repositorio ni sus antecesores inspeccionados.
- Diferencia material con la propuesta: se mantiene la server action existente
  como entrada de aceptación durable, en lugar de agregar ahora un REST paralelo.
  Devuelve comando/estado, nunca una afirmación prematura de entrega. La revisión
  usa otra action sobre el mismo servicio y autorización. La UI completa, sus
  handlers de lectura y compositor pertenecen a las siguientes fases.

## Contrato implementado

`sendWhatsAppManualMessageAction` exige `orgSlug`, `conversationId`,
`expectedControlVersion`, `clientRequestId` UUID estable y `text` (1–4000).
Obtiene organización y actor desde la sesión y el RBAC existente; ignora IDs de
actor/tenant y campos internos enviados por el navegador. El esquema instalado
se verifica antes de aceptar operaciones.

La acción devuelve `{success, replayed?, command?, code?, error?}`. El comando
público contiene únicamente ID, clave de solicitud, estado, motivo público,
ID del mensaje local y fechas. No contiene texto interno, payload, lease,
configuración del proveedor, secretos ni referencias de secretos.

La RPC de aceptación serializa la clave por organización y bloquea conversación:

- Membresía activa y `whatsapp.manage`/administración según el ERP.
- Integración real ACTIVE y módulo habilitado; sandbox nunca entra a Meta.
- HANDOFF efectivamente aceptado por el actor, con la versión esperada.
- Ausencia de SENDING/UNKNOWN y ventana vigente al aceptar.
- La misma organización/clave/chat/actor/versión/texto normalizado devuelve el
  mismo comando, incluso tras un cambio de control si conserva acceso actual.
  Otro contenido o contexto produce `IDEMPOTENCY_CONFLICT`. Dos textos iguales
  intencionales con claves distintas son comandos distintos.

No se fabrican entrantes ni jobs comerciales para enviar mensajes humanos.
`source_message_id` conserva FK y UNIQUE no parcial para los wrappers anteriores,
pero permite NULL. `id` es la PK propia de la misma outbox. Se incorporan canal,
actor, origen, versión, clave, lease con vencimiento, disponibilidad, intentos y
motivo. La FK compuesta impide mezclar organización, conversación e integración.
Un ID externo tampoco puede finalizar dos comandos diferentes.

## Despacho y fallos

El proceso existente agrega un consumidor de outbox humana en roles `all` y
`commercial`. No utiliza el modelo ni demora comercial para redactar un mensaje
humano; comparte transporte y finalización con el agente. El arranque conserva
los requisitos de configuración del servicio comercial existente.

`claim_whatsapp_human_outbox` bloquea conversación → comando, revalida permiso,
asignado/aceptación/versión, integración, flags y ventana inmediatamente antes de
SENDING, y entrega un lease de 60 segundos. Dos consumidores no pueden reservar el
mismo comando. Los chats con comandos bloqueados se excluyen de los candidatos
pendientes para evitar que oculten otros chats elegibles. Se inspeccionan hasta
50 conversaciones por llamada.

Toma/pausa/transferencia/devolución conservan el bloqueo de conversación y cancelan
PENDING; no cancelan HTTP ya reservado. La devolución sigue bloqueada por envíos
sin resolver, conserva pedidos/carrito/preventas y usa `automation_resumed_at`.
No se mantiene una transacción durante HTTP. El agente conserva sus firmas v2;
la reserva ahora también aplica la ventana real y reconoce comandos humanos en
la detección de otros envíos sin resolver.

- Timeout, red, 5xx o respuesta exitosa sin ID → UNKNOWN, sin reenvío automático.
- Rechazo 429 explícito → PENDING con backoff y hasta cinco reservas humanas;
  cada nuevo intento revalida todo. Al agotarlas queda CANCELLED.
- Otros rechazos explícitos → CANCELLED. El fallback argentino sin el `9` sólo
  se conserva para el rechazo explícito 131030, nunca ante incertidumbre.
- Con ID conocido se reintenta hasta tres veces **sólo persistir**, incluso si
  se perdió el acuse de una transacción ya confirmada. La finalización SENT es
  idempotente para el mismo ID y rechaza un ID distinto.
- Si la escritura sigue fallando o muere el proceso, la reserva no vuelve a la
  cola. Al vencer pasa a UNKNOWN, incluso si el chat quedó en manos de un vendedor
  y el job de IA ya no se puede reclamar. El worker comprueba el vencimiento antes
  de cada POST. Una reserva sin POST cuya autorización posterior falle también
  queda pendiente de revisión.
- La ruta de transporte sin job/lease/outbox fue retirada. La reserva de agente
  se verifica contra canal, conversación y mensaje antes del POST.

`reviewWhatsAppDeliveryAction` exige versión actual, motivo explícito y SENT con
ID conocido o CANCELLED tras revisión. Nunca ofrece UNKNOWN → PENDING. La revisión
actualiza la versión, invalida confirmaciones comerciales/comandos pendientes y
registra DELIVERY_REVIEW con actor y comando. Es aplicable tanto a IA como a humano.
Cancelar localmente no prueba que el cliente no haya recibido el mensaje.

## Ventana, autores y callbacks

`last_customer_message_at` avanza por máximo sólo para entrantes de integración
real con ID de payload coincidente y timestamp numérico positivo, válido y no
futuro de Meta. El backfill usa esa misma evidencia; sin evidencia se bloquea texto
libre. No se usa `created_at`, salida, transcripción o fallback visual del parser.
El límite de 24 horas se aplica también en la reserva de IA real. Simulaciones no
amplían esa ventana y continúan por su circuito actual.

Mensajes nuevos finalizados por outbox registran AGENT o HUMAN; los humanos llevan
su actor verificado. La validación de autor se apoya en el comando duradero, por
lo que desactivar/quitar su membresía después de reservar no impide registrar un
resultado ya aceptado. Los mensajes históricos sin autor verificable conservan
LEGACY; no se inventan vendedores.

El webhook firmado pasa el número de integración a una RPC de estados acotada.
Los hechos de entrega se guardan por integración/organización/ID/estado/hora, aun
si todavía no existe la salida. Callback y registro del mensaje serializan por
integración/ID; se concilian los hechos al insertar. READ no baja a DELIVERED ni
FAILED; se retienen los hechos contradictorios de fallo sin borrar la entrega.
No se guardan payloads de callback en los nuevos hechos ni se exponen al navegador.
La firma anterior sigue conciliando mensajes conocidos; callbacks tempranos
requieren el webhook actualizado para aportar contexto de integración.

## Archivos y alcance

| Archivo                                                               | Cambio                                                                                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261106205901_whatsapp_human_outbox.sql`        | Esquema aditivo, aceptación/reserva/finalización/revisión, autores, ventana, hechos y grants. Creado con `supabase migration new`. |
| `scripts/build-whatsapp-release-sql.mjs`                              | Incluye la migración nueva al final del bundle compatible.                                                                         |
| `services/whatsapp-agent/src/meta-cloud.ts`                           | Transporte compartido durable y recuperación de persistencia sin repetir POST.                                                     |
| `services/whatsapp-agent/src/server.ts`                               | Consumidor humano en el mismo worker.                                                                                              |
| `src/modules/whatsapp/server/human-outbox.ts`                         | Autorización, esquemas de entrada y DTOs públicos.                                                                                 |
| `src/modules/whatsapp/actions/send-whatsapp-manual-message.action.ts` | Acepta comandos persistentes en lugar del stub previo.                                                                             |
| `src/modules/whatsapp/actions/review-whatsapp-delivery.action.ts`     | Revisión explícita autorizada y auditada.                                                                                          |
| `src/modules/whatsapp/server/meta-webhook.ts`                         | Scope de integración para estados y fallback visual seguro de timestamp.                                                           |
| `src/app/api/webhooks/whatsapp/route.ts`                              | Persistencia de callbacks acotada a integración.                                                                                   |
| `src/components/whatsapp/whatsapp-inbox.tsx`                          | Sólo texto aclaratorio: el compositor de esta pantalla sigue pendiente.                                                            |
| `services/whatsapp-agent/src/meta-cloud.test.ts`                      | Reserva, incertidumbre, rechazo, recuperación de escritura y despacho humano con Meta mockeado.                                    |
| `src/modules/whatsapp/server/conversation-control.test.ts`            | Sesión/RBAC, actions, conflictos, revisión, protocolo y DTOs sin campos internos.                                                  |
| `src/modules/whatsapp/server/meta-webhook.test.ts`                    | Scope y timestamps inválidos/futuros.                                                                                              |
| `scripts/fixtures/whatsapp/human-outbox.sql`                          | Aceptación SQL, permisos directos, ventana, control, idempotencia, leases, revisión y callbacks.                                   |
| `scripts/test-whatsapp-human-control.sh`                              | Integra fase 2 y agrega carreras reales entre dos conexiones de backend.                                                           |
| `scripts/fixtures/whatsapp/human-control.sql`, `audio-review.sql`     | Evidencia válida de Meta en fixtures que reservan envíos reales; siguen funcionando con el esquema anterior.                       |
| `docs/whatsapp-human-inbox-plan.md`, `whatsapp-human-control.md`      | Enlace a esta continuación, conservando evidencia histórica.                                                                       |

No cambia dependencias, flags, PWA/offline, política de retención, transcripción
HANDOFF/PAUSED ni lógica comercial de pedidos recurrentes. Los tipos generados
existentes no incluyen tablas WhatsApp; se mantiene el cliente de servidor del
módulo y se valida el contrato público con Zod.

## Validación local ejecutada

```sh
WHATSAPP_PG_BIN=/opt/homebrew/opt/postgresql@17/bin \
  scripts/test-whatsapp-human-control.sh
node_modules/.bin/vitest run src/modules/whatsapp services/whatsapp-agent/src \
  'src/app/api/internal/whatsapp-agent/tools/[tool]/route.test.ts'
services/whatsapp-agent/node_modules/.bin/tsc \
  --project services/whatsapp-agent/tsconfig.json --noEmit
services/whatsapp-agent/node_modules/.bin/tsc \
  --project services/whatsapp-agent/tsconfig.json
NODE_OPTIONS=--max-old-space-size=8192 \
  node_modules/.bin/tsc --noEmit --incremental false
```

- SQL: PostgreSQL 17 local descartable, socket privado sin TCP ni URLs del proyecto.
  Pasaron upgrade desde esquema anterior, aplicaciones repetidas del bundle con
  datos, control/tenant/RBAC/flags, doble aceptación con una clave, reserva exclusiva,
  ambas precedencias de toma/reserva, resultado posterior a pausa, revisión auditada,
  expiración/revocación antes de despachar y callbacks tempranos/duplicados/fuera de
  orden. También pasaron la recuperación de una reserva de IA huérfana bajo toma
  humana, gates, pedido recurrente, audio y audio-review. Los logs SQL quedaron
  en `/tmp/rhino-human-control.cLZsud` y el cluster se detuvo al finalizar.
- Vitest: **19 archivos, 237 pruebas OK**. Meta/LLM mockeados; no envíos reales.
- Typecheck y build del worker: **OK**.
- Biome sobre los archivos JS/TS/TSX modificados: **OK**.
- Typecheck global: **184 diagnósticos**, iguales a `HEAD` sin cambios en una
  extracción temporal con las mismas dependencias y tipos `.next`. Ninguno nuevo
  en WhatsApp. Faltan dependencias de Accounting/Sentry/Serwist/idb y existe una ruta
  ausente referenciada por validadores de Next.
- `bash -n`, `git diff --check` y el formato de documentación pasaron.
- `supabase db advisors --type security` intentó conectarse al stack local en
  `127.0.0.1:54322` y recibió `ECONNREFUSED`. La suite nativa sí comprobó los
  privilegios efectivos de las tablas y RPC nuevas.

La reconstrucción SQL es focalizada: reproduce tablas WhatsApp y un modelo mínimo
RBAC con los grants por defecto de Supabase. No es el esquema integral del ERP ni
incluye Auth/PostgREST. Las carreras usan dos conexiones PostgreSQL; la identidad
HTTP se verifica en los tests de actions. No confundir esto con un piloto real.

## Compatibilidad y límites operativos

La migración preserva filas y signatures v2 de outbox/jobs. El protocolo de audio/
agente sigue siendo 2; la extensión humana acredita por separado versión 1 y no
consume comandos si falta o hay grants inseguros. Workers v2 pueden continuar IA
sobre el esquema nuevo, pero no despachan humanos. Los consumidores nuevos deben
instalarse antes de habilitar un compositor que acepte intervención operativa.

Orden preparado para revisión, sin ejecutarlo: migración/bundle → worker y webhook
actualizados → servidor/actions → UI de fases posteriores. No usar aplicaciones
previas al control humano con POST manual directo ni workers anteriores a leases.
El webhook anterior no puede recuperar callbacks tempranos sin scope. Un despliegue
parcial puede dejar comandos PENDING duraderos hasta actualizar el consumidor.

La reversión detiene nuevas aceptaciones/consumidores y conserva tablas, comandos,
eventos y claims. No restaurar el POST directo ni policies amplias, no borrar
UNKNOWN, no reactivar chats humanos automáticamente. Los HTTP ya reservados pueden
terminar después de tomar/pausar: no hay garantía de cero mensajes tardíos ni de
entrega exactamente una vez.

Pendiente por alcance: nueva bandeja/compositor/revisión visual, polling, lectura
personal, paginación, alertas y playback. No se ejecutaron navegador/390 px,
Auth/PostgREST real, Meta/LLM reales, piloto end-to-end ni build global de Next
(con dependencias faltantes y typecheck global fallido). `pnpm test` raíz no se usó
como prueba funcional: sólo ejecuta lint. No se consultaron bases remotas.
