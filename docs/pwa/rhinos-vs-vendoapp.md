# Rhinos PWA frente a VendoApp: hoja de ruta

## Propósito

Comparar las capacidades públicamente descritas de VendoApp con Rhinos y
convertir los hallazgos en decisiones e incrementos implementables. VendoApp es
una referencia funcional, no un objetivo de copiar marca o interfaz. Rhinos
conserva su identidad visual y sus reglas de negocio.

Las funciones que solo se ven con una cuenta interna no se pueden confirmar con
fuentes públicas; se anotarán como hipótesis y preguntas, no como hechos.

## Estado de trabajo — 2026-11-12

La auditoría y las propuestas que siguen documentan el **punto de partida**;
no deben interpretarse como pendientes de implementación actuales. El estado
vigente de la PWA y el cotizador competitivo es:

- **Implementado:** snapshot comercial firmado (HMAC), precios por nivel y costo
  histórico cifrado; comando idempotente de cotización; cola IndexedDB y envío
  pendiente de aprobación. La aprobación sigue siendo el único paso que crea
  una preventa. El formulario de cotización se reutiliza en
  `/~offline/cotizaciones`; los productos con variantes siguen excluidos.
- **Verificado:** build de producción, tests de contratos/cola/proxy y prueba
  de navegador que instala el worker, corta la red, reinicia, navega por
  preventa y cotizaciones, guarda una cotización y la sincroniza contra una API
  *simulada*. El usuario confirmó que las pruebas funcionales y el flujo
  completo ya se realizaron y que la PWA funciona bien en iPhone. Android está
  expresamente diferido.
- **Observado en el piloto:** el usuario cotizó sin conexión, el comando se
  guardó y la cotización apareció en el listado al reconectar. Esto **no**
  equivale a una prueba completa de aprobación, concurrencia ni resiliencia
  adversarial contra la base real.
- **Operación:** para probar el shell offline se necesita `pnpm pwa:serve`, no
  `pnpm dev`. El Quick Tunnel se apagó después de la prueba: su host temporal
  deja de ser una URL reutilizable. Ver [runbook](./operations-runbook.md).

### Siguiente oportunidad sugerida: búsqueda rápida del catálogo offline

El material público de Vendo destaca carga/búsqueda rápida de catálogo y
escaneo. Rhinos ya tiene búsqueda textual y SKU en el formulario de preventa
online; el snapshot offline contiene SKU, nombre y cantidades, mientras que el
escaneo actualmente confirmado en el repositorio es del flujo POS, no de
preventa offline.

**Recomendación:** empezar con una mejora pequeña y medible de la búsqueda del
catálogo que ya se descarga —nombre, SKU/código de barras si existe en los datos
actuales, fabricante y orden de resultados— y después evaluar escaneo con la
cámara. Primero auditar si el SKU contiene de forma fiable el código escaneable;
no agregar un campo nuevo ni escaneo offline hasta comprobar la cobertura,
unicidad, permisos de cámara y comportamiento en iPhone. Los resultados deben
mostrar la fecha del snapshot y dejar claro que el stock es una referencia.

Orden sugerido, sujeto a priorización del usuario:

1. Mejorar la búsqueda offline con los campos ya disponibles y revisar tamaño y
tiempo de descarga del snapshot.
2. Probar código de barras solo si el dato existe y es consistente; fallback
   siempre por búsqueda manual/SKU.
3. Explorar una ficha/resumen offline de cliente usando únicamente datos ya
   descargados; no inferir ni inventar historial de compras.
4. Tratar rutas/visitas como discovery aparte: las hojas actuales parecen
   orientadas a entregas y no confirman una agenda comercial de vendedores.
5. Dejar cobranzas offline para más adelante por saldos cambiantes, duplicados
   y garantías financieras.

Se decidió **no** guardar formularios incompletos de cotización; solo las
solicitudes finalizadas pasan a la cola offline. La próxima tarea de código
recomendada es el punto 1; la aceptación Android no bloquea ese trabajo.

## Fuentes consultadas

- [Landing de VendoApp](https://landing.nextbyn.com/solucion-vendo)
- [Vendo de Chess Suite](https://www.nextbyn.com/chess/funcionalidades/vendo)
- [Vendo Nextbyn en Google Play](https://play.google.com/store/apps/details?id=chess.vendo&hl=es)
- [Webinar: Proceso de Alta de Clientes en Vendo](https://www.youtube.com/watch?v=fr1Qccr9pQE)

Las páginas y ficha describen rutas, geolocalización, clientes, pedidos,
cobranzas, historial, catálogo, trabajo offline, sincronización y supervisión.
El webinar localizado anuncia el flujo de alta de clientes; no se obtuvo una
transcripción completa para verificar los pasos visuales.

## Matriz comparativa inicial

| Área | Referencia pública de VendoApp | Estado inicial en Rhinos | Pendiente |
|---|---|---|---|
| Preventa offline | Pedidos y sincronización al recuperar conexión | Snapshot, borradores, cola y replay implementados | Aceptación manual en dispositivos y operación de campo |
| Datos offline | Clientes, catálogo, precios, stock e impuestos | Snapshot incluye clientes, productos, precios, cantidades e impuestos | Definir frescura y semántica de stock; validar catálogo real |
| Cotizador competitivo | No confirmado como función equivalente en las fuentes consultadas | Implementado en `solicitudes-venta`: formulario, snapshots de líneas, envío, devolución y aprobación con conversión a preventa | Dirección acordada: preparación offline y envío pendiente de aprobación; falta definir vigencia de insumos y revalidación |
| Búsqueda y escaneo | Carga rápida, búsqueda avanzada y catálogo/escaneo según material público | Escaneo existe en flujo POS; no confirmado para preventa offline | Definir UX offline y campos de búsqueda |
| Rutas de vendedores | Rutas, mapas y geolocalización de clientes | Hay hojas de ruta operativas, principalmente asociadas a entregas/ventas | Confirmar si existe agenda comercial diaria reutilizable |
| Visitas | Seguimiento y motivos de no venta | No confirmado en flujo offline revisado | Definir estados, motivos, captura y reportes |
| Contexto de cliente | Resumen, últimas compras e indicadores | El snapshot offline no contiene historial de compras | Revisar vistas online y decidir qué información aporta valor |
| Cobranzas | Cobros, anticipos, recibos y cuenta corriente | El módulo online existe; no está en la cola offline revisada | Definir alcance y garantías financieras antes de offline |
| Supervisión | Seguimiento de rutas/equipo, cobertura y desempeño | Hay capacidades operativas; no se confirmó seguimiento GPS/cobertura equivalente | Precisar necesidad, nivel de ubicación y métricas |
| Seguridad y sincronización | Material público menciona sincronización y seguridad por usuario | Partición por usuario/organización, replay y purga implementados | Completar pruebas móviles pendientes de `test-matrix.md` |

La comparación es preliminar: “no confirmado” no significa que Rhinos carezca
de esa función en toda la aplicación.

## Auditoría inicial del cotizador competitivo de Rhinos

Se revisaron las pantallas `solicitudes-venta/nueva`, listado/detalle del
vendedor y bandeja `solicitudes-venta/aprobacion`, además del formulario y la
cola de revisión:

- El formulario carga clientes, productos, niveles/listas de precio y variantes
  desde el servidor. Incluye moneda/tipo de cambio, condiciones de pago,
  comprobante, observaciones y productos/cantidades.
- Cada línea permite modalidad por competencia, porcentaje o lista; presenta
  precio base, sugerencia y precio acordado. El administrador puede aprobar o
  devolver para corrección con comentario.
- El listado permite revisar estado/detalle y cancelar solicitudes pendientes o
  devueltas. La bandeja presenta costos/margen, precios y totales; al aprobar se
  crea la preventa.
- Las pantallas crean/actualizan con Server Actions y no muestran persistencia
  local ni cola offline. La ruta de alta necesita cargar datos del servidor
  antes de montar el formulario.
- El servicio de creación vuelve a cargar desde el servidor cliente, productos,
  niveles/listas de precio y variantes; recalcula precio base, costo, impuestos
  y totales, y luego persiste snapshots vía RPC. Por eso, una futura solicitud
  offline no puede simplemente llamar a la acción actual al reconectar si debe
  conservar fielmente los valores usados sin conexión: para entonces los datos
  podrían haber cambiado.
- La aprobación pasa por la RPC `review_sales_quote_request`, que registra
  eventos y crea la preventa en la transacción de aprobación. Debemos conservar
  ese punto único de conversión y no crear preventas desde el cliente offline.
- Para reproducir el cálculo offline hay que auditar el servicio y asegurar que
  el snapshot incluya todos los insumos necesarios: niveles/listas aplicables,
  variantes activas, precios/costos, moneda y tipo de cambio, impuestos y
  condiciones de pago/comprobante.

La futura cola offline deberá conservar por línea los valores calculados y
usados al cotizar —precio base, precio competidor, precio acordado, modalidad,
descuento/ajuste, cantidad y variante— más moneda, tipo de cambio, impuestos y
referencia/versionado de los datos. Al sincronizar, se enviará como solicitud
pendiente de aprobación; **no se creará la preventa hasta la aprobación**. Falta
validar idempotencia y conflictos contra las acciones/servicios actuales antes
de diseñar el comando offline.

### Decisiones técnicas a cerrar antes de implementar

- Definir una RPC/servicio de sincronización que reciba el snapshot comercial
  capturado offline, valide identidad, organización, permisos y referencias, y
  persista la propuesta original sin sustituir precios/impuestos/tipo de cambio
  por los actuales. El servidor puede calcular y guardar diferencias actuales
  para revisión, sin alterar la propuesta.
- Incorporar una clave idempotente del comando offline a la creación atómica;
  la RPC actual de creación no recibe una clave de idempotencia del cliente.
- Determinar el comportamiento cuando el cliente, producto, variante, permiso o
  lista ya no existe/está activo al sincronizar: rechazar con estado revisable,
  sin perder el borrador local.
- Permitir el envío aunque el snapshot haya vencido mientras el vendedor estaba
  desconectado; informar su vencimiento de forma visible al vendedor y al
  aprobador. El vencimiento no omite la revalidación actual de identidad y
  permisos ni aprueba automáticamente la cotización.
- Mantener la RPC de aprobación como la única operación que genera la preventa.

### Propuesta de contrato seguro (pendiente de aprobación técnica)

La auditoría confirma que el snapshot actual solo vive en IndexedDB y el `ETag`
sirve para refrescarlo; no hay hoy una copia canónica persistida en servidor ni
una firma que permita distinguir un snapshot auténtico de uno alterado en el
dispositivo. La RPC de creación exige `service_role` y guarda los snapshots que
le entrega el servicio.

Propuesta recomendada para preservar precios offline sin confiar en valores
locales manipulables:

1. Incluir en el snapshot los insumos necesarios para cotizar offline, con un
payload versionado y `snapshotId`, usuario, organización y tiempos.
2. El servidor emite una firma HMAC versionada sobre el hash canónico del
   contenido comercial y claims de usuario, organización, versión, `snapshotId`
   y vigencia. La firma y el snapshot se almacenan juntos en IndexedDB.
3. Al sincronizar, el endpoint recibe el comando idempotente, el snapshot y la
   firma. Verifica firma e identidad/organización; una firma inválida rechaza el
   comando sin borrar el borrador.
4. El vencimiento firmado se conserva como dato de auditoría/advertencia, pero
   no bloquea por sí solo el envío de una cotización ya preparada. Se mantiene
   la retención/purga local ya configurada y se validan permisos actuales antes
   de aceptar el comando.
5. El servidor calcula o valida los precios base, descuentos/ajustes e impuestos
   usando el snapshot auténtico, y conserva los valores resultantes en la
   solicitud. Los campos ingresados por el vendedor (competencia, cantidad,
   precio acordado si corresponde) se validan contra el contrato/reglas, no se
   tratan como datos firmados por el snapshot.
6. La RPC de creación incorpora una clave idempotente única por
   usuario/organización/comando y devuelve el mismo `requestId` en un reintento.
   La aprobación existente sigue siendo la única que crea la preventa.

Esto evita persistir una copia completa de cada snapshot en tablas del servidor,
pero requiere secreto HMAC solo en servidor, serialización canónica estable,
rotación/versionado de firma y límites contra replay. Debe revisarse el impacto
de que la firma cubra campos sensibles ya presentes en el snapshot. Si no se
quiere manejar HMAC/rotación, alternativa: guardar snapshot comercial canónico
en servidor con TTL y referenciarlo por ID durante la sincronización.

**Implementación iniciada:** emisión opcional de firma HMAC con claims de
contenido/identidad/vigencia, extensión del header al 200 y al 304, persistencia
de la firma en IndexedDB y tests de manipulación/renovación. El secreto debe
configurarse antes de usar cotizaciones offline. Falta la verificación del
endpoint de sincronización, que se implementará con la cola de cotizaciones.

**Decisiones sobre costos/listas:** no exponer costo en claro al dispositivo;
el servidor firmará precios calculados por producto/nivel, mientras la solicitud
de cotización conservará el costo usado para auditoría mediante un mecanismo
que no confíe en valores editables del cliente. Si una lista asignada se
desactiva después de preparar la cotización, se acepta el precio/lista firmados
y se informa al aprobador.

## Paso a paso de trabajo

### 1. Investigación y auditoría

1. Registrar cada referencia pública con URL, fecha, evidencia y confianza.
2. Recorrer en Rhinos las pantallas y servicios de preventa, clientes, catálogo,
   cotizador competitivo, cobranzas, rutas y reportes.
3. Marcar cada capacidad como implementada, parcial, ausente, por validar o
   fuera de alcance.
4. Separar explícitamente web online, PWA instalada y operación sin conexión.

**Entregable:** matriz comparativa actualizada y preguntas abiertas.

### 2. Definiciones de negocio y seguridad

Antes de cada bloque, definir permisos, datos requeridos, frescura, persistencia,
sincronización, conflictos, retención, purga, errores y criterios de aceptación.
No agregar datos sensibles offline sin acordar aislamiento y retención.

**Entregable:** decisión aprobada, criterios y riesgos conocidos.

### 3. Priorización

Priorizar por valor para vendedores, frecuencia, esfuerzo, dependencias y riesgo.
Indicar si cada iniciativa es online, parcialmente offline u offline-first.

**Entregable:** backlog ordenado y propuesta de piloto.

### 4. Implementación incremental

Para cada iniciativa aprobada: acordar alcance; revisar reutilización de
arquitectura; implementar con permisos explícitos; agregar pruebas y actualizar
documentación; validar red, datos desactualizados, concurrencia, revocación y
reintentos; hacer aceptación manual en dispositivos antes de ampliar rollout.

### 5. Piloto y evolución

Habilitar gradualmente organizaciones elegibles, monitorear errores y uso,
recoger feedback y decidir si ampliar, corregir o revertir. Disponibilidad
técnica no significa aprobación para un rollout general.

## Trabajo que puede comenzar

Sujeto a validar requisitos con negocio, se puede iniciar auditoría/diseño de:

- Búsqueda mejorada en catálogo offline y propuesta para incluir código de
  barras en el snapshot. No habilitar escaneo offline hasta acordar UX y pruebas.
- Presentación/resumen de clientes usando solo campos ya descargados, sin
  inventar historial de compras.
- Auditoría del cotizador competitivo: flujo, fuentes autorizadas, permisos,
  uso desde la PWA y posible conversión a presupuesto/pedido. Diseñar su
  extensión offline reutilizando el patrón de preventa; no implementar cálculos
  locales ni persistencia hasta cerrar vigencia, revalidación y aprobación.
- Aceptación manual de capacidades PWA existentes según `test-matrix.md`.

Esto no autoriza ampliar rollout ni convertir nuevas funciones en offline.

## Decisiones pendientes

### Cotizador competitivo

- ¿Qué necesidad resuelve y en qué momento del flujo se usa?
- Disponibilidad offline: **acordado**, preparación sin conexión similar a
  preventa y envío pendiente de aprobación al recuperar conexión.
- ¿Qué compara y cuál es la fuente autorizada de cada dato?
- ¿El resultado se guarda, comparte, convierte en presupuesto/pedido o es solo
  consulta?
- ¿Cuál es la antigüedad máxima permitida para precios/condiciones descargados?
- ¿Qué diferencias verá el aprobador y qué opciones tendrá ante tarifa vencida
  o reglas comerciales modificadas?
- ¿Cómo se muestra la antigüedad de datos y qué roles tienen acceso?
- ¿Qué información adicional puede persistir localmente?

**Dirección acordada:** el vendedor podrá preparar la cotización competitiva
sin conexión, con un borrador/cola local similar a preventa. Conservará los
precios y condiciones descargados y usados al crearla, junto con la hora de
descarga y la versión/origen de los datos. Al recuperar conexión, se enviará
como pendiente de aprobación; sincronizar no equivale a aprobar.

**Decisión acordada sobre vencimiento:** si el snapshot vence mientras el
vendedor está sin conexión, se permite enviar la cotización al recuperar
conexión. La interfaz debe mostrar claramente que los datos usados estaban
vencidos. Esto no omite la revalidación de identidad y permisos ni garantiza la
aprobación; el administrador conserva la decisión final.

Flujo de trabajo propuesto, sujeto a esas definiciones:

1. Preparar la cotización con los datos disponibles en el snapshot local y
   mostrar claramente cuándo fueron actualizados.
2. Guardar localmente el borrador con usuario, organización, identificador
   idempotente y referencia a versión/origen, hora de descarga, precios,
   descuentos y condiciones exactas usados al cotizar.
3. Al volver la conexión, revalidar permisos y contrastar la propuesta con las
   reglas y datos comerciales vigentes, sin sobrescribir los valores originales.
4. Enviar una sola vez y crear una cotización con estado pendiente de
   aprobación; manejar reintentos y respuestas perdidas sin duplicarla.
5. Mostrar al aprobador la propuesta original y las diferencias detectadas. El
   aprobador decide aceptar, rechazar o pedir un ajuste según las reglas de
   negocio, preservando la trazabilidad.

La propuesta offline registra lo que el vendedor presentó; no garantiza que el
precio siga vigente ni que la cotización se apruebe. Si las reglas no permiten
aceptar una tarifa vencida, debe poder rechazarse o ajustarse con una razón
explícita, preservando la propuesta original. No se asume que el vendedor pueda
editarla después del envío; depende del flujo de aprobación actual.

### Rutas y visitas

- ¿Se necesita plan diario, navegación al cliente o solo registro de visita?
- ¿Qué estados y motivos de no venta requiere el negocio?
- ¿Ubicación continua, puntual al registrar visita o ninguna? Elegir la mínima
  que cumpla el objetivo.
- ¿Quién consulta cobertura y cómo se define una visita efectiva?

### Historial, cobranzas, catálogo

- ¿Qué periodo e indicadores de compras previas ayudan al vendedor y deben estar
  offline? ¿Con qué vigencia?
- ¿Se registrarán cobranzas sin conexión? ¿Qué medios y controles aplican?
- ¿Cómo resolver pagos duplicados, saldos cambiantes y respuestas perdidas?
- ¿Qué significa stock disponible, cuál es su antigüedad máxima y qué volumen de
  catálogo hay que soportar?
- ¿Se requiere escaneo con cámara, lector externo o búsqueda por SKU?

## Ida y vuelta

Al iniciar cada bloque, presentaré evidencia del código, distinguiré hechos de
supuestos y preguntaré solo las decisiones que bloqueen ese trabajo. Con las
respuestas, actualizaremos alcance, criterios y dependencias antes de
implementar. Finanzas, geolocalización y rollout amplio requieren confirmación
explícita.

## Seguimiento inicial

- Investigación pública: realizada.
- Auditoría comparativa: inicial; pantallas principales del cotizador revisadas.
  Falta contrastar snapshots con servicios de creación/aprobación y completar
  las demás brechas.
- Definiciones de negocio: pendientes.
- Funcionalidades nuevas: pendientes de priorización y alcance.
- Aceptación móvil/rollout: seguir `test-matrix.md` y el runbook.
