# Cotizador general y solicitudes de venta

## Objetivo

Crear un cotizador comercial general, disponible fuera del módulo de Producción.
Un vendedor prepara una solicitud usando el precio vigente del producto o de la
lista elegida y un precio simple de competencia. Un administrador de la
organización revisa la solicitud y, al aprobarla, se crea una preventa con los
valores comerciales aprobados.

Esta funcionalidad es independiente del flujo actual de Presupuestos, que está
ligado a Producción y usa `APPROVED` como aceptación del cliente.

## Reglas acordadas

- La competencia se captura como un precio simple por producto.
- La app propone igualar el precio de competencia.
- Si el precio de competencia es menor al precio base, se guarda el porcentaje e
  importe de descuento por producto.
- Si es mayor, se guarda el precio acordado como un ajuste de precio, con 0% de
  descuento; nunca se usa un descuento negativo.
- Se conserva el precio base usado al cotizar para que futuras modificaciones de
  listas/precios no alteren solicitudes enviadas o aprobadas.
- No se exige margen mínimo. El costo y el margen son información para la
  revisión, no una regla de bloqueo.
- Las solicitudes se comparten con el cliente solo luego de la aprobación.
- Solo `organization.admin` puede aprobar.
- El administrador puede aprobar o devolver para corrección con un comentario.
- El MVP incluye cliente, productos/cantidades, vendedor, zona y segmento del
  cliente, además de los datos comerciales necesarios para generar la preventa.

## Iteraciones previstas

### Iteración 1 — Fundamentos

- Documentar estados, reglas y límites del alcance.
- Crear tablas para solicitudes y sus líneas con snapshots comerciales.
- Definir cálculo probado del precio acordado, descuento o ajuste.
- No modificar el flujo actual de Presupuestos.

### Iteración 2 — Creación por vendedor

- Agregar navegación y formulario bajo Ventas, sin guard de Producción.
- Cargar clientes, productos y precios/listas existentes.
- Permitir captura del precio competitivo y mostrar el precio propuesto,
  descuento/ajuste y totales.
- Guardar solicitud y líneas como borrador y permitir enviarla.

### Iteración 3 — Revisión administrativa

- Crear bandeja y detalle para administradores.
- Implementar aprobación y devolución con comentario e historial del revisor.
- Restringir la aprobación en la capa de servidor y en la operación de base de
  datos.

### Iteración 4 — Conversión a preventa

- Convertir una solicitud aprobada en una preventa una sola vez.
- Transferir cliente, productos, cantidades, impuestos, precios base, descuentos
  y ajustes aprobados.
- Guardar la relación entre solicitud y preventa.

### Iteración 5 — Pruebas y acabado

- Probar permisos de vendedor/administrador, ciclo de devolución, reenvío,
  aprobación, no duplicación y estabilidad de snapshots.
- Revisar visualización y exportación para la revisión comercial.

## Progreso

- [x] Reglas funcionales y flujos acordados.
- [x] Primera base de datos y cálculo probado.
- [x] Formulario del vendedor y envío atómico de solicitudes.
- [ ] Bandeja y revisión de administrador.
- [ ] Conversión segura a preventa.
- [ ] Pruebas integrales.

## Decisiones técnicas pendientes para las siguientes iteraciones

- Definir los permisos de lectura/edición de vendedores (propios o por equipo)
  usando los permisos generales de ventas existentes.
- Resolver si los datos de costo/margen solo se muestran a administradores.
- Conectar la captura de impuestos y condiciones de venta con los snapshots que
  requiere la creación de preventas.
