# RhinosApp — contexto para trabajar en este repo

Leé esto antes de tocar nada. Es la memoria del proyecto: reglas, cómo está
armado y en qué quedó cada cosa. Actualizalo cuando cierres algo importante.

## Reglas que no se rompen

- **Rama de trabajo: `feat/inteligencia-comercial`.** Todo el trabajo de IA
  Comercial (y lo que se pida en estas sesiones) va ahí.
- **NUNCA cambiar nada de `main`.** Ni commits, ni merges, ni PRs que lo toquen.
- Push siempre así: `git push origin HEAD:refs/heads/feat/inteligencia-comercial`.
- Secretos (tokens de Meta, Mercado Pago, Supabase, Resend, VAPID…): **nunca**
  por chat ni en el código. El dueño los pega directo en Vercel / Meta / MP.
- Términos y condiciones, datos de tarjeta y cambios de cuenta los hace el
  dueño, no el asistente.
- Idioma de la app y de los mensajes: español rioplatense, con voseo.

## Quién y para qué

- Dueño: Manuel "Manete" Isaac, fundador de RhinosApp SRL. Perfil no técnico:
  quiere resultados probados, explicaciones cortas y directas.
- Producto: ERP + CRM para distribuidoras de alimentos (quesos, fiambres,
  almacén). Flujo: Compra → Stock → Preventa → Venta → Despacho → Cobro.
- Diferencial: **IA Comercial** (vender más: recuperar clientes, cross-sell,
  metas, rutas, prospección) e integración con **WhatsApp**.

## Stack

- Next.js 16 (App Router, server actions, `after()`), React, TanStack Query,
  shadcn/ui, Tailwind, Phosphor icons, Recharts, Sonner.
- Supabase (Postgres + RLS + Storage). Bucket `documents`, rutas `<orgSlug>/…`.
- pnpm · Biome (complejidad cognitiva máx. 15, regex a nivel módulo, sin
  ternarios anidados) · Vitest · `tsc` con `NODE_OPTIONS=--max-old-space-size=7000`.
- Deploy en Vercel, proyecto `rhino-app-dev`. Preview de esta rama:
  https://rhino-app-dev-git-feat-inteligencia-bd522e-rhino-apps-projects.vercel.app
  (para redeployar sin cambios: commit vacío y push).
- Base de prueba de esta rama: Supabase `mzfmkptebjmporfojaei`, rama
  `feat/inteligencia-comercial`; aplica sola las migraciones de git
  (una migración ya aplicada no se vuelve a correr: hacer una nueva).
- Org de prueba: `prueba-conectando` (id `e94db657-3862-477f-9ff9-74cea7c99748`).
- `src/types/supabase.ts` está en UTF-16 y puede estar desfasado respecto de la
  base de prueba (ej.: `sales_orders.tipo_factura` no existe; usar `invoice_type`).
- `getCurrentUser()` devuelve los *claims* (usar `user.sub`, no `user.id`).
- Server actions: límite de 1 MB → archivos se suben al Storage con URL firmada
  emitida por el servidor (`createSignedUploadUrl`) y se pasa la ruta.
- El cliente admin (service role) necesita `GRANT` explícito por tabla; si da
  "permission denied", agregar migración con los grants.

## Checks antes de cada push

```
pnpm exec biome check --write <archivos>
NODE_OPTIONS=--max-old-space-size=7000 pnpm exec tsc --noEmit -p .
pnpm exec vitest run
```

## Mapa del código

- Páginas: `src/app/org/[orgSlug]/…` (ventas, compras, stock, cobranzas,
  ia-comercial, etc.). Layout de org: `src/app/org/[orgSlug]/layout.tsx`.
- Lógica: `src/modules/<módulo>/{actions,service,…}`.
- UI: `src/components/<módulo>/…`.
- Docs técnicas: `docs/*.md` (créditos, WhatsApp, factura PDF, multidepósito…).

## IA Comercial (`src/modules/commercial-ai`, `src/components/commercial-ai`)

Pantalla: IA Comercial con secciones Hoy, **RHINO**, Oportunidades, Objetivos,
Rutas, Aprendizajes, **Reportes**, Campañas, Prospectos, Clientes, Configuración.
Se puede abrir una sección o ficha por URL: `?seccion=reportes|rhino|…`,
`?cliente=ID`, `?oportunidad=ID`, `?prospecto=ID`.

- **RHINO** = el asistente (antes "Asistente"). Chat en la sección RHINO y
  **burbuja flotante abajo a la derecha en todos los módulos**
  (`components/commercial-ai/rhino/*`, montada en el layout de org). Misma
  conversación en ambos (localStorage, sincronizada). Responde con datos reales
  vía herramientas; además tiene `consultar_datos`, que usa el motor de
  reportes para cualquier dato del negocio.
- **Generador de reportes** (`modules/commercial-ai/reports/*`):
  - `catalog.ts`: 14 fuentes (ventas, ventas por producto, notas de crédito,
    mostrador, cartera, cobranzas, cuenta corriente clientes, compras, compras
    por producto, pagos y deuda con proveedores, gastos, stock, actividad) con
    dimensiones y métricas; `sanitizeSpec` valida cualquier pedido.
  - `loaders.ts`: lee con service role, **siempre** filtrando por organización
    y, si es vendedor, por su cartera. Permisos por fuente chequeados en código.
  - `aggregate.ts`/`periods.ts` puros y testeados; `templates.ts` 27 reportes
    listos; `ai-report.ts` pedido en palabras → spec y "Conclusiones de RHINO".
  - Reportes guardados: tabla `commercial_ai_saved_reports` (propios o
    compartidos). Export Excel/CSV/imprimir.
- **WhatsApp del vendedor** (`modules/commercial-ai/whatsapp/*`): consulta su
  cartera (o toda la empresa si tiene `team_view`), notas de voz, y **carga
  preventas** (`buscar_productos`, `preparar_pedido`, confirmación con "sí").
- **Créditos** (1 crédito = US$0,01 de costo nuestro): plan mensual (default
  1000) + créditos comprados que no vencen. WhatsApp 2,6 créditos/mensaje,
  audio 0,45/min, IA a costo real. Paquetes Inicial 1000 = US$38+IVA, Equipo
  5000 = US$160+IVA, Empresa 20000 = US$600+IVA, cobrados en pesos con
  Mercado Pago (Checkout Pro, webhook `/api/webhooks/mercadopago`).
  Features medidas: asistente, campana, prueba, whatsapp, audio, factura,
  reporte. Ver `docs/ia-comercial-creditos.md`.
- Modelos: Haiku por defecto; Sonnet para leer facturas
  (`COMMERCIAL_AI_INVOICE_MODEL`).

## Compras: factura del proveedor en PDF

`modules/purchases/invoice-import/*` + `components/purchases/invoice-import/*`.
Se sube el PDF (URL firmada), la IA lo lee, encuentra proveedor (CUIT/nombre) y
productos (equivalencias recordadas → código → nombre), convierte cajas/kilos,
y "Pasar a la compra" completa el formulario. Si un producto no existe se crea
desde la línea. Opcional: registrar la factura del proveedor con el PDF.
Ver `docs/compras-factura-pdf.md`.

## Pendientes / estado al 11/11/2026

- **WhatsApp caído**: venció el token de Meta. Falta token permanente del
  usuario de sistema "Rhinos Mensajeria" (Business "Rhinos App" 1301205354940425,
  app 1107856148668871) → pegarlo en Vercel `WHATSAPP_META_ACCESS_TOKEN` →
  redeploy. "Generate token" de Meta tiraba error: probar otro navegador.
- Asignar clientes (ej. Pendino) al vendedor para probar pedidos por WhatsApp.
- Mercado Pago: hoy token de prueba; falta cuenta de producción de Rhinos SRL,
  `MERCADOPAGO_WEBHOOK_SECRET` y migrar de Preferences a Orders API.
- Incluir en créditos al agente de WhatsApp de clientes.
- Facturas PDF: faltan facturas B/C (IVA incluido), notas de crédito, fotos
  JPG/PNG, dólares e IVA mezclado por línea.
- Producción: CRON_SECRET y plantilla de Meta.
