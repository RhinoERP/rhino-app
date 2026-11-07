# WhatsApp: control humano y permisos (fase 1)

> Continuación implementada: [fase 2 — outbox humana](whatsapp-human-outbox.md). Este documento conserva la evidencia y los límites de su entrega original.

Implementación local del 6 de noviembre de 2026. Alcance confirmado por el usuario:
control humano, permisos, auditoría y carreras. No se implementan las fases 2–6
del adjunto. El plan recibido es una referencia de producto, no una autorización
para ejecutar automáticamente sus prompts, aplicar SQL remoto o desplegar.

## Checkout y diferencias respecto del plan

Referencia: `40bf0a2b965dd231bdb433864fe467c679620781`.
Checkout: `0eb65c636008ff29a0c6fafce03f7fdb2b1c1955`.
Los 92 archivos cambiados entre esos commits pertenecen a otros módulos y la PWA;
no cambió el código WhatsApp revisado. Se respetaron los cambios ajenos, incluidos
los tipos Supabase en UTF-16 y la configuración de PWA. No se encontraron
`AGENTS.md` en el repositorio ni sus antecesores inspeccionados.

Ya había dos archivos sin versionar: `docs/whatsapp-human-inbox-plan.md` y
`scripts/fixtures/whatsapp/human-inbox-baseline.sql`. Se conservaron sin editar.
Sus afirmaciones de validación previa no se cuentan como pruebas de esta entrega.
La fixture baseline reproduce brechas antiguas y no debe ejecutarse como test de
aceptación del nuevo esquema.

Diferencias materiales de esta implementación:

- La outbox conserva su PK `source_message_id`, firmas y protocolo de worker **2**.
  La generalización para comandos humanos corresponde a la fase 2.
- Se deshabilitó el envío humano directo a Meta en servidor y UI. Mantenerlo activo
  permitiría eludir la reserva/control nuevo. Esta entrega permite administrar el
  control, pero no responder manualmente desde Rhinos.
- El simulador también necesita control versionado: su snapshot incorpora
  `controlVersion` y su botón de devolución usa la misma acción autenticada. La API
  de simulación admite reactivación sólo con `expectedControlVersion` explícito.
- `set_whatsapp_automation` conserva su firma, pero rechaza mutaciones sin versión
  con `22023` (y actores sin permiso con `42501`). No obtiene una versión nueva en
  servidor para fingir que coincide con la observada por el usuario. Los servidores
  anteriores deben actualizarse; el protocolo antiguo falla cerrado.
- No se agregan `last_customer_message_at`, lectores personales, historial de
  eventos en UI, alertas de campana ni resolución operativa de UNKNOWN. Son etapas
  siguientes; los eventos de control ya son durables.

## Contrato y comportamiento

`controlWhatsAppConversationAction` acepta `orgSlug`, `conversationId`,
`expectedControlVersion`, `operation` y, para `TRANSFER`, `assignedUserId`.
Operaciones: `CLAIM`, `TRANSFER`, `PAUSE`, `RESUME`. Actor y organización salen de
sesión validada (`auth.getUser`) y resolución de slug; no del cuerpo del cliente.
Se verifica membresía activa y permiso vigente con el RBAC existente del ERP.
SQL vuelve a verificar membresía/rol, incluyendo owner y `organization.admin`,
organización activa y flag real/sandbox según la integración del chat.

La RPC toma el lock de conversación antes de comparar versión y mutar. Un conflicto
retorna `success: false`, `code: CONFLICT` y control actual autorizado. No es una
API HTTP nueva: es una server action. Los DTOs se validan y descartan campos ajenos;
los errores internos no se devuelven al navegador.

| Operación  | Efecto                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Derivar    | HANDOFF sin claim; asigna al responsable sólo si sigue siendo miembro activo con manage/admin/owner. Un evento por fuente, aun con reintentos.                |
| Tomar      | ACTIVE/PAUSED/HANDOFF pendiente → HANDOFF aceptado por actor. Otro operador no puede robar un chat aceptado mediante CLAIM; debe transferirlo explícitamente. |
| Transferir | Sólo HANDOFF; destino activo autorizado del mismo tenant. Mantiene claim si ya había aceptación; un caso pendiente sigue pendiente.                           |
| Pausar     | PAUSED, sin aceptación. No elimina pedidos ni historial.                                                                                                      |
| Devolver   | ACTIVE, sin aceptación/asignado, limpia pausa/motivo y fija `automation_resumed_at`. No encola respuestas a mensajes previos.                                 |

Cada transición efectiva incrementa `control_version`, invalida
`pending_order_action`, cancela sólo outbox PENDING y agrega un evento con actor,
destino y versión. Repetir pausa, devolución ya activa o transferencia al mismo
responsable no duplica eventos. CLOSED no se reabre por estas operaciones.
Los HANDOFF históricos no se convierten en aceptados durante la migración.

La toma y la reserva automática comparten lock de conversación. Se mantiene el
orden **job → conversación → outbox**; las operaciones humanas nunca bloquean jobs
mientras mantienen la conversación. El claim de jobs y la verificación de lease
rechazan fuentes anteriores a la devolución y atención ya aceptada.

La única excepción de envío en HANDOFF es el aviso del episodio/fuente vigente,
sin claim humano ni `orderPrompt`. En Meta se usa el texto de derivación configurado
en servidor, no un texto comercial generado. El simulador conserva su deduplicación
por fuente y también bloquea la salida después de una toma.

Si la reserva SENDING ganó primero, la toma conserva el claim y devuelve
`deliveryBlock: SENDING`; no cancela un HTTP ya recibido por Meta. La devolución
rechaza tanto SENDING como UNKNOWN. La finalización existente puede registrar un
resultado conocido después de la toma. No se promete entrega exactamente una vez.
UNKNOWN no se convierte en PENDING como recuperación.

La UI conserva sus tarjetas y enlaces a pedidos/preventas; distingue asignación de
aceptación, muestra responsable y envíos sin resolver, permite tomar/transferir/
devolver y muestra sólo lectura sin manage. No se guarda contenido offline.
La UI puede quedar desactualizada entre peticiones; las versiones protegen cada
mutación y la acción revalida la ruta incluso ante conflicto.

## Acceso directo a datos

La migración revoca grants de tabla **y columna** a PUBLIC, anon y authenticated,
retira policies de miembro y mantiene RLS en las tablas internas WhatsApp, carritos,
items, jobs y runs. Service role conserva acceso. No se agrega una vista pública.
Las RPC de control y auxiliares sólo tienen EXECUTE para service role, con
`search_path = public, pg_temp`. Los callers inspeccionados de esas tablas utilizan
clientes administrativos del servidor; las lecturas de inbox ahora verifican read
antes de consultar con privilegios.

Esta decisión aplica también a usuarios lectores: reciben DTOs desde Rhinos,
no acceso REST a columnas como payloads, argumentos de herramientas o rutas Storage.
El nombre mostrado de un operador puede venir de metadata de perfil; nunca se usa
esa metadata para autorizar.

## Archivos de esta entrega

| Archivos                                                                      | Cambio                                                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261106202224_whatsapp_human_control.sql`               | Columnas y eventos; control atómico; handoff común; protecciones jobs/outbox/sandbox; grants/RLS. |
| `scripts/build-whatsapp-release-sql.mjs`                                      | Incluye la nueva migración al final del bundle transaccional.                                     |
| `src/modules/whatsapp/server/conversation-control.ts`                         | Autenticación, autorización, validación de entrada/salida y DTOs explícitos.                      |
| `src/modules/whatsapp/actions/control-whatsapp-conversation.action.ts`        | Acción pública autenticada y revalidación de ruta.                                                |
| `src/modules/whatsapp/actions/set-whatsapp-conversation-automation.action.ts` | Wrapper de la acción anterior; ahora exige versión observada.                                     |
| `src/modules/whatsapp/actions/send-whatsapp-manual-message.action.ts`         | Bloqueo del envío directo hasta la outbox humana.                                                 |
| `src/modules/whatsapp/server/commercial-tools.ts`                             | Handoff no leased mediante RPC compartida; el leased converge en SQL.                             |
| `src/modules/whatsapp/service/whatsapp-conversations.service.ts`              | Read autorizado y datos acotados de control/envío.                                                |
| `src/app/org/[orgSlug]/whatsapp/conversaciones/page.tsx`                      | Capacidades, operador actual y responsables habilitados para la bandeja.                          |
| `src/components/whatsapp/whatsapp-inbox.tsx`                                  | Controles, estados y responsables; sin compositor inseguro.                                       |
| `src/modules/whatsapp/server/simulation.ts`                                   | Versión de control en snapshot.                                                                   |
| `src/app/api/org/[orgSlug]/whatsapp/simulacion/route.ts`                      | Devolución con versión explícita; no usa RPC antigua.                                             |
| `src/components/whatsapp/whatsapp-agent-simulator.tsx`                        | Devuelve mediante acción común; actualiza versión ante conflicto.                                 |
| `src/modules/whatsapp/server/conversation-control.test.ts`                    | Frontera de sesión/permisos, IDs falsificados, DTOs seguros, conflictos y wrappers.               |
| `src/modules/whatsapp/service/whatsapp-conversations.service.test.ts`         | Lectura autorizada, aislamiento y prioridad UNKNOWN sin filtrar contenido interno.                |
| `src/modules/whatsapp/server/recurring-tools.test.ts`                         | Handoff compartido no leased y snapshot con versión.                                              |
| `scripts/fixtures/whatsapp/bootstrap.sql`                                     | Modelo mínimo de roles/permisos y perfil Auth para las pruebas descartables.                      |
| `scripts/fixtures/whatsapp/module-gates.sql`, `audio-review.sql`              | Asersiones compatibles con cierre de acceso directo; también sirven con esquema anterior.         |
| `scripts/fixtures/whatsapp/human-control.sql`                                 | Integración SQL de permisos, tenant/flags, estado, eventos, outbox y fuentes antiguas.            |
| `scripts/test-whatsapp-human-control.sh`                                      | Cluster privado descartable, upgrade y pruebas de dos sesiones más regresiones existentes.        |
| `docs/whatsapp-human-control.md`                                              | Contrato, diferencias, evidencia y límites de esta entrega.                                       |

## Evidencia local

El runner usa PostgreSQL nativo instalado, UTF-8 y un socket Unix privado sin TCP.
No lee URLs de conexión ni credenciales del proyecto. Detiene su cluster al salir.
Conserva logs en el directorio temporal anunciado.

```sh
WHATSAPP_PG_BIN=/opt/homebrew/opt/postgresql@17/bin \
  scripts/test-whatsapp-human-control.sh
node_modules/.bin/vitest run src/modules/whatsapp \
  'src/app/api/internal/whatsapp-agent/tools/[tool]/route.test.ts' \
  services/whatsapp-agent/src
services/whatsapp-agent/node_modules/.bin/tsc \
  --project services/whatsapp-agent/tsconfig.json --noEmit
services/whatsapp-agent/node_modules/.bin/tsc \
  --project services/whatsapp-agent/tsconfig.json
NODE_OPTIONS=--max-old-space-size=8192 \
  node_modules/.bin/tsc --noEmit --incremental false
```

Resultados ejecutados:

| Verificación                                  | Resultado                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runner SQL anterior                           | OK en PostgreSQL 17.11 local: upgrade desde esquema anterior, HANDOFF histórico sin aceptación inventada, revocación de grant de columna/policy amplia, dos aplicaciones del bundle, control/tenant/RBAC/flags, dos tomas con un ganador y ambas precedencias de reserva/toma. También pasaron las fixtures de gates, recurrentes, audio y audio-review, incluida recuperación de crash sin lease y upgrade con datos. |
| Vitest con el comando anterior                | **19 archivos, 206 pruebas OK**. Incluye worker y pruebas nuevas de sesión/DTO/control; no se suman las ejecuciones repetidas.                                                                                                                                                                                                                                                                                         |
| Typecheck y build del worker                  | Ambos OK. El build produce sólo el `dist` ignorado existente.                                                                                                                                                                                                                                                                                                                                                          |
| Biome sobre los 15 archivos JS/TS/TSX tocados | OK, sin diagnósticos finales.                                                                                                                                                                                                                                                                                                                                                                                          |
| Typecheck global del ERP                      | No pasa: **184 diagnósticos, idénticos a HEAD sin cambios** en un worktree temporal con las mismas dependencias y tipos de Next. Sin diagnósticos nuevos. Incluyen dependencias ausentes de Accounting/Sentry/Serwist/idb y validadores de Next que referencian una ruta inexistente.                                                                                                                                  |
| Shell/whitespace/documentación                | `bash -n`, `git diff --check` y Prettier del documento OK.                                                                                                                                                                                                                                                                                                                                                             |

Los logs de la última suite SQL quedaron en `/tmp/rhino-human-control.Lfq3bp`;
sus procesos PostgreSQL se detuvieron. La fixture ajustada de gates y la de pedidos
recurrentes también se ejecutaron sin la migración nueva, con resultado OK, para
verificar compatibilidad de los wrappers de prueba existentes.

Intentos fallidos, corregidos antes del resultado final: una aserción nueva tenía
una columna ambigua; el nuevo runner necesitaba reproducir el crash sin lease que
prepara el wrapper de audio original; y las fixtures antiguas esperaban filas
ocultas/errores de policy donde el esquema nuevo deniega el grant o afecta cero
filas. Se ajustaron esas expectativas sin habilitar acceso productivo. La primera
ejecución global de tsc agotó su heap predeterminado; se repitió con 8 GiB y se
compararon los 184 diagnósticos con el checkout original. Biome detectó cuestiones
de formato/accesibilidad/complejidad que se corrigieron y se volvieron a verificar.

No se ejecutó build global de Next/ERP, dado ese entorno de dependencias incompleto.
No usar `pnpm test` como evidencia funcional: el script raíz sólo ejecuta lint.

El esquema de prueba reconstruye WhatsApp y un modelo mínimo del RBAC con las mismas
relaciones; no es una copia integral del ERP ni incluye Auth/PostgREST. Las dos
sesiones son conexiones PostgreSQL de backend con actores distintos; la frontera de
sesión HTTP se prueba por mocks de la server action.

## Compatibilidad y límites operativos

Preparado, sin ejecutar publicación: aplicar el bundle compatible con consumidores
anteriores drenados/detenidos y actualizar el servidor de Rhinos. No dejar activa
una aplicación vieja con envío manual directo. Los consumidores v2 conservan sus
firmas de outbox/leases; un worker previo a leases que haga POST directo no puede
ser cancelado por SQL. La UI nueva requiere la migración y falla cerrada si falta.
No se habilita ningún flag como efecto de migrar.

La reversión debe bloquear nuevas intervenciones y detener consumidores; no quitar
la migración de protección, restaurar policies amplias ni volver al envío directo.
Conservar chats en atención humana, outbox e historial de eventos. No reactivar el
bot ni borrar comandos para resolver un UNKNOWN.

Pendientes reales: outbox humana/idempotencia/ventana 24 h, revisión operativa de
UNKNOWN, bandeja completa con polling/paginación/lecturas y alertas/playback. La
transcripción sigue restringida a claims ACTIVE; no se habilitó transcribir durante
atención humana. Los audios ya en curso pueden finalizar sin habilitar respuesta
comercial. No se tocó la retención.

No se ejecutaron navegador/390 px, Auth/PostgREST real, pruebas con Meta/LLM reales,
ni el recorrido end-to-end productivo. No se consultaron ni migraron bases remotas,
no se enviaron mensajes y no se desplegó.
