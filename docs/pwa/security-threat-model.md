# Modelo de amenazas PWA offline

| Amenaza | Mitigacion actual | Riesgo residual |
|---|---|---|
| Datos de otra cuenta u organizacion | Particion por usuario/organizacion, validacion Zod y purga en logout/cambio de cuenta | Un dispositivo comprometido puede inspeccionar IndexedDB |
| Membresia revocada mientras no hay red | Snapshot con vencimiento y revalidacion fresca obligatoria al sincronizar | Datos ya descargados no se revocan remotamente sin conectividad |
| Identidad manipulada en el comando | Sesion autenticada, snapshot fresco y comparacion de actor/organizacion | Depende de proteger cookies y service role en servidor |
| Acceso directo a RPC privilegiada | Firma atomica solo para `service_role`; replay lookup usa `auth.uid()` | Grants deben verificarse despues de migrar |
| Replay o doble envio | UUID, hash, unique `(organization_id, command_id)`, transaccion y resultado durable | Clientes concurrentes aun llegan al servidor; la DB es la defensa final |
| Cambio silencioso de precio/impuesto | Comparacion con snapshot fresco y `REVIEW_REQUIRED` | Nuevos tipos de regla comercial deben incorporarse explicitamente |
| Cache autenticada expuesta | API, HTML protegido y RSC son `NetworkOnly`; endpoints usan `private, no-store` | Revisar reglas al cambiar Service Worker |
| Borrado local interpretado como cancelacion | Confirmaciones explicitas; bloqueo durante `syncing` | Una respuesta perdida puede significar que el servidor ya acepto el trabajo |
| Evento de refresh de otra cuenta | Clave y payload particionados por usuario/organizacion, schema estricto y 24 h maximo | `localStorage` no contiene payload comercial, pero revela IDs tecnicos locales |

No se almacenan tokens en el snapshot ni se registran payloads comerciales completos. El cifrado local no esta implementado; equipos compartidos o comprometidos requieren controles del dispositivo y una decision de producto adicional.
