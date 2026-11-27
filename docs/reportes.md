# Reportes independientes

La pantalla `/org/[orgSlug]/reportes` adapta el generador del PR #446 sin
depender del módulo de IA Comercial. Conserva fuentes, plantillas, constructor,
comparaciones, gráficos, exploración y exportación (Excel, CSV, impresión/PDF).
No incluye pedidos a RHINO, créditos ni envíos programados por WhatsApp.
Tampoco incluye «Actividad comercial», porque su tabla no existe en esta rama.

## Acceso

- La entrada a la pantalla y todas sus acciones requiere `organization.admin`
  o `reports.manage`. Este último se asigna manualmente desde Roles; la
  migración nueva solo lo asigna por defecto a roles `admin`, nunca a vendedores.
  Además se siguen requiriendo los permisos de lectura de cada fuente: tener
  únicamente `reports.manage` no habilita ventas ni ningún otro dato.
- Los datos se consultan en el servidor, verificando membresía activa y permisos
  actuales en cada acción. La clave de servicio nunca se entrega al navegador.
- `ventas` y `ventas_productos` muestran solo ventas con
  `sales_orders.user_id = usuario` salvo que exista `sales.read.all`,
  `sales.manage.all` u `organization.admin`. La asignación actual del cliente
  no amplía ese alcance.
- Los reportes de cobranzas y deuda de clientes requieren acceso global a
  cobranzas: el permiso `collections.read` por sí solo no basta, porque los
  importes se originan en comprobantes cuyo alcance no es equivalente a la
  cartera asignada. Las notas de crédito propias se filtran por `created_by`.
- Los datos generales de compras, finanzas y mostrador solo están disponibles
  para `organization.admin`. Los guardados compartidos se recalculan con los
  permisos de quien los abre; no contienen resultados precalculados.

## Base de datos

`supabase/migrations/20261127140000_report_saved_views.sql` crea
`report_saved_views` con RLS para informes propios y compartidos dentro de la
organización. El usuario informó que **ya la aplicó**; no se volvió a ejecutar.
`supabase/migrations/20261127150000_reports_manage_permission.sql` agrega el
permiso y cierra las políticas RLS para que los vendedores sin acceso tampoco
puedan consultar reportes guardados por fuera de la pantalla. **Esta migración
nueva no se aplicó.** Antes de hacerlo, reconciliar el historial de migraciones
duplicadas por entorno según `docs/pwa/database-migrations.md`; no usar
`supabase db push` a ciegas.
