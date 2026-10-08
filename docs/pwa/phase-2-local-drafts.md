# Fase 2 - Borradores locales de preventa

> **Estado:** implementacion tecnica completa e integrada con la cola de Fase 3; validacion manual mobile del flujo completo pendiente.
>
> **Fecha:** 2026-09-17.

## Alcance implementado

- Ruta publica y precacheada `/~offline/preventa`.
- Seleccion de clientes existentes incluidos en el snapshot.
- Busqueda y agregado de productos sin variantes.
- Precios calculados con las mismas reglas puras que la preventa online.
- Soporte de lista general de cliente y asignaciones por proveedor.
- Impuestos por producto y fallback de impuestos predeterminados.
- Cantidades editables, subtotal, impuestos y total estimado.
- Observaciones locales.
- Autosave con debounce de 600 ms.
- Listado de multiples borradores por usuario y organizacion.
- Creacion y seleccion explicita del borrador activo.
- Recuperacion del borrador seleccionado tras cerrar la PWA.
- Eliminacion individual de borradores.
- Bloqueo de creacion cuando el snapshot esta vencido.
- Bloqueo de mezcla de monedas dentro del mismo borrador.

## Contrato

El schema ejecutable se encuentra en:

```text
src/modules/offline/contracts/offline-pre-sale-draft.ts
```

La particion incluye `ownerUserId`, `organizationId`, `snapshotId` y `schemaVersion`. El payload guarda exclusivamente datos serializables: IDs, cantidades, precio unitario, snapshots de impuestos, configuracion comercial minima y observaciones.

## IndexedDB

La base `rhinos-offline` sube a version 2 y agrega el store `drafts` con indices por propietario, organizacion y fecha de actualizacion.

Los drafts:

- Se purgan al cerrar sesion.
- Se purgan ante cambio de cuenta.
- Se purgan luego del plazo de inactividad configurado.
- Se validan con Zod antes de guardar y al recuperar.
- Al reemplazar el snapshot, el editor detecta el cambio de `snapshotId`, revalida cliente, vendedor, medio de pago y productos, y propone migrar precios, impuestos y referencias al snapshot nuevo antes de encolar.

## Limites actuales

- No crea clientes offline.
- No admite productos con variantes.
- No admite mezclar monedas.
- No confirma ventas, mueve stock, factura ni registra pagos.
- No incluye aun descuentos globales o por linea.
- La sincronizacion es foreground; no depende de Background Sync.

## Checklist manual

1. Preparar datos offline con conexion.
2. Abrir `/~offline/datos` y elegir crear borrador.
3. Crear dos borradores con clientes o productos diferentes.
4. Confirmar que ambos aparecen en `/~offline/borradores`.
5. Abrir cada borrador y verificar que conserva sus propios datos.
6. Cambiar cantidades y agregar observaciones.
7. Esperar el indicador `Guardado`.
8. Cerrar completamente la PWA.
9. Activar modo avion y volver a abrir.
10. Entrar al listado y recuperar ambos borradores con valores identicos.
11. Eliminar uno y confirmar que el otro permanece disponible.
12. Cerrar sesion con conexion y confirmar que datos y borradores fueron purgados.

## Integracion con Fase 3

El borrador genera un unico comando `preSale.create`. Se conserva mientras este pendiente, fallido o requiera revision y se elimina solo despues de un resultado exitoso. La bandeja permite revisar/editar y eliminar con confirmaciones que aclaran que una accion local no cancela trabajo ya aceptado por el servidor.
