# IA Comercial · créditos

Todo lo que nos cuesta plata en IA Comercial descuenta **créditos**.
**1 crédito = US$0,01 de costo nuestro.**

| Qué | Costo nuestro | Créditos |
| --- | --- | --- |
| Mensaje de WhatsApp que mandamos (Meta, Argentina, desde 1/10/2026) | US$0,026 | 2,6 |
| IA (Claude Haiku 5.5): costo real de cada llamada por tokens | ~US$0,0016 por llamada | ~0,16 por llamada |
| Audio transcripto (OpenAI gpt-transcribe) | US$0,0045 por minuto | 0,45 por minuto |
| **Respuesta típica por WhatsApp** (mensaje + 1 a 3 llamadas de IA) | ~US$0,03 | **~3** |

Un vendedor activo (15 respuestas por día, 24 días) usa unos **1.100 créditos por mes**.

## Saldo

- **Plan:** cada empresa tiene créditos incluidos por mes (por defecto 1.000,
  `COMMERCIAL_AI_DEFAULT_MONTHLY_CREDITS`). Se renuevan el día 1 y no se acumulan.
  Lo fija un superadmin en Admin → organización → IA. "Sin tope" mide pero no corta.
- **Comprados:** se usan cuando se acaba el plan y no vencen. Entran por
  Mercado Pago o por carga manual de un superadmin (con motivo, queda en el historial).
- **Tope por empleado** (opcional): créditos por mes por usuario.
- **Sin saldo:** la IA de la app y el asistente por WhatsApp se pausan. Por
  WhatsApp se avisa una vez cada 12 h y no se manda el resumen diario.
- **Avisos por mail** a dueños y gerentes (Resend): uno cuando queda menos del
  20 % del plan y nada comprado, y otro cuando se termina. Uno de cada por mes.

Tablas: `commercial_ai_wallets` (usado en el mes y saldo comprado),
`commercial_ai_credit_movements`, `commercial_ai_credit_purchases`,
`commercial_ai_credit_packages`; consumo en `commercial_ai_usage.credits`.
El descuento es atómico (`commercial_ai_charge_credits`) y una compra se
acredita una sola vez (`commercial_ai_add_credits`).

## Paquetes y precios

Precio en dólares + IVA, cobrado en pesos al dólar oficial del día
(dolarapi.com; respaldo `COMMERCIAL_AI_ARS_PER_USD`). Se editan en la tabla
`commercial_ai_credit_packages`.

| Paquete | Créditos | Precio | Por crédito | ≈ Respuestas |
| --- | --- | --- | --- | --- |
| Inicial | 1.000 | US$38 + IVA | US$0,038 | 333 |
| Equipo | 5.000 | US$160 + IVA | US$0,032 | 1.666 |
| Empresa | 20.000 | US$600 + IVA | US$0,030 | 6.666 |

Cómo se llegó al precio (por crédito, en pesos, dólar oficial $1.570 del 4/11/2026):

| | Inicial | Equipo | Empresa |
| --- | --- | --- | --- |
| Precio neto (sin IVA) | $59,7 | $50,2 | $47,1 |
| − Comisión Mercado Pago (6,49 % + IVA sobre el total con IVA ≈ 9,5 % del neto) | −$5,7 | −$4,8 | −$4,5 |
| − Ingresos brutos + impuesto al cheque (≈ 4,7 %) | −$2,8 | −$2,4 | −$2,2 |
| − Costo del crédito (US$0,01 al dólar tarjeta $2.041) | −$20,4 | −$20,4 | −$20,4 |
| **Margen** | **$30,8 (52 %)** | **$22,6 (45 %)** | **$20,0 (42 %)** |

Supuestos conservadores: se cobra todo mensaje de WhatsApp (en realidad hay
1.000 gratis por mes por número) y los proveedores se pagan con tarjeta al
dólar tarjeta. Si el dólar sube, el precio en pesos sube solo; si cambian las
tarifas de Meta u OpenAI, actualizar `WHATSAPP_MESSAGE_USD` / `AUDIO_MINUTE_USD`
en `src/modules/commercial-ai/credits.ts`; los de Claude están en `usage.service.ts`.

## Mercado Pago

1. El gerente elige un paquete en IA Comercial → Configuración → Créditos.
2. Se crea la compra "pendiente" y una preferencia de Checkout Pro; paga en Mercado Pago.
3. Mercado Pago avisa a `/api/webhooks/mercadopago` y vuelve a
   `/org/<org>/ia-comercial/creditos`. En los dos casos se consulta el pago a la
   API de Mercado Pago con nuestro token; si está aprobado y el monto coincide,
   se acreditan los créditos una sola vez.

Variables (Vercel):

- `MERCADOPAGO_ACCESS_TOKEN`: el access token de la cuenta de Rhinos (de prueba
  para preview, productivo para producción).
- `MERCADOPAGO_WEBHOOK_SECRET` (recomendado): la clave secreta de webhooks de la
  aplicación de Mercado Pago, para validar la firma `x-signature`.
- En preview, si está activa la "Protection Bypass for Automation" de Vercel, la
  URL de aviso lleva `x-vercel-protection-bypass` sola (`VERCEL_AUTOMATION_BYPASS_SECRET`).

Pendiente: los créditos cubren IA Comercial y el asistente del vendedor; el
agente de pedidos de clientes por WhatsApp todavía no descuenta créditos.
